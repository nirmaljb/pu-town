using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace PUtown.Runtime
{
    /// <summary>Opt-in benchmark timings retain monotonic-clock stalls and distinguish focus intervals.</summary>
    public sealed class FrameTimingReport
    {
        private readonly List<double> wall = new List<double>(), reported = new List<double>();
        private readonly List<double> focused = new List<double>(), unfocused = new List<double>();
        private double previousTime;
        private bool previousFocus;
        public void Begin(double time, bool focus) { previousTime = time; previousFocus = focus; }
        public void Record(double time, double reportedMilliseconds, bool focus)
        {
            var interval = (time - previousTime) * 1000;
            if (interval > 0 && !double.IsInfinity(interval) && !double.IsNaN(interval))
            {
                wall.Add(interval); (previousFocus ? focused : unfocused).Add(interval);
            }
            if (reportedMilliseconds > 0 && !double.IsInfinity(reportedMilliseconds) && !double.IsNaN(reportedMilliseconds)) reported.Add(reportedMilliseconds);
            previousTime = time; previousFocus = focus;
        }
        public JObject Report() => new JObject
        {
            ["wallClock"] = Summary(wall), ["reported"] = Summary(reported),
            ["focused"] = Summary(focused), ["unfocused"] = Summary(unfocused)
        };
        private static JObject Summary(List<double> samples)
        {
            var sorted = samples.OrderBy(value => value).ToArray(); var elapsed = samples.Sum() / 1000;
            return new JObject
            {
                ["sampleCount"] = samples.Count, ["elapsedSeconds"] = elapsed,
                ["framesPerSecond"] = elapsed > 0 ? new JValue(samples.Count / elapsed) : JValue.CreateNull(),
                ["p50Milliseconds"] = Percentile(sorted, .50), ["p95Milliseconds"] = Percentile(sorted, .95),
                ["p99Milliseconds"] = Percentile(sorted, .99),
                ["maximumMilliseconds"] = sorted.Length == 0 ? JValue.CreateNull() : new JValue(sorted[sorted.Length - 1]),
                ["framesOver100Milliseconds"] = samples.Count(value => value > 100)
            };
        }
        private static JToken Percentile(double[] sorted, double fraction)
        {
            if (sorted.Length == 0) return JValue.CreateNull();
            var index = (sorted.Length - 1) * fraction; var lower = (int)Math.Floor(index); var upper = (int)Math.Ceiling(index);
            return new JValue(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
        }
    }
}
