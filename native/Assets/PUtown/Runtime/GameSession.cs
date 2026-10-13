using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PUtown.Runtime
{
    public enum SessionStatus { Entry, Connecting, Active, Recovering, Failed, Leaving }
    public sealed class GameSession : IDisposable
    {
        public readonly NativeWorld World = new NativeWorld();
        public SessionStatus Status { get; private set; } = SessionStatus.Entry;
        public string Error { get; private set; }
        public string DisplayName { get; private set; } = "";
        public string RoomId { get { return recovery?.RoomId ?? World.RoomId; } }
        public string Endpoint { get; }
        public bool AssetsReady { get; set; }
        public bool SelectingCampus { get; private set; }
        public bool CanControl { get { return Status == SessionStatus.Active && AssetsReady && socket != null; } }
        // Voice revocation/admission uses transport callbacks without waiting for rendered frames.
        public event Action<ProtocolEvent> VoiceAuthorization;
        private readonly Func<IGameSocket> socketFactory;
        private readonly IRecoveryStore store;
        private readonly Func<double> now;
        private readonly ArrivalInbox inbox = new ArrivalInbox();
        private readonly TransportHealth health = new TransportHealth();
        private readonly object healthGate = new object();
        private readonly Timer timer;
        private IGameSocket socket;
        private JObject intent;
        private RecoveryIntent recovery;
        private volatile int generation;
        private int healthGeneration = -1, overflowGeneration = -1;
        private double deadline, retryAt, retryDelay = 500;
        private volatile bool disposed;

        public static double MonotonicMilliseconds() { return Stopwatch.GetTimestamp() * 1000d / Stopwatch.Frequency; }
        public GameSession(string endpoint, Func<IGameSocket> factory, IRecoveryStore store, Func<double> now = null, bool startTimer = true)
        {
            var uri = new Uri(endpoint); if (uri.Scheme != "ws" && uri.Scheme != "wss") throw new FormatException("Use a ws:// or wss:// Game endpoint.");
            Endpoint = uri.AbsoluteUri; socketFactory = factory; this.store = store; this.now = now ?? MonotonicMilliseconds;
            if (startTimer) timer = new Timer(_ => CheckTransportHealth(), null, 250, 250);
            recovery = store?.Read(Endpoint);
            if (recovery != null) { DisplayName = recovery.DisplayName; intent = recovery.Request; Status = SessionStatus.Recovering; OpenConnection(); }
        }
        public void Create(string name, bool developer = false)
        {
            if (Status != SessionStatus.Entry) return;
            DisplayName = StrictProtocol.DisplayName(name); Start(StrictProtocol.Command(developer ? "create_developer_room" : "create_room", "displayName", DisplayName));
        }
        public void Join(string roomId, string name)
        {
            if (Status != SessionStatus.Entry) return;
            DisplayName = StrictProtocol.DisplayName(name); roomId = (roomId ?? "").Trim().ToUpperInvariant();
            if (roomId.Length == 0) throw new FormatException("Enter a Room Code."); Start(StrictProtocol.Command("join_room", "roomId", roomId, "displayName", DisplayName));
        }
        public void TakeDeveloperPlayer(string roomId, string playerId)
        {
            if (Status != SessionStatus.Entry) return;
            roomId = (roomId ?? "").Trim().ToUpperInvariant(); playerId = (playerId ?? "").Trim();
            if (roomId.Length == 0 || playerId.Length == 0) throw new FormatException("Enter a Room Code and simulated Player ID.");
            Start(StrictProtocol.Command("take_developer_player", "roomId", roomId, "playerId", playerId));
        }
        public void ReleaseDeveloperPlayer()
        {
            if (Status != SessionStatus.Active) return;
            store?.Clear(); recovery = null; intent = null; Status = SessionStatus.Leaving; deadline = now() + 10000; RevokeVoice();
            _ = SendRaw(StrictProtocol.Command("developer_command", "action", "release"), generation);
        }
        private void Start(JObject request) { intent = request; Status = SessionStatus.Connecting; Error = null; deadline = now() + 10000; OpenConnection(); }
        private void OpenConnection()
        {
            if (disposed || socket != null || intent == null) return;
            var mine = ++generation; var transport = socketFactory(); socket = transport; var request = intent.ToString(Formatting.None); deadline = now() + 10000;
            transport.Received += payload => Receive(mine, payload);
            transport.Closed += (code, reason) => { if (mine == generation) RevokeVoice(); Enqueue(new InboundEvent(mine, now(), closeCode: code)); };
            _ = Connect(transport, mine, request);
        }
        private async Task Connect(IGameSocket transport, int mine, string request)
        {
            try { await transport.Connect(new Uri(Endpoint)).ConfigureAwait(false); if (mine == generation && !disposed) await transport.Send(request).ConfigureAwait(false); }
            catch (Exception e) when (e is System.Net.WebSockets.WebSocketException || e is OperationCanceledException || e is System.Net.Http.HttpRequestException || e is ObjectDisposedException)
            { Enqueue(new InboundEvent(mine, now(), closeCode: 1006)); }
        }
        private void Receive(int mine, string payload)
        {
            if (mine != generation || disposed) return;
            var arrived = now();
            ProtocolEvent message;
            try
            {
                message = StrictProtocol.Decode(payload);
            }
            catch (Exception e) when (e is FormatException || e is JsonException)
            { RevokeVoice(); Enqueue(new InboundEvent(mine, arrived, failure: "The server sent an incompatible Game message. " + e.Message)); return; }
            if (message.Type == "pong") { lock (healthGate) if (healthGeneration == mine) health.Pong(arrived); }
            if (message.Type == "voice_state" || message.Type == "voice_peers") DispatchVoice(message);
            Enqueue(new InboundEvent(mine, arrived, message));
        }
        private void Enqueue(InboundEvent item)
        {
            if (!inbox.Enqueue(item))
            {
                Interlocked.Exchange(ref overflowGeneration, item.Generation);
                RevokeVoice(); socket?.Abort();
            }
        }
        public void CheckTransportHealth(bool resume = false)
        {
            if (disposed) return;
            HealthAction action; int mine;
            lock (healthGate) { mine = healthGeneration; if (mine < 0) return; action = health.Check(now(), resume); }
            if (action == HealthAction.Ping) _ = SendRaw(StrictProtocol.Command("ping"), mine);
            else if (action == HealthAction.Failure) { RevokeVoice(); Enqueue(new InboundEvent(mine, now(), closeCode: 1006)); }
        }
        public void Resume()
        {
            CheckTransportHealth(true);
            if (Status == SessionStatus.Recovering && socket == null) retryAt = now();
        }
        /// <summary>Call once at the beginning of Update, before reconciliation or input.</summary>
        public void ApplyFrame()
        {
            if (disposed) return;
            if (Interlocked.Exchange(ref overflowGeneration, -1) == generation) Disconnect();
            while (inbox.Take(out var item))
            {
                if (item.Generation != generation) continue;
                if (item.Failure != null) { Fail(item.Failure); continue; }
                if (item.CloseCode != 0)
                {
                    if (item.CloseCode == 4001) Fail("This Membership was taken over by another application."); else Disconnect(); continue;
                }
                var message = item.Message; var d = message.Data;
                if (message.Type == "room_left") { Cancel(); continue; }
                if (message.Type == "error")
                {
                    Error = (string)d["message"];
                    SelectingCampus = false;
                    if (Status == SessionStatus.Recovering)
                    {
                        if ((string)d["code"] == "recovery_in_use") Disconnect();
                        else Fail((string)d["code"] == "room_not_found" ? "The Room is unavailable. The server may have restarted." : Error);
                        continue;
                    }
                    if (Status == SessionStatus.Connecting) { var error = Error; Cancel(); Error = error; continue; }
                }
                if (message.Type == "room_snapshot" && Status != SessionStatus.Leaving)
                {
                    var nativeCreate = (string)intent?["type"] == "create_room" || (string)intent?["type"] == "create_developer_room";
                    recovery = new RecoveryIntent(Endpoint, (string)d["roomId"], (string)d["recoveryToken"], DisplayName);
                    intent = recovery.Request; store?.Save(recovery); retryDelay = 500; Status = SessionStatus.Active; Error = null; AssetsReady = false;
                    lock (healthGate) { health.ConfirmMembership(now()); healthGeneration = generation; }
                    // Fresh native creation pins its sole supported map before fetching Room assets. Other controls wait.
                    SelectingCampus = nativeCreate && (string)d["mapId"] != "campus";
                    if (SelectingCampus) _ = SendRaw(StrictProtocol.Command("select_map", "mapId", "campus"), generation);
                }
                if (Status != SessionStatus.Leaving) World.Apply(message, item.ArrivedAt);
                if (message.Type == "room_state" && (string)d["mapId"] == "campus") SelectingCampus = false;
            }
            if ((Status == SessionStatus.Connecting || Status == SessionStatus.Leaving) && now() >= deadline)
            { var connecting = Status == SessionStatus.Connecting; Cancel(); if (connecting) Error = "Connection timed out. Please try again."; }
            if (Status == SessionStatus.Recovering)
            {
                if (socket != null && now() >= deadline) Disconnect();
                if (socket == null && now() >= retryAt) OpenConnection();
            }
        }
        private void Disconnect()
        {
            CloseConnection(); AssetsReady = false;
            if (Status == SessionStatus.Leaving) { Cancel(); return; }
            if (Status == SessionStatus.Connecting) { Cancel(); Error = "Could not connect. Please try again."; return; }
            if (Status == SessionStatus.Active) { Status = SessionStatus.Recovering; Error = null; retryDelay = 500; }
            if (Status == SessionStatus.Recovering) { retryAt = now() + retryDelay; retryDelay = Math.Min(retryDelay * 2, 5000); }
        }
        private void CloseConnection()
        {
            ++generation; lock (healthGate) healthGeneration = -1;
            var previous = socket; socket = null; previous?.Dispose(); RevokeVoice(); inbox.Clear();
        }
        private void RevokeVoice() { DispatchVoice(new ProtocolEvent(StrictProtocol.Command("voice_state", "url", null, "token", null, "canPublish", false))); }
        private void DispatchVoice(ProtocolEvent message)
        {
            var callbacks = VoiceAuthorization; if (callbacks == null) return;
            foreach (Action<ProtocolEvent> callback in callbacks.GetInvocationList())
            {
                try { callback(message); }
                catch (Exception) { /* Media failure never retires the Game transport or exposes its private grant. */ }
            }
        }
        private void Fail(string message) { CloseConnection(); store?.Clear(); intent = null; recovery = null; AssetsReady = false; Status = SessionStatus.Failed; Error = message; }
        public void Cancel() { CloseConnection(); store?.Clear(); recovery = null; intent = null; Status = SessionStatus.Entry; Error = null; AssetsReady = SelectingCampus = false; World.Clear(); }
        public void Leave()
        {
            if (Status == SessionStatus.Recovering || Status == SessionStatus.Failed)
            { var release = recovery; Cancel(); if (release != null) _ = ReleaseReservation(release); return; }
            if (Status != SessionStatus.Active) { Cancel(); return; }
            store?.Clear(); recovery = null; intent = null; Status = SessionStatus.Leaving; deadline = now() + 10000; RevokeVoice(); _ = SendRaw(StrictProtocol.Command("leave_room"), generation);
        }
        private async Task ReleaseReservation(RecoveryIntent release)
        {
            using (var transport = socketFactory())
            {
                var completion = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                transport.Received += payload =>
                {
                    try
                    {
                        var message = StrictProtocol.Decode(payload);
                        if (message.Type == "room_snapshot") _ = transport.Send(StrictProtocol.Command("leave_room").ToString(Formatting.None));
                        if (message.Type == "room_left" || message.Type == "error") completion.TrySetResult(true);
                    }
                    catch (Exception e) when (e is FormatException || e is JsonException) { completion.TrySetResult(false); }
                };
                transport.Closed += (_, __) => completion.TrySetResult(false);
                try
                {
                    var operation = ConnectRelease(transport, release, completion.Task);
                    await Task.WhenAny(operation, Task.Delay(10000)).ConfigureAwait(false);
                }
                catch (Exception e) when (e is System.Net.WebSockets.WebSocketException || e is OperationCanceledException || e is ObjectDisposedException) { }
            }
        }
        private async Task ConnectRelease(IGameSocket transport, RecoveryIntent release, Task completed)
        { await transport.Connect(new Uri(release.Endpoint)).ConfigureAwait(false); await transport.Send(release.Request.ToString(Formatting.None)).ConfigureAwait(false); await completed.ConfigureAwait(false); }
        private async Task SendRaw(JObject command, int mine)
        {
            var transport = socket; if (transport == null || mine != generation) return;
            try { await transport.Send(command.ToString(Formatting.None)).ConfigureAwait(false); }
            catch (Exception e) when (e is System.Net.WebSockets.WebSocketException || e is OperationCanceledException || e is ObjectDisposedException || e is InvalidOperationException)
            { Enqueue(new InboundEvent(mine, now(), closeCode: 1006)); }
        }
        public void Control(string type, params object[] pairs)
        {
            if (!CanControl || World.Paused && (type == "move" || type == "task_step")) return;
            var lobby = type == "set_ready" || type == "select_avatar" || type == "set_role_setup" || type == "start_game" || type == "start_practice" || type == "select_map";
            if (lobby && World.RoomPhase != "lobby" || !lobby && World.RoomPhase != "playing" && type != "developer_command") return;
            _ = SendRaw(StrictProtocol.Command(type, pairs), generation);
        }
        public void Dispose() { if (disposed) return; disposed = true; timer?.Dispose(); CloseConnection(); }
    }
}
