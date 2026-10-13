using System.Linq;
using System.Threading.Tasks;
using NUnit.Framework;
using PUtown.Runtime;

namespace PUtown.Voice.Tests
{
    public sealed class VoiceMediaBoundaryTests
    {
        private static ProtocolEvent State(string token, bool publish = true) => new ProtocolEvent(StrictProtocol.Command("voice_state", "url", token == null ? null : "/voice", "token", token, "canPublish", publish));
        private static ProtocolEvent Peers(string json) => StrictProtocol.Decode("{\"version\":1,\"type\":\"voice_peers\",\"peers\":" + json + "}");

        [Test]
        public async Task TransportRevocationSilencesAlreadyBufferedPcmWithoutAFrameAndRejectsLateConnect()
        {
            var admission = new VoiceAdmission(); admission.SetEnabled(true); admission.Apply(State("primary"));
            admission.Apply(Peers("[{\"playerId\":\"p2\",\"token\":\"listen-old\",\"gain\":0.5}]"));
            var pending = admission.Snapshot().Single(g => g.PlayerId == "p2");
            var pcm = new[] { 1f, -1f }; pending.Render(pcm); Assert.That(pcm, Is.EqualTo(new[] { .5f, -.5f }));
            await Task.Run(() => admission.Apply(Peers("[]")));
            pcm = new[] { 1f, -1f }; pending.Render(pcm);
            Assert.That(pcm, Is.EqualTo(new[] { 0f, 0f })); Assert.That(pending.Active, Is.False);
            admission.Apply(Peers("[{\"playerId\":\"p2\",\"token\":\"listen-old\",\"gain\":1}]"));
            Assert.That(admission.Snapshot().Single(g => g.PlayerId == "p2"), Is.Not.SameAs(pending));
            Assert.That(pending.Active, Is.False, "A late SDK Connect belongs to the permanently retired admission.");
        }

        [Test]
        public void GainChangesKeepOneSpeakerPathAndApplyMasterVoiceAndServerGainExactlyOnce()
        {
            var admission = new VoiceAdmission(); admission.SetEnabled(true); admission.SetVolumes(.5f, .4f); admission.Apply(State("primary"));
            admission.Apply(Peers("[{\"playerId\":\"p2\",\"token\":\"listen\",\"gain\":0.5}]"));
            var speaker = admission.Snapshot().Single(g => g.PlayerId == "p2");
            admission.Apply(Peers("[{\"playerId\":\"p2\",\"token\":\"listen\",\"gain\":0.25}]"));
            Assert.That(admission.Snapshot().Single(g => g.PlayerId == "p2"), Is.SameAs(speaker));
            var pcm = new[] { 1f }; speaker.Render(pcm); Assert.That(pcm[0], Is.EqualTo(.05f).Within(.000001f));
        }

        [Test]
        public void ClearedGrantRetiresPrimaryAndAllNinePeersAndReadonlyNeverAuthorizesCapture()
        {
            var admission = new VoiceAdmission(); admission.SetEnabled(true); admission.Apply(State("townhall", false));
            Assert.That(admission.Snapshot().Single().CanPublish, Is.False);
            admission.Apply(Peers("[" + string.Join(",", Enumerable.Range(1, 9).Select(i => "{\"playerId\":\"p" + i + "\",\"token\":\"t" + i + "\",\"gain\":1}")) + "]"));
            var old = admission.Snapshot(); Assert.That(old.Length, Is.EqualTo(10));
            admission.Apply(State(null)); Assert.That(admission.Snapshot(), Is.Empty);
            Assert.That(old.All(g => !g.Active), Is.True);
            foreach (var grant in old) { var pcm = new[] { 1f }; grant.Render(pcm); Assert.That(pcm[0], Is.Zero); }
        }

        [Test]
        public void DisableDeniesInFlightServerGrantsAndReplacementNeverReactivatesOldAudio()
        {
            var admission = new VoiceAdmission(); admission.SetEnabled(true); admission.Apply(State("old")); var old = admission.Snapshot().Single();
            admission.SetEnabled(false); admission.Apply(State("late")); Assert.That(admission.Snapshot(), Is.Empty);
            admission.SetEnabled(true); admission.Apply(State("fresh")); Assert.That(old.Active, Is.False);
            var pcm = new[] { 1f }; old.Render(pcm); Assert.That(pcm[0], Is.Zero);
        }
    }
}
