using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Profiling;

namespace PUtown.Runtime
{
    /// <summary>Opt-in observations of the rendered loop, without changing Game state or capturing private payloads.</summary>
    public sealed class NativePerformanceCapture : MonoBehaviour
    {
        private const double WarmupSeconds = 5;
        private readonly List<double> frameMilliseconds = new List<double>(4096);
        private readonly List<PublicPhaseInterval> phases = new List<PublicPhaseInterval>();
        private readonly List<JObject> configurations = new List<JObject>();
        private readonly MemoryRange allocated = new MemoryRange(), reserved = new MemoryRange();
        private string output;
        private double duration, warmupEnds, captureStarts;
        private DateTime startedUtc;
        private bool capturing;
        private NativeGameClient client;
        private int previousWidth = -1, previousHeight = -1, previousPreset = -1, previousQuality = -1;
        private FullScreenMode previousFullscreen;
        private bool previousFocused;
        private long focusedFrames, unfocusedFrames;
        private PublicPhaseInterval currentPhase;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void InstallWhenRequested()
        {
            var args = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(args, "-benchmark-output");
            if (index < 0) return;
            if (index + 1 >= args.Length || string.IsNullOrWhiteSpace(args[index + 1]) || args[index + 1].StartsWith("-", StringComparison.Ordinal))
            { Debug.LogWarning("Native benchmark capture requires an output file path."); return; }
            var seconds = 60d;
            var secondsIndex = Array.IndexOf(args, "-benchmark-seconds");
            if (secondsIndex >= 0 && (secondsIndex + 1 >= args.Length || !double.TryParse(args[secondsIndex + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out seconds) || seconds <= 0 || double.IsInfinity(seconds) || double.IsNaN(seconds)))
            { Debug.LogWarning("Native benchmark capture requires a positive finite duration in seconds."); return; }
            string path;
            try { path = Path.GetFullPath(args[index + 1]); }
            catch (Exception e) when (e is ArgumentException || e is NotSupportedException || e is PathTooLongException)
            { Debug.LogWarning("Native benchmark capture has an invalid output file path."); return; }
            var owner = new GameObject("Opt-in native performance capture");
            DontDestroyOnLoad(owner);
            var capture = owner.AddComponent<NativePerformanceCapture>();
            capture.output = path; capture.duration = seconds;
            capture.warmupEnds = Time.realtimeSinceStartupAsDouble + WarmupSeconds;
        }

        private void Update()
        {
            var time = Time.realtimeSinceStartupAsDouble;
            if (!capturing)
            {
                if (time < warmupEnds) return;
                capturing = true; captureStarts = time; startedUtc = DateTime.UtcNow;
                // The next frame's unscaledDeltaTime lies entirely after the warmup boundary.
                return;
            }
            var frameMs = Time.unscaledDeltaTime * 1000d;
            if (frameMs > 0 && !double.IsInfinity(frameMs) && !double.IsNaN(frameMs))
            {
                frameMilliseconds.Add(frameMs);
                if (Application.isFocused) ++focusedFrames; else ++unfocusedFrames;
            }
            allocated.Observe(Profiler.GetTotalAllocatedMemoryLong());
            reserved.Observe(Profiler.GetTotalReservedMemoryLong());
            var elapsed = time - captureStarts;
            ObserveConfiguration(elapsed);
            ObservePublicPhase(elapsed);
            if (elapsed >= duration) Complete(elapsed);
        }

        private void ObserveConfiguration(double elapsed)
        {
            var preset = PlayerPrefs.GetInt("native.graphicsPreset", 1);
            var quality = QualitySettings.GetQualityLevel();
            if (Screen.width == previousWidth && Screen.height == previousHeight && preset == previousPreset && quality == previousQuality && Screen.fullScreenMode == previousFullscreen && Application.isFocused == previousFocused) return;
            previousWidth = Screen.width; previousHeight = Screen.height; previousPreset = preset; previousQuality = quality; previousFullscreen = Screen.fullScreenMode; previousFocused = Application.isFocused;
            var names = QualitySettings.names;
            configurations.Add(new JObject
            {
                ["observedAtSeconds"] = elapsed, ["screenWidthPixels"] = Screen.width, ["screenHeightPixels"] = Screen.height,
                ["fullscreen"] = Screen.fullScreen, ["fullscreenMode"] = Screen.fullScreenMode.ToString(),
                ["applicationIsFocused"] = Application.isFocused,
                ["graphicsPreset"] = preset == 0 ? "Low" : preset == 2 ? "High" : "Balanced", ["graphicsPresetIndex"] = preset,
                ["unityQualityLevelIndex"] = quality, ["unityQualityLevelName"] = quality >= 0 && quality < names.Length ? names[quality] : "unknown",
                ["shadows"] = QualitySettings.shadows.ToString(), ["shadowResolution"] = QualitySettings.shadowResolution.ToString(),
                ["shadowDistanceUnityUnits"] = QualitySettings.shadowDistance, ["shadowCascades"] = QualitySettings.shadowCascades,
                ["pixelLightCount"] = QualitySettings.pixelLightCount, ["realtimeReflectionProbes"] = QualitySettings.realtimeReflectionProbes,
                ["lodBias"] = QualitySettings.lodBias,
                ["maximumLodLevel"] = QualitySettings.maximumLODLevel, ["antiAliasingSamples"] = QualitySettings.antiAliasing,
                ["vSyncCount"] = QualitySettings.vSyncCount, ["applicationTargetFrameRate"] = Application.targetFrameRate
            });
        }

        private void ObservePublicPhase(double elapsed)
        {
            if (client == null) client = FindFirstObjectByType<NativeGameClient>();
            var world = client?.Session?.World;
            var roomPhase = world?.RoomPhase;
            var gamePhase = world?.Phase;
            if (currentPhase == null || currentPhase.RoomPhase != roomPhase || currentPhase.GamePhase != gamePhase)
            {
                currentPhase = new PublicPhaseInterval(roomPhase, gamePhase, elapsed); phases.Add(currentPhase);
            }
            currentPhase.Observe(elapsed, world?.Players.Count ?? 0, (world?.Game?["players"] as JArray)?.Count ?? 0);
        }

        private void Complete(double elapsed)
        {
            enabled = false;
            var frames = frameMilliseconds.OrderBy(value => value).ToArray();
            var fps = frameMilliseconds.Select(value => 1000d / value).OrderBy(value => value).ToArray();
            var report = new JObject
            {
                ["version"] = 1, ["kind"] = "native-render-loop-observation",
                ["captureStartedUtc"] = startedUtc.ToString("O", CultureInfo.InvariantCulture), ["captureCompletedUtc"] = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture),
                ["warmupSeconds"] = WarmupSeconds, ["requestedCaptureSeconds"] = duration, ["elapsedCaptureSeconds"] = elapsed,
                ["frameSampleCount"] = frames.Length, ["sumOfReportedFrameIntervalsSeconds"] = frameMilliseconds.Sum() / 1000d,
                ["focusedFrameSampleCount"] = focusedFrames, ["unfocusedFrameSampleCount"] = unfocusedFrames,
                ["observedFrameSamplesPerElapsedSecond"] = elapsed <= 0 ? JValue.CreateNull() : new JValue(frames.Length / elapsed),
                ["frameDurationMilliseconds"] = Distribution(frames), ["instantaneousFramesPerSecond"] = Distribution(fps),
                ["sustainedFramesPerSecondFromMeanInterval"] = frames.Length == 0 ? JValue.CreateNull() : new JValue(1000d / frames.Average()),
                ["unityAllocatorMemoryBytes"] = new JObject { ["allocated"] = allocated.Report(), ["reserved"] = reserved.Report() },
                ["machine"] = new JObject
                {
                    ["platform"] = Application.platform.ToString(), ["unityVersion"] = Application.unityVersion, ["applicationVersion"] = Application.version,
                    ["developmentBuild"] = Debug.isDebugBuild, ["operatingSystem"] = SystemInfo.operatingSystem, ["deviceModel"] = SystemInfo.deviceModel,
                    ["cpu"] = SystemInfo.processorType, ["logicalProcessorCount"] = SystemInfo.processorCount, ["reportedProcessorFrequencyMHz"] = SystemInfo.processorFrequency,
                    ["gpu"] = SystemInfo.graphicsDeviceName, ["graphicsApi"] = SystemInfo.graphicsDeviceType.ToString(), ["graphicsDriverVersion"] = SystemInfo.graphicsDeviceVersion,
                    ["reportedSystemMemoryMB"] = SystemInfo.systemMemorySize, ["reportedGraphicsMemoryMB"] = SystemInfo.graphicsMemorySize
                },
                ["observedConfigurations"] = new JArray(configurations), ["publicPhaseIntervals"] = new JArray(phases.Select(phase => phase.Report())),
                ["measurementNotes"] = new JArray
                {
                    "Frame intervals are Unity unscaledDeltaTime samples from the rendered application loop and include frame pacing; they are not GPU execution timings.",
                    "Instantaneous FPS percentiles summarize reciprocal frame intervals; sustained FPS is the reciprocal of the mean frame interval.",
                    "Observed frame samples per elapsed second divides the valid frame sample count by the measured capture wall duration; focus counts and configuration observations distinguish foreground and background samples.",
                    "Memory observations use Profiler.GetTotalAllocatedMemoryLong and Profiler.GetTotalReservedMemoryLong; they describe Unity allocator memory, not operating-system process RSS or total media/driver memory.",
                    "This opt-in observer adds sampling overhead. Public phase/count observations come from frame-applied Room and Game state; no identity, credential, Role, choice, chat, position or private payload is captured.",
                    "A report establishes only the recorded machine, scene phases, settings and Player counts; it does not establish ten-Player voice-load or cross-platform acceptance."
                }
            };
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(output));
                File.WriteAllText(output, report.ToString(Formatting.Indented), new UTF8Encoding(false));
                Debug.Log("Native benchmark capture completed: " + output);
            }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            { Debug.LogWarning("Native benchmark capture could not write its output file (" + e.GetType().Name + ")."); }
        }

        private static JObject Distribution(double[] sorted)
        {
            return new JObject
            {
                ["mean"] = sorted.Length == 0 ? JValue.CreateNull() : new JValue(sorted.Average()),
                ["p50"] = Percentile(sorted, .50), ["p95"] = Percentile(sorted, .95), ["p99"] = Percentile(sorted, .99)
            };
        }
        private static JToken Percentile(double[] sorted, double fraction)
        {
            if (sorted.Length == 0) return JValue.CreateNull();
            var index = (sorted.Length - 1) * fraction; var lower = (int)Math.Floor(index); var upper = (int)Math.Ceiling(index);
            return new JValue(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
        }

        private sealed class MemoryRange
        {
            private long count, minimum = long.MaxValue, maximum, last;
            private double mean;
            public void Observe(long value) { last = value; minimum = Math.Min(minimum, value); maximum = Math.Max(maximum, value); mean += (value - mean) / ++count; }
            public JObject Report() => new JObject { ["sampleCount"] = count, ["minimum"] = count == 0 ? JValue.CreateNull() : new JValue(minimum), ["maximum"] = maximum, ["mean"] = count == 0 ? JValue.CreateNull() : new JValue(mean), ["last"] = last };
        }
        private sealed class PublicPhaseInterval
        {
            public readonly string RoomPhase, GamePhase;
            private readonly double start;
            private double end;
            private int samples, minimumMemberships = int.MaxValue, maximumMemberships, minimumRoster = int.MaxValue, maximumRoster;
            public PublicPhaseInterval(string roomPhase, string gamePhase, double start) { RoomPhase = roomPhase; GamePhase = gamePhase; this.start = start; }
            public void Observe(double elapsed, int memberships, int roster)
            {
                end = elapsed; ++samples;
                minimumMemberships = Math.Min(minimumMemberships, memberships); maximumMemberships = Math.Max(maximumMemberships, memberships);
                minimumRoster = Math.Min(minimumRoster, roster); maximumRoster = Math.Max(maximumRoster, roster);
            }
            public JObject Report() => new JObject
            {
                ["roomPhase"] = RoomPhase == null ? JValue.CreateNull() : new JValue(RoomPhase), ["gamePhase"] = GamePhase == null ? JValue.CreateNull() : new JValue(GamePhase),
                ["firstObservedAtSeconds"] = start, ["lastObservedAtSeconds"] = end, ["sampleCount"] = samples,
                ["roomMembershipCountMinimum"] = minimumMemberships, ["roomMembershipCountMaximum"] = maximumMemberships,
                ["gameRosterCountMinimum"] = minimumRoster, ["gameRosterCountMaximum"] = maximumRoster
            };
        }
    }
}
