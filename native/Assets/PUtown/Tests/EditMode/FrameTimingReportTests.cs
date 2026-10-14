using NUnit.Framework;
using PUtown.Runtime;

namespace PUtown.Tests
{
    public sealed class FrameTimingReportTests
    {
        [Test]
        public void ReportRetainsAStallThatUnityDeltaOmitsAndSeparatesFocus()
        {
            var timing = new FrameTimingReport(); timing.Begin(10, true);
            timing.Record(10.02, 20, true);
            timing.Record(10.52, 100, false);
            timing.Record(10.56, 40, false);
            var report = timing.Report();
            Assert.That((double)report["wallClock"]["maximumMilliseconds"], Is.EqualTo(500).Within(.001));
            Assert.That((double)report["reported"]["maximumMilliseconds"], Is.EqualTo(100).Within(.001));
            Assert.That((int)report["wallClock"]["framesOver100Milliseconds"], Is.EqualTo(1));
            Assert.That((double)report["focused"]["elapsedSeconds"], Is.EqualTo(.52).Within(.001));
            Assert.That((double)report["focused"]["framesPerSecond"], Is.EqualTo(2 / .52).Within(.001));
            Assert.That((int)report["unfocused"]["sampleCount"], Is.EqualTo(1));
        }
    }
}
