using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LiveKit;
using LiveKit.Proto;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PUtown.Runtime;
using UnityEngine;
using UnityEngine.TestTools;

namespace PUtown.Voice.IntegrationTests
{
    /// <summary>Opt-in real Java + LiveKit + pinned Unity SDK + Unity DSP test. Synthetic PCM, not microphone/headset evidence.</summary>
    public sealed class NativeGatewayVoiceTests
    {
        private readonly List<Room> rooms = new List<Room>();
        private readonly List<GameObject> objects = new List<GameObject>();
        private readonly List<ToneSource> tones = new List<ToneSource>();
        private readonly List<AudioStream> streams = new List<AudioStream>();
        private GameSession host, guest;
        private VoiceAdmission hostAdmission, guestAdmission;
        private string endpoint;

        [UnityTest]
        public IEnumerator NativeSdkReceivesAuthorizedDayAndTownhallPcmAndRevokedDayPcmStopsWithoutGameFrames()
        {
            if (Environment.GetEnvironmentVariable("PU_TOWN_NATIVE_VOICE_E2E") != "1") Assert.Ignore("Set PU_TOWN_NATIVE_VOICE_E2E=1 with local Java Developer Rooms and LiveKit running.");
            endpoint = Environment.GetEnvironmentVariable("PU_TOWN_NATIVE_VOICE_WS") ?? "ws://127.0.0.1:8080/ws/game";
            var ears = new GameObject("Voice test AudioListener"); objects.Add(ears); ears.AddComponent<AudioListener>();
            host = new GameSession(endpoint, () => new GameSocket(), null); guest = new GameSession(endpoint, () => new GameSocket(), null);
            hostAdmission = new VoiceAdmission(); guestAdmission = new VoiceAdmission(); hostAdmission.SetEnabled(true); guestAdmission.SetEnabled(true);
            host.VoiceAuthorization += e => hostAdmission.Apply(e); guest.VoiceAuthorization += e => guestAdmission.Apply(e);
            host.Create("Native voice host", true); yield return Until(() => host.Status == SessionStatus.Active, "local native Developer handshake");
            guest.Join(host.World.RoomId, "Native listener"); yield return Until(() => guest.Status == SessionStatus.Active && host.World.Players.Count == 2, "native Memberships");
            host.Control("developer_command", "action", "add_player", "displayName", "Fixture Mafia", "role", "mafia");
            yield return Until(() => host.World.Players.Count == 3, "simulated Mafia");
            host.Control("developer_command", "action", "add_player", "displayName", "Fixture Villager", "role", "villager");
            yield return Until(() => host.World.Players.Count == 4, "four Players");
            host.Control("developer_command", "action", "start"); yield return Until(() => guest.World.Phase == "role_reveal", "Game start");
            host.Control("developer_command", "action", "advance");
            yield return Until(() => host.World.Phase == "day" && guest.World.Phase == "day" && host.World.Field != null && guest.World.Field != null, "Day field snapshots");
            var own = host.World.Field["self"]; var x = (float)own["x"]; var y = (float)own["y"];
            host.Control("developer_command", "action", "teleport", "playerId", guest.World.SelfPlayerId, "x", x + 64, "y", y);
            yield return Until(() => guest.World.Field != null && Math.Abs((float)guest.World.Field["self"]["x"] - x - 64) < .1, "accepted nearby position");
            host.Control("join_voice", "round", host.World.Round); guest.Control("join_voice", "round", guest.World.Round);
            yield return Until(() => host.World.Voice != null && guest.World.VoicePeers.Count == 1, "speaker-isolated grants");
            var dayPublish = NewRoom(); yield return Connect(dayPublish, (string)host.World.Voice["token"], false);
            var guestPublish = NewRoom(); yield return Connect(guestPublish, (string)guest.World.Voice["token"], false);
            var peer = (JObject)guest.World.VoicePeers[0]; var retiredToken = (string)peer["token"];
            var dayListen = NewRoom(); var dayOutput = Receive(dayListen, guestAdmission.Snapshot().Single(g => !g.Primary));
            yield return Connect(dayListen, retiredToken, true); yield return PublishTone(dayPublish, hostAdmission.Snapshot().Single(g => g.Primary));
            yield return Until(() => dayOutput.Filter != null && dayOutput.Filter.NonzeroSamples > 1000, "native Unity DSP Day PCM", 15);
            host.Control("developer_command", "action", "teleport", "playerId", host.World.SelfPlayerId, "x", x - 100, "y", y);
            // No ApplyFrame calls: authorization callback and DSP still run, while World.VoicePeers remains old.
            var oldViewCount = guest.World.VoicePeers.Count;
            yield return Until(() => !dayOutput.Grant.Active, "transport-only movement revocation", 5, false);
            Assert.That(guest.World.VoicePeers.Count, Is.EqualTo(oldViewCount));
            yield return new WaitForSecondsRealtime(.15f); var before = dayOutput.Filter.NonzeroSamples;
            yield return new WaitForSecondsRealtime(.25f); Assert.That(dayOutput.Filter.NonzeroSamples, Is.EqualTo(before), "Revoked PCM must not pass the Unity output filter.");
            var stale = NewRoom();
            var denied = stale.Connect(Gateway(), retiredToken, new LiveKit.RoomOptions { JoinRetries = 0 }); yield return denied;
            Assert.That(denied.IsError, Is.True, "Retired listening credentials must fail at the gateway.");
            host.ApplyFrame(); guest.ApplyFrame(); host.AssetsReady = guest.AssetsReady = true;
            // The synthetic producer has the same capture retirement responsibility as the app.
            // Join it before changing phase so no queued invocation can target a retired SDK source.
            foreach (var tone in tones) tone.Stop();
            yield return DrainCapture();
            host.Control("developer_command", "action", "advance"); yield return Until(() => guest.World.Phase == "night", "Night");
            Assert.That(guestAdmission.Snapshot(), Is.Empty); Assert.That(hostAdmission.Snapshot(), Is.Empty);
            host.Control("developer_command", "action", "advance"); yield return Until(() => guest.World.Phase == "discussion", "Townhall");
            host.Control("join_voice", "round", host.World.Round); guest.Control("join_voice", "round", guest.World.Round);
            yield return Until(() => host.World.Voice != null && guest.World.Voice != null, "Townhall grants");
            var hallPublish = NewRoom(); yield return Connect(hallPublish, (string)host.World.Voice["token"], true);
            var hallListen = NewRoom(); var hallOutput = Receive(hallListen, guestAdmission.Snapshot().Single());
            yield return Connect(hallListen, (string)guest.World.Voice["token"], true); yield return PublishTone(hallPublish, hostAdmission.Snapshot().Single(g => g.Primary));
            yield return Until(() => hallOutput.Filter != null && hallOutput.Filter.NonzeroSamples > 1000, "native Unity DSP Townhall PCM", 15);
            host.Control("developer_command", "action", "status", "playerId", guest.World.SelfPlayerId, "living", false);
            yield return Until(() => (string)guest.World.Self["status"] == "eliminated", "Elimination");
            guest.Control("join_voice", "round", guest.World.Round);
            yield return Until(() => guest.World.Voice != null && !(bool)guest.World.Voice["canPublish"], "read-only Townhall grant");
            Assert.That(guestAdmission.Snapshot().Single().CanPublish, Is.False);
            Debug.Log("Native voice media evidence: official Unity SDK gateway Day/Townhall PCM, independent movement revocation, stale-token refusal, Night silence and eliminated read-only grant passed. Synthetic source; audible microphone/headset acceptance remains separate.");
        }
        private Room NewRoom() { var room = new Room(); rooms.Add(room); return room; }
        private string Gateway() => new UriBuilder(new Uri(endpoint)) { Path = "/voice", Query = "" }.Uri.AbsoluteUri;
        private IEnumerator Connect(Room room, string token, bool subscribe)
        {
            var connect = room.Connect(Gateway(), token, new LiveKit.RoomOptions { AutoSubscribe = subscribe, JoinRetries = 0 });
            yield return connect; Assert.That(connect.IsError, Is.False, "Official SDK gateway connection failed.");
        }
        private Output Receive(Room room, VoiceGrant grant)
        {
            var output = new Output { Grant = grant };
            room.TrackSubscribed += (track, publication, participant) =>
            {
                if (!(track is RemoteAudioTrack audio) || !grant.Active || output.Stream != null) return;
                if (!grant.Primary && participant.Name != grant.PlayerId) return;
                var go = new GameObject("Native SDK PCM receiver"); objects.Add(go); var source = go.AddComponent<AudioSource>(); source.playOnAwake = false; source.volume = 1;
                output.Stream = new AudioStream(audio, source); streams.Add(output.Stream); output.Filter = go.AddComponent<AuthorizedVoiceFilter>(); output.Filter.Grant = grant;
            };
            return output;
        }
        private IEnumerator PublishTone(Room room, VoiceGrant grant)
        {
            var tone = new ToneSource(grant); tones.Add(tone); room.Disconnected += _ => tone.Stop();
            var track = LocalAudioTrack.CreateAudioTrack("microphone", tone, room);
            var publication = room.LocalParticipant.PublishTrack(track, new TrackPublishOptions { Source = TrackSource.SourceMicrophone });
            yield return publication; Assert.That(publication.IsError, Is.False, "Native audio-only publication failed."); tone.Start();
        }
        private IEnumerator Until(Func<bool> condition, string boundary, float seconds = 10, bool frames = true)
        {
            var end = Time.realtimeSinceStartup + seconds;
            while (!condition() && Time.realtimeSinceStartup < end)
            {
                if (frames) { host?.ApplyFrame(); guest?.ApplyFrame(); if (host != null) host.AssetsReady = true; if (guest != null) guest.AssetsReady = true; }
                yield return null;
            }
            Assert.That(condition(), Is.True, "Timed out at " + boundary);
        }
        [UnityTearDown]
        public IEnumerator Cleanup()
        {
            LogAssert.ignoreFailingMessages = false; hostAdmission?.Revoke(); guestAdmission?.Revoke();
            foreach (var tone in tones) tone.Stop();
            yield return DrainCapture();
            foreach (var tone in tones) tone.Dispose(); foreach (var stream in streams) stream.Dispose(); foreach (var room in rooms) room.Disconnect();
            host?.Leave(); guest?.Leave(); yield return new WaitForSecondsRealtime(.1f); host?.Dispose(); guest?.Dispose();
            foreach (var go in objects) if (go != null) UnityEngine.Object.Destroy(go);
            tones.Clear(); streams.Clear(); rooms.Clear(); objects.Clear();
        }
        private IEnumerator DrainCapture()
        {
            yield return Until(() => tones.All(tone => tone.PumpStopped), "synthetic capture pump shutdown", 1, false);
            Assert.That(tones.All(tone => !tone.PumpFaulted), Is.True, "Synthetic capture failed before shutdown.");
            // Preserve the source handle for queued native 10 ms capture completions while Unity
            // dispatches their callbacks. Stopping production is distinct from disposing its handle.
            yield return new WaitForSecondsRealtime(.05f);
        }
        private sealed class Output { public VoiceGrant Grant; public AudioStream Stream; public AuthorizedVoiceFilter Filter; }
        private sealed class ToneSource : RtcAudioSource
        {
            public override event Action<float[], int, int> AudioRead;
            private readonly CancellationTokenSource stop = new CancellationTokenSource();
            private readonly object captureGate = new object();
            private readonly VoiceGrant grant;
            private Task pump;
            public bool PumpStopped => pump == null || pump.IsCompleted;
            public bool PumpFaulted => pump?.IsFaulted ?? false;
            public ToneSource(VoiceGrant grant) : base(RtcAudioSourceType.AudioSourceMicrophone, 48000, 1) { this.grant = grant; }
            public override void Start()
            {
                lock (captureGate)
                {
                    if (pump != null || stop.IsCancellationRequested || !grant.Active) return;
                    base.Start(); pump = Pump();
                }
            }
            private async Task Pump()
            {
                var samples = new float[480]; for (var i = 0; i < samples.Length; ++i) samples[i] = .15f * (float)Math.Sin(i * Math.PI * 2 * 400 / 48000);
                try
                {
                    while (!stop.IsCancellationRequested)
                    {
                        lock (captureGate)
                        {
                            if (stop.IsCancellationRequested || !grant.Active) break;
                            AudioRead?.Invoke(samples, 1, 48000);
                        }
                        await Task.Delay(10, stop.Token).ConfigureAwait(false);
                    }
                }
                catch (OperationCanceledException) { }
                finally { Stop(); }
            }
            public override void Stop()
            {
                lock (captureGate) { SetMute(true); stop.Cancel(); base.Stop(); }
            }
        }
    }
}
