using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LiveKit;
using LiveKit.Proto;
using PUtown.Runtime;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace PUtown.Voice
{
    [DefaultExecutionOrder(-900)]
    public sealed class NativeVoiceClient : MonoBehaviour, INativeVoiceControls
    {
        private NativeGameClient client;
        private GameSession session;
        private readonly VoiceAdmission admission = new VoiceAdmission();
        private readonly Dictionary<VoiceGrant, MediaSession> media = new Dictionary<VoiceGrant, MediaSession>();
        private AudioListener listener;
        private MicrophoneSource microphone;
        private volatile bool optedIn, muted = true;
        private bool inputAllowed = true, disposed, permissionPending, noiseSuppression;
        private string membership, requestedPhase, microphoneError;
        private double requestAt, retryAt, nextDeviceCheck;
        private int recoveryRevision, attempts, pendingConnects;
        private bool wasRecovering;

        public bool Enabled => optedIn;
        public bool Muted => muted;
        public bool PushToTalk => NativePreferences.PushToTalk;
        public string MicrophoneDevice => NativePreferences.MicrophoneDevice;
        public string[] MicrophoneDevices => Microphone.devices;
        public string Status { get; private set; } = "Voice off";
        public int ActiveMediaSessions => media.Count(pair => pair.Key.Active && pair.Value.Room.IsConnected);
        public int RemoteAudioPaths => media.Values.Sum(value => value.Playback.Count);
        public int PendingConnections => Volatile.Read(ref pendingConnects);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Install()
        {
            Attach(); SceneManager.sceneLoaded -= SceneLoaded; SceneManager.sceneLoaded += SceneLoaded;
        }
        private static void SceneLoaded(Scene _, LoadSceneMode __) => Attach();
        private static void Attach()
        {
            var host = FindAnyObjectByType<NativeGameClient>();
            if (host != null && host.GetComponent<NativeVoiceClient>() == null) host.gameObject.AddComponent<NativeVoiceClient>();
        }
        private void Start()
        {
            client = GetComponent<NativeGameClient>(); session = client?.Session;
            if (session == null) { enabled = false; return; }
            client.VoiceControls = this; session.VoiceAuthorization += Authorization;
            NativePreferences.Changed += PreferencesChanged; noiseSuppression = NativePreferences.NoiseSuppression;
            AudioSettings.OnAudioConfigurationChanged += AudioConfigurationChanged;
            // Hearing follows the Avatar, not the elevated follow camera. Keep exactly one active listener.
            foreach (var existing in FindObjectsByType<AudioListener>()) existing.enabled = false;
            var ears = new GameObject("Player Avatar voice listener"); ears.transform.SetParent(transform, false); listener = ears.AddComponent<AudioListener>();
            SetVolumes(NativePreferences.Volume("master"), NativePreferences.Volume("voice"));
        }
        private void Authorization(ProtocolEvent message)
        {
            // GameSession calls this on the transport thread, before enqueuing presentation.
            if (admission.Apply(message))
            {
                muted = true;
                // RtcAudioSource.SetMute only writes its volatile capture gate; no Unity or signaling call.
                Volatile.Read(ref microphone)?.SetMute(true);
            }
        }
        private void Update()
        {
            if (session == null || disposed) return;
            var world = session.World; var now = GameSession.MonotonicMilliseconds();
            if (session.Status == SessionStatus.Recovering)
            {
                if (!wasRecovering) { ++recoveryRevision; muted = true; requestedPhase = null; }
                wasRecovering = true;
            }
            else if (session.Status == SessionStatus.Active) wasRecovering = false;
            else if (session.Status == SessionStatus.Entry || session.Status == SessionStatus.Failed || session.Status == SessionStatus.Leaving)
            {
                if (optedIn) SetEnabled(false); membership = null;
            }
            if (membership != null && world.RoomId != null && membership != world.RoomId) SetEnabled(false);
            if (optedIn && membership == null) membership = world.RoomId;
            var alive = (string)world.Self?["status"] == "living";
            var available = world.Phase == "discussion" || world.Phase == "voting" || world.Phase == "day" && alive;
            var phaseKey = world.RoomId + ":" + world.Round + ":" + (world.Phase == "day" ? "day" : "townhall") + ":" + recoveryRevision;
            var desired = admission.Snapshot();
            foreach (var pair in media.ToArray())
            {
                if (!pair.Key.Active || !optedIn) { Close(pair.Value); media.Remove(pair.Key); }
            }
            foreach (var grant in desired)
            {
                if (!grant.Active || media.ContainsKey(grant) || ActiveMediaSessions + PendingConnections >= 10) continue;
                var connected = new MediaSession(grant); media.Add(grant, connected); _ = Connect(connected);
            }
            if (optedIn && available && session.CanControl)
            {
                var admitted = desired.Any(grant => grant.Primary && grant.Active);
                if (requestedPhase != phaseKey || !admitted && now >= requestAt + 10000 && now >= retryAt)
                {
                    requestedPhase = phaseKey; requestAt = now; retryAt = now + Math.Min(15000, 1000 * Math.Pow(2, Math.Min(attempts++, 4)));
                    session.Control("join_voice", "round", world.Round);
                }
                if (admitted) attempts = 0;
            }
            else if (!available) requestedPhase = null;
            foreach (var connection in media.Values)
            {
                foreach (var output in connection.Playback.Values)
                {
                    if (world.Phase == "day")
                    {
                        var entry = ((Newtonsoft.Json.Linq.JArray)world.Field?["players"])?.FirstOrDefault(p => (string)p["playerId"] == output.PlayerId);
                        if (entry != null) output.Source.transform.position = client.Town.ToWorld((float)entry["x"], (float)entry["y"]);
                    }
                    output.Source.spatialBlend = world.Phase == "day" ? 1 : 0;
                }
            }
            var publisher = media.Values.FirstOrDefault(m => m.Grant.Primary && m.Grant.Active && m.Grant.CanPublish && m.Room.IsConnected);
            if (publisher?.Capture != null && now >= nextDeviceCheck)
            {
                nextDeviceCheck = now + 2000;
                if (Microphone.devices.Length == 0 || !string.IsNullOrEmpty(MicrophoneDevice) && !Microphone.devices.Contains(MicrophoneDevice))
                {
                    muted = true; publisher.Capture.SetMute(true); admission.Revoke(); requestedPhase = null;
                    microphoneError = "Microphone disconnected · choose a device";
                }
            }
            if (publisher != null && !muted && !permissionPending && microphoneError == null && publisher.Capture == null && !publisher.Publishing)
            {
                if (!Application.HasUserAuthorization(UserAuthorization.Microphone)) _ = RequestMicrophone();
                else _ = PublishMicrophone(publisher);
            }
            var talk = !muted && inputAllowed && Application.isFocused && (!PushToTalk || Input.GetKey(NativePreferences.TalkKey));
            foreach (var connection in media.Values)
            {
                var capture = connection.Capture;
                if (capture == null) continue;
                var denied = !talk || !connection.Grant.Active || !connection.Grant.CanPublish;
                capture.SetMute(denied);
                if (!denied && !connection.CaptureStarted && !connection.Publishing)
                { capture.Start(); connection.CaptureStarted = true; }
                if (connection.Track != null && connection.Room.IsConnected && connection.SignaledMute != denied)
                { ((ILocalTrack)connection.Track).SetMute(denied); connection.SignaledMute = denied; }
            }
            if (!optedIn) Status = "Voice off";
            else if (session.Status == SessionStatus.Recovering) Status = "Voice paused during recovery";
            else if (!available) Status = "Voice silent in this phase";
            else if (microphoneError != null) Status = microphoneError;
            else if (permissionPending) Status = "Waiting for microphone permission";
            else if (!desired.Any(grant => grant.Primary && grant.Active)) Status = "Requesting voice access";
            else if (!media.Values.Any(m => m.Grant.Primary && m.Room.IsConnected)) Status = "Connecting voice";
            else if (!desired.Any(grant => grant.Primary && grant.CanPublish)) Status = "Listening only";
            else if (muted) Status = "Listening · microphone muted";
            else if (publisher?.Capture == null) Status = "Starting microphone";
            else Status = talk ? "Microphone open" : "Listening · push to talk";
        }
        private async Task Connect(MediaSession connection)
        {
            var room = connection.Room; var grant = connection.Grant;
            room.Connected += _ => { if (!grant.Active || disposed || !optedIn) room.Disconnect(); };
            room.TrackSubscribed += (track, publication, participant) => Subscribe(connection, track, participant);
            room.TrackUnsubscribed += (track, publication, participant) => RemovePlayback(connection, participant.Name, track.Sid);
            room.Disconnected += _ => { DisposeMedia(connection); if (grant.Active && !disposed) MediaFailure(connection); };
            Interlocked.Increment(ref pendingConnects);
            try
            {
                var address = new UriBuilder(new Uri(session.Endpoint)) { Path = "/voice", Query = "", Fragment = "" }.Uri.AbsoluteUri;
                var connect = room.Connect(address, grant.Token, new LiveKit.RoomOptions { AutoSubscribe = !grant.Primary || session.World.Phase != "day", JoinRetries = 0 });
                await connect;
                // Disconnect while Connect is pending is a documented SDK no-op. Completion MUST stay observed.
                if (connect.IsError || !grant.Active || disposed || !optedIn) { Close(connection); if (connect.IsError && grant.Active) MediaFailure(connection); return; }
            }
            catch (Exception) { Close(connection); if (grant.Active) MediaFailure(connection); }
            finally { Interlocked.Decrement(ref pendingConnects); }
        }
        private void MediaFailure(MediaSession connection)
        {
            admission.Revoke(); muted = true; Volatile.Read(ref microphone)?.SetMute(true);
            requestAt = 0; retryAt = GameSession.MonotonicMilliseconds() + 1000; microphoneError = null;
        }
        private void Subscribe(MediaSession connection, IRemoteTrack track, RemoteParticipant participant)
        {
            var grant = connection.Grant; var id = participant.Name;
            if (!grant.Active || disposed || !optedIn || !(track is RemoteAudioTrack audio) || string.IsNullOrEmpty(id)) { track.SetEnabled(false); return; }
            if (!grant.Primary && id != grant.PlayerId) { track.SetEnabled(false); return; }
            // One output per named speaker, even if an SDK republishes a microphone track.
            if (connection.Playback.ContainsKey(id)) { track.SetEnabled(false); return; }
            var go = new GameObject("Authorized Player voice"); go.transform.SetParent(transform, false);
            var source = go.AddComponent<AudioSource>(); source.playOnAwake = false; source.volume = 1; source.loop = true;
            source.dopplerLevel = 0; source.spatialBlend = grant.Primary ? 0 : 1; source.minDistance = .01f; source.maxDistance = 10000;
            source.rolloffMode = AudioRolloffMode.Custom; source.SetCustomCurve(AudioSourceCurveType.CustomRolloff, AnimationCurve.Constant(0, 1, 1));
            source.reverbZoneMix = 0; source.bypassReverbZones = true;
            var playback = new RemotePlayback(grant, id, track.Sid, source, new AudioStream(audio, source));
            connection.Playback.Add(id, playback);
            if (!grant.Active) playback.Dispose();
        }
        private static void RemovePlayback(MediaSession connection, string id, string sid)
        {
            if (id != null && connection.Playback.TryGetValue(id, out var output) && output.TrackSid == sid) { output.Dispose(); connection.Playback.Remove(id); }
        }
        private async Task RequestMicrophone()
        {
            permissionPending = true;
            var request = Application.RequestUserAuthorization(UserAuthorization.Microphone);
            while (!request.isDone && !disposed) await Task.Yield();
            permissionPending = false;
            if (!Application.HasUserAuthorization(UserAuthorization.Microphone)) { muted = true; microphoneError = "Microphone permission denied · listening continues"; }
        }
        private async Task PublishMicrophone(MediaSession connection)
        {
            connection.Publishing = true;
            try
            {
                if (!connection.Grant.Active || !connection.Grant.CanPublish || disposed) return;
                if (Microphone.devices.Length == 0) { muted = true; microphoneError = "No microphone device · listening continues"; return; }
                var selected = MicrophoneDevice;
                if (!string.IsNullOrEmpty(selected) && !Microphone.devices.Contains(selected)) { muted = true; microphoneError = "Selected microphone disconnected · choose a device"; return; }
                var go = new GameObject("Local microphone capture"); go.transform.SetParent(transform, false); connection.CaptureObject = go;
                var processing = AudioProcessingOptions.Default; processing.NoiseSuppression = NativePreferences.NoiseSuppression;
                var capture = new MicrophoneSource(string.IsNullOrEmpty(selected) ? null : selected, go, processing);
                capture.SetMute(true); connection.Capture = capture; Volatile.Write(ref microphone, capture);
                var track = LocalAudioTrack.CreateAudioTrack("microphone", capture, connection.Room); connection.Track = track;
                ((ILocalTrack)track).SetMute(true); connection.SignaledMute = true;
                var publish = connection.Room.LocalParticipant.PublishTrack(track, new TrackPublishOptions { Source = TrackSource.SourceMicrophone });
                await publish;
                if (publish.IsError || !connection.Grant.Active || disposed || !optedIn)
                { Close(connection); if (publish.IsError && connection.Grant.Active) MediaFailure(connection); return; }
                if (!muted) { capture.Start(); connection.CaptureStarted = true; }
                if (!capture.AudioProcessingEnabled) microphoneError = "Microphone processing unavailable · use a headset";
            }
            catch (Exception) { muted = true; microphoneError = "Microphone unavailable · listening continues"; DisposeCapture(connection); }
            finally { connection.Publishing = false; }
        }
        private static void DisposeCapture(MediaSession connection)
        {
            connection.Capture?.SetMute(true); connection.Capture?.Dispose(); connection.Capture = null;
            connection.CaptureStarted = false;
            // A track created before a failed/pending Publish is not yet held by Room's publication collection.
            connection.Track?.Handle.Dispose(); connection.Track = null;
            if (connection.CaptureObject != null) Destroy(connection.CaptureObject); connection.CaptureObject = null;
        }
        private void DisposeMedia(MediaSession connection)
        {
            foreach (var output in connection.Playback.Values) output.Dispose(); connection.Playback.Clear();
            if (ReferenceEquals(Volatile.Read(ref microphone), connection.Capture)) Volatile.Write(ref microphone, null);
            DisposeCapture(connection);
        }
        private void Close(MediaSession connection) { DisposeMedia(connection); connection.Room.Disconnect(); connection.Room.Dispose(); }
        public void SetEnabled(bool value)
        {
            if (value == optedIn) return;
            optedIn = value; muted = true; microphoneError = null; requestedPhase = null; attempts = 0; requestAt = retryAt = 0;
            admission.SetEnabled(value); Volatile.Read(ref microphone)?.SetMute(true);
            if (!value) { session?.Control("leave_voice"); membership = null; }
            else membership = session?.World.RoomId;
        }
        public void SetMuted(bool value) { muted = value; microphoneError = null; Volatile.Read(ref microphone)?.SetMute(true); }
        public void SetPushToTalk(bool value) { NativePreferences.PushToTalk = value; Volatile.Read(ref microphone)?.SetMute(true); }
        public void SetMicrophoneDevice(string value) { NativePreferences.MicrophoneDevice = value ?? ""; RestartCapture(); }
        public void SetVolumes(float master, float voice) => admission.SetVolumes(master, voice);
        public void SetInputAllowed(bool value) { inputAllowed = value; if (!value) Volatile.Read(ref microphone)?.SetMute(true); }
        public void SetListenerPose(Vector3 position, Quaternion rotation) { if (listener != null) { listener.transform.position = position + Vector3.up * 1.55f; listener.transform.rotation = rotation; } }
        private void RestartCapture() { muted = true; admission.Revoke(); Volatile.Read(ref microphone)?.SetMute(true); requestedPhase = null; microphoneError = null; }
        private void AudioConfigurationChanged(bool _) => RestartCapture();
        private void PreferencesChanged() { if (noiseSuppression != NativePreferences.NoiseSuppression) { noiseSuppression = NativePreferences.NoiseSuppression; RestartCapture(); } }
        private void OnApplicationFocus(bool focus) { if (!focus) { muted = true; SetInputAllowed(false); } }
        private void OnApplicationPause(bool paused) { if (paused) { muted = true; SetInputAllowed(false); } }
        private void OnDestroy()
        {
            disposed = true; admission.SetEnabled(false); Volatile.Read(ref microphone)?.SetMute(true);
            if (session != null) session.VoiceAuthorization -= Authorization; NativePreferences.Changed -= PreferencesChanged;
            AudioSettings.OnAudioConfigurationChanged -= AudioConfigurationChanged;
            foreach (var connection in media.Values) Close(connection); media.Clear();
            if (client != null && ReferenceEquals(client.VoiceControls, this)) client.VoiceControls = null;
            if (listener != null) Destroy(listener.gameObject);
        }
        private sealed class MediaSession
        {
            public readonly VoiceGrant Grant;
            public readonly Room Room = new Room();
            public readonly Dictionary<string, RemotePlayback> Playback = new Dictionary<string, RemotePlayback>();
            public MicrophoneSource Capture;
            public GameObject CaptureObject;
            public LocalAudioTrack Track;
            public bool Publishing, CaptureStarted, SignaledMute = true;
            public MediaSession(VoiceGrant grant) { Grant = grant; }
        }
        private sealed class RemotePlayback : IDisposable
        {
            public readonly string PlayerId, TrackSid;
            public readonly AudioSource Source;
            private readonly VoiceGrant grant;
            private readonly AudioStream stream;
            private AuthorizedVoiceFilter filter;
            private bool disposed;
            public RemotePlayback(VoiceGrant grant, string id, string sid, AudioSource source, AudioStream stream)
            {
                this.grant = grant; PlayerId = id; TrackSid = sid; Source = source; this.stream = stream;
                AppendFilter(); AudioSettings.OnAudioConfigurationChanged += DeviceChanged;
            }
            private void AppendFilter() { filter = Source.gameObject.AddComponent<AuthorizedVoiceFilter>(); filter.Grant = grant; }
            private void DeviceChanged(bool _)
            {
                if (disposed) return;
                // LiveKit re-appends its AudioProbe on a device switch. Re-append our gate after it.
                filter.StopAdmission(); DestroyImmediate(filter); AppendFilter();
            }
            public void Dispose()
            {
                if (disposed) return; disposed = true; filter.StopAdmission(); AudioSettings.OnAudioConfigurationChanged -= DeviceChanged;
                stream.Dispose(); if (Source != null) Destroy(Source.gameObject);
            }
        }
    }
}
