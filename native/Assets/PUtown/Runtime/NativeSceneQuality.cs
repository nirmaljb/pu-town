using System.Collections.Generic;
using UnityEngine;

namespace PUtown.Runtime
{
    public sealed class NativeSceneQuality : MonoBehaviour
    {
        private readonly List<Material> water = new List<Material>();
        private void Start()
        {
            foreach (var renderer in GetComponentsInChildren<Renderer>(true))
            {
                if (!renderer.name.StartsWith("Water:", System.StringComparison.Ordinal)) continue;
                // Each Room scene owns these material instances; local preferences never edit an asset.
                var material = renderer.material; water.Add(material);
            }
            NativePreferences.Changed += Apply; Apply();
        }
        private void Apply()
        {
            var preset = PlayerPrefs.GetInt("native.graphicsPreset", 1);
            foreach (var material in water)
            {
                material.SetFloat("_Glossiness", preset == 2 ? .85f : preset == 1 ? .45f : 0);
                material.SetFloat("_SpecularHighlights", preset == 0 ? 0 : 1);
                material.SetFloat("_GlossyReflections", preset == 2 ? 1 : 0);
                if (preset == 0) material.EnableKeyword("_SPECULARHIGHLIGHTS_OFF"); else material.DisableKeyword("_SPECULARHIGHLIGHTS_OFF");
                if (preset < 2) material.EnableKeyword("_GLOSSYREFLECTIONS_OFF"); else material.DisableKeyword("_GLOSSYREFLECTIONS_OFF");
            }
        }
        private void OnDestroy()
        {
            NativePreferences.Changed -= Apply;
            foreach (var material in water) Destroy(material);
        }
    }
}
