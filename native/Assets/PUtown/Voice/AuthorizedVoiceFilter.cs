using System;
using System.Threading;
using UnityEngine;

namespace PUtown.Voice
{
    /// <summary>Installed after LiveKit's PCM producer in Unity's component-ordered DSP chain.</summary>
    public sealed class AuthorizedVoiceFilter : MonoBehaviour
    {
        public VoiceGrant Grant { get; set; }
        private int stopped;
        private long blocks, nonzeroSamples;
        public long Blocks => Interlocked.Read(ref blocks);
        public long NonzeroSamples => Interlocked.Read(ref nonzeroSamples);
        public void StopAdmission() { Interlocked.Exchange(ref stopped, 1); }
        private void OnAudioFilterRead(float[] data, int channels)
        {
            var grant = Grant;
            if (Volatile.Read(ref stopped) != 0 || grant == null) Array.Clear(data, 0, data.Length);
            else grant.Render(data);
            Interlocked.Increment(ref blocks);
            long nonzero = 0; foreach (var value in data) if (Math.Abs(value) > .0001f) ++nonzero;
            Interlocked.Add(ref nonzeroSamples, nonzero);
        }
    }
}
