using System;
using UnityEngine;

namespace PUtown.Runtime
{
    /// <summary>Device-local preferences never send Game requests or change a server deadline.</summary>
    public static class NativePreferences
    {
        public static event Action Changed;
        public static bool ReducedMotion { get { return PlayerPrefs.GetInt("native.reducedMotion", 0) != 0; } set { PlayerPrefs.SetInt("native.reducedMotion", value ? 1 : 0); Changed?.Invoke(); } }
        public static bool PushToTalk { get { return PlayerPrefs.GetInt("native.pushToTalk", 0) != 0; } set { PlayerPrefs.SetInt("native.pushToTalk", value ? 1 : 0); Changed?.Invoke(); } }
        public static bool NoiseSuppression { get { return PlayerPrefs.GetInt("native.noiseSuppression", 1) != 0; } set { PlayerPrefs.SetInt("native.noiseSuppression", value ? 1 : 0); Changed?.Invoke(); } }
        public static string MicrophoneDevice { get { return PlayerPrefs.GetString("native.microphone", ""); } set { PlayerPrefs.SetString("native.microphone", value ?? ""); Changed?.Invoke(); } }
        public static KeyCode TalkKey { get { return (KeyCode)PlayerPrefs.GetInt("native.talkKey", (int)KeyCode.V); } set { PlayerPrefs.SetInt("native.talkKey", (int)value); Changed?.Invoke(); } }
        public static float Volume(string category) { return Mathf.Clamp01(PlayerPrefs.GetFloat("native.volume." + category, category == "music" ? .18f : category == "ambience" ? .35f : 1f)); }
        public static void SetVolume(string category, float value) { PlayerPrefs.SetFloat("native.volume." + category, Mathf.Clamp01(value)); Changed?.Invoke(); }
        public static float Gain(string category) { return Volume("master") * Volume(category); }
        public static void SetGraphicsPreset(int preset)
        {
            preset = Mathf.Clamp(preset, 0, 2); PlayerPrefs.SetInt("native.graphicsPreset", preset);
            QualitySettings.shadows = preset == 0 ? ShadowQuality.Disable : preset == 1 ? ShadowQuality.HardOnly : ShadowQuality.All;
            QualitySettings.shadowResolution = preset == 2 ? ShadowResolution.High : ShadowResolution.Low;
            QualitySettings.shadowDistance = preset == 0 ? 0 : preset == 1 ? 20 : 45;
            QualitySettings.shadowCascades = preset == 2 ? 2 : 0;
            QualitySettings.pixelLightCount = preset == 0 ? 0 : preset == 1 ? 1 : 2;
            QualitySettings.realtimeReflectionProbes = preset == 2;
            QualitySettings.lodBias = preset == 0 ? .5f : preset == 1 ? 1 : 1.5f;
            QualitySettings.maximumLODLevel = preset == 0 ? 1 : 0;
            QualitySettings.antiAliasing = preset == 0 ? 0 : preset == 1 ? 2 : 4;
            // Pipeline settings are optional; use its public properties without coupling protocol/runtime to a pipeline package.
            var pipeline = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline;
            if (pipeline != null)
            {
                var type = pipeline.GetType(); var shadows = type.GetProperty("shadowDistance"); if (shadows?.CanWrite == true) shadows.SetValue(pipeline, QualitySettings.shadowDistance);
                var scale = type.GetProperty("renderScale"); if (scale?.CanWrite == true) scale.SetValue(pipeline, preset == 0 ? .8f : 1f);
                var samples = type.GetProperty("msaaSampleCount"); if (samples?.CanWrite == true) samples.SetValue(pipeline, preset == 0 ? 1 : preset == 1 ? 2 : 4);
            }
            Changed?.Invoke();
        }
        public static void Restore() { SetGraphicsPreset(PlayerPrefs.GetInt("native.graphicsPreset", 1)); }
    }
}
