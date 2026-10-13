using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Newtonsoft.Json.Linq;
using PUtown.Runtime;

namespace PUtown.Voice
{
    /// <summary>The transport and DSP threads share admission, never rendered Game state or Unity objects.</summary>
    public sealed class VoiceAdmission
    {
        private readonly object gate = new object();
        private readonly Dictionary<string, VoiceGrant> peers = new Dictionary<string, VoiceGrant>();
        private VoiceGrant primary;
        private bool enabled;
        private float volume = 1;

        public void SetEnabled(bool value) { lock (gate) { enabled = value; if (!value) Clear(); } }
        public void SetVolumes(float master, float voice) { Volatile.Write(ref volume, Clamp(master) * Clamp(voice)); }
        private static float Clamp(float value) => float.IsNaN(value) ? 0 : Math.Max(0, Math.Min(1, value));

        /// <returns>True when capture authority changed and the microphone must be muted immediately.</returns>
        public bool Apply(ProtocolEvent message)
        {
            lock (gate)
            {
                if (!enabled) return false;
                var d = message.Data;
                if (message.Type == "voice_state")
                {
                    var token = (string)d["token"];
                    if (token == null) { Clear(); return true; }
                    var publish = (bool)d["canPublish"];
                    if (primary != null && primary.Token == token && primary.CanPublish == publish) return false;
                    Clear(); primary = new VoiceGrant(this, null, token, publish, 1); return true;
                }
                if (message.Type != "voice_peers" || primary == null) return false;
                var retained = new HashSet<string>();
                foreach (var p in (JArray)d["peers"])
                {
                    var id = (string)p["playerId"]; var token = (string)p["token"]; var gain = (float)p["gain"]; retained.Add(id);
                    if (peers.TryGetValue(id, out var previous) && previous.Token == token) previous.Gain = gain;
                    else { previous?.Revoke(); peers[id] = new VoiceGrant(this, id, token, false, gain); }
                }
                foreach (var id in peers.Keys.Where(id => !retained.Contains(id)).ToArray()) { peers[id].Revoke(); peers.Remove(id); }
                return false;
            }
        }
        private void Clear() { primary?.Revoke(); primary = null; foreach (var p in peers.Values) p.Revoke(); peers.Clear(); }
        public void Revoke() { lock (gate) Clear(); }
        public VoiceGrant[] Snapshot() { lock (gate) return primary == null ? Array.Empty<VoiceGrant>() : new[] { primary }.Concat(peers.Values).ToArray(); }
        internal float Volume => Volatile.Read(ref volume);
    }

    /// <summary>A retired instance can never be admitted again, even if a late SDK connection succeeds.</summary>
    public sealed class VoiceGrant
    {
        private readonly VoiceAdmission owner;
        private int active = 1;
        private float gain;
        public string PlayerId { get; }
        // Private credentials exist only in memory and are never included in status or diagnostics.
        internal string Token { get; }
        public bool CanPublish { get; }
        public bool Active => Volatile.Read(ref active) != 0;
        public bool Primary => PlayerId == null;
        public float Gain { get => Volatile.Read(ref gain); internal set => Volatile.Write(ref gain, value); }
        internal VoiceGrant(VoiceAdmission owner, string playerId, string token, bool publish, float gain)
        { this.owner = owner; PlayerId = playerId; Token = token; CanPublish = publish; this.gain = gain; }
        public void Revoke() { Interlocked.Exchange(ref active, 0); }
        public void Render(float[] pcm)
        {
            var amplitude = Active ? Gain * owner.Volume : 0;
            if (amplitude <= 0) { Array.Clear(pcm, 0, pcm.Length); return; }
            for (var i = 0; i < pcm.Length; ++i) pcm[i] *= amplitude;
            // An event arriving during this block wins before the block leaves the filter.
            if (!Active) Array.Clear(pcm, 0, pcm.Length);
        }
    }
}
