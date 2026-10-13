using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace PUtown.Runtime
{
    /// <summary>Explicitly requested, bounded observations of physical input and public panel state. Never dispatches or consumes input.</summary>
    public sealed class NativeInputCapture : MonoBehaviour
    {
        private const int MaximumSamples = 64;
        private const double MaximumSeconds = 240;
        private readonly List<JObject> samples = new List<JObject>(MaximumSamples);
        private string output;
        private double started, nextHeartbeat, nextDocumentSearch;
        private UIDocument document;
        private VisualElement root;
        private long pointerDownEvents, pointerUpEvents, navigationSubmitEvents;
        private bool eventsChanged, previousFocus, observed;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void InstallWhenRequested()
        {
            var args = Environment.GetCommandLineArgs(); var index = Array.IndexOf(args, "-input-observation-output");
            if (index < 0) return;
            if (index + 1 >= args.Length || string.IsNullOrWhiteSpace(args[index + 1]) || args[index + 1].StartsWith("-", StringComparison.Ordinal))
            { Debug.LogWarning("Native input observation requires an output file path."); return; }
            string path;
            try { path = Path.GetFullPath(args[index + 1]); }
            catch (Exception e) when (e is ArgumentException || e is NotSupportedException || e is PathTooLongException)
            { Debug.LogWarning("Native input observation has an invalid output file path."); return; }
            var owner = new GameObject("Opt-in native input observation"); DontDestroyOnLoad(owner);
            var capture = owner.AddComponent<NativeInputCapture>(); capture.output = path; capture.started = Time.realtimeSinceStartupAsDouble;
        }

        private void LateUpdate()
        {
            if (output == null) return;
            var time = Time.realtimeSinceStartupAsDouble;
            if (time - started >= MaximumSeconds || samples.Count >= MaximumSamples) { StopObserving(); return; }
            if (document == null && time >= nextDocumentSearch)
            { document = FindAnyObjectByType<UIDocument>(); nextDocumentSearch = time + 1; }
            var attachedRoot = document == null ? null : document.rootVisualElement;
            var panelChanged = attachedRoot != root;
            if (panelChanged) Attach(attachedRoot);
            var down = Input.GetMouseButtonDown(0); var up = Input.GetMouseButtonUp(0);
            var navigationKey = Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter) || Input.GetKeyDown(KeyCode.Tab);
            var focusChanged = observed && previousFocus != Application.isFocused;
            if (!observed || panelChanged || down || up || navigationKey || focusChanged || eventsChanged || time >= nextHeartbeat)
            {
                Observe(time, down, up, navigationKey); observed = true; previousFocus = Application.isFocused;
                eventsChanged = false; nextHeartbeat = time + 10;
                if (samples.Count >= MaximumSamples) StopObserving();
            }
        }

        private void Attach(VisualElement attachedRoot)
        {
            Detach(); root = attachedRoot;
            if (root == null) return;
            root.RegisterCallback<PointerDownEvent>(OnPointerDown, TrickleDown.TrickleDown);
            root.RegisterCallback<PointerUpEvent>(OnPointerUp, TrickleDown.TrickleDown);
            root.RegisterCallback<NavigationSubmitEvent>(OnNavigationSubmit, TrickleDown.TrickleDown);
        }
        private void OnPointerDown(PointerDownEvent _) { ++pointerDownEvents; eventsChanged = true; }
        private void OnPointerUp(PointerUpEvent _) { ++pointerUpEvents; eventsChanged = true; }
        private void OnNavigationSubmit(NavigationSubmitEvent _) { ++navigationSubmitEvents; eventsChanged = true; }
        private void Detach()
        {
            if (root == null) return;
            root.UnregisterCallback<PointerDownEvent>(OnPointerDown, TrickleDown.TrickleDown);
            root.UnregisterCallback<PointerUpEvent>(OnPointerUp, TrickleDown.TrickleDown);
            root.UnregisterCallback<NavigationSubmitEvent>(OnNavigationSubmit, TrickleDown.TrickleDown);
            root = null;
        }

        private void Observe(double time, bool down, bool up, bool navigationKey)
        {
            var mouse = Input.mousePosition; var panel = root?.panel; var panelPosition = Vector2.zero; VisualElement picked = null;
            if (panel != null)
            {
                panelPosition = RuntimePanelUtils.ScreenToPanel(panel, new Vector2(mouse.x, Screen.height - mouse.y));
                if (Finite(panelPosition.x) && Finite(panelPosition.y)) picked = panel.Pick(panelPosition);
            }
            var button = picked as Button ?? picked?.GetFirstAncestorOfType<Button>();
            samples.Add(new JObject
            {
                ["elapsedSeconds"] = time - started, ["applicationIsFocused"] = Application.isFocused,
                ["screenWidthPixels"] = Screen.width, ["screenHeightPixels"] = Screen.height,
                ["legacyMousePosition"] = new JArray(Number(mouse.x), Number(mouse.y), Number(mouse.z)),
                ["primaryButtonDown"] = down, ["primaryButtonUp"] = up, ["primaryButtonHeld"] = Input.GetMouseButton(0),
                ["navigationKeyDown"] = navigationKey, ["panelAttached"] = panel != null,
                ["panelPosition"] = panel == null ? JValue.CreateNull() : (JToken)new JArray(Number(panelPosition.x), Number(panelPosition.y)),
                ["panelTargetDisplay"] = document?.panelSettings == null ? JValue.CreateNull() : new JValue(document.panelSettings.targetDisplay),
                ["panelRenderMode"] = document?.panelSettings == null ? JValue.CreateNull() : new JValue(document.panelSettings.renderMode.ToString()),
                ["panelHasTargetTexture"] = document?.panelSettings?.targetTexture != null,
                ["pickedElementPresent"] = picked != null, ["pickIsButton"] = button != null,
                ["pickEnabled"] = picked == null ? JValue.CreateNull() : new JValue(picked.enabledInHierarchy),
                ["pickedButtonEnabled"] = button == null ? JValue.CreateNull() : new JValue(button.enabledInHierarchy),
                ["rootPointerDownEvents"] = pointerDownEvents, ["rootPointerUpEvents"] = pointerUpEvents,
                ["rootNavigationSubmitEvents"] = navigationSubmitEvents
            });
            var report = new JObject
            {
                ["version"] = 1, ["kind"] = "native-input-observation", ["maximumSamples"] = MaximumSamples,
                ["maximumSeconds"] = MaximumSeconds, ["sampleCount"] = samples.Count, ["samples"] = new JArray(samples)
            };
            try { Directory.CreateDirectory(Path.GetDirectoryName(output)); File.WriteAllText(output, report.ToString(Formatting.Indented), new UTF8Encoding(false)); }
            catch (Exception e) when (e is IOException || e is UnauthorizedAccessException)
            { Debug.LogWarning("Native input observation could not write its local output (" + e.GetType().Name + ")."); StopObserving(); }
        }
        private static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
        private static JToken Number(float value) => Finite(value) ? new JValue(value) : JValue.CreateNull();
        private void StopObserving() { Detach(); enabled = false; }
        private void OnDestroy() { Detach(); }
    }
}
