using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace PUtown.Runtime
{
    public sealed class TownScene : IDisposable
    {
        private sealed class Occluder
        {
            public Renderer[] Renderers;
            public Bounds Bounds;
            public float Visibility = 1;
            public bool Prepared;
        }
        public readonly GameObject Root;
        public readonly TownRules Rules;
        private readonly List<Occluder> occluders = new List<Occluder>();
        private readonly Dictionary<Material, Material> fadeMaterials = new Dictionary<Material, Material>();
        private readonly MaterialPropertyBlock properties = new MaterialPropertyBlock();
        private static readonly int VisibilityProperty = Shader.PropertyToID("_Visibility");

        public TownScene(TownRules rules, Font font)
        {
            var prefab = Resources.Load<GameObject>("Towns/" + rules.MapId + "Garden");
            if (prefab == null) throw new InvalidOperationException("The build is missing the authored environment for " + NativeTownMaps.Name(rules.MapId) + ".");
            Rules = rules; Root = UnityEngine.Object.Instantiate(prefab); Root.name = NativeTownMaps.Name(rules.MapId);
            Root.AddComponent<NativeSceneQuality>();
            foreach (var collider in Root.GetComponentsInChildren<Collider>(true)) UnityEngine.Object.Destroy(collider);
            foreach (var group in Root.GetComponentsInChildren<Transform>(true))
            {
                if (!group.name.StartsWith("Building:", StringComparison.Ordinal) && !group.name.StartsWith("Vegetation:", StringComparison.Ordinal)) continue;
                var renderers = group.GetComponentsInChildren<Renderer>(true);
                if (renderers.Length == 0) continue;
                var bounds = renderers[0].bounds; foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
                occluders.Add(new Occluder { Renderers = renderers, Bounds = bounds });
            }
        }

        public void ApplyOcclusion(Camera camera, Vector3 ownAvatar, float deltaSeconds, bool active = true)
        {
            var from = camera.transform.position; var direction = ownAvatar - from; var distance = direction.magnitude;
            var ray = new Ray(from, direction.normalized);
            foreach (var group in occluders)
            {
                var bounds = group.Bounds; bounds.Expand(.15f);
                var blocks = active && distance > .001f && bounds.IntersectRay(ray, out var hit) && hit >= 0 && hit < distance - .05f;
                var target = blocks ? .12f : 1f;
                var value = NativePreferences.ReducedMotion ? target : Mathf.MoveTowards(group.Visibility, target, Mathf.Min(deltaSeconds, .1f) * 4);
                if (Mathf.Approximately(group.Visibility, value)) continue;
                if (!group.Prepared) { Prepare(group); group.Prepared = true; }
                group.Visibility = value;
                foreach (var renderer in group.Renderers)
                {
                    if (renderer == null) continue;
                    renderer.GetPropertyBlock(properties); properties.SetFloat(VisibilityProperty, value); renderer.SetPropertyBlock(properties); properties.Clear();
                }
            }
        }

        private void Prepare(Occluder group)
        {
            foreach (var renderer in group.Renderers)
            {
                var originals = renderer.sharedMaterials; var replacements = new Material[originals.Length];
                for (var index = 0; index < originals.Length; index++)
                {
                    var original = originals[index];
                    if (original == null || original.HasProperty(VisibilityProperty)) { replacements[index] = original; continue; }
                    if (!fadeMaterials.TryGetValue(original, out var material))
                    {
                        var shader = Resources.Load<Shader>("Towns/TownOccluder");
                        if (shader == null) throw new InvalidOperationException("The town occlusion shader is missing.");
                        material = new Material(original) { shader = shader, name = original.name + " (local fade)", enableInstancing = true };
                        if (original.IsKeywordEnabled("_METALLICGLOSSMAP"))
                        {
                            material.SetFloat("_Metallic", 1);
                            material.SetFloat("_Glossiness", original.GetFloat("_GlossMapScale"));
                        }
                        material.SetFloat("_Cutoff", original.IsKeywordEnabled("_ALPHATEST_ON") ? original.GetFloat("_Cutoff") : 0);
                        material.SetFloat(VisibilityProperty, 1); fadeMaterials.Add(original, material);
                    }
                    replacements[index] = material;
                }
                renderer.sharedMaterials = replacements;
            }
        }
        public void Dispose()
        {
            UnityEngine.Object.Destroy(Root);
            foreach (var material in fadeMaterials.Values) UnityEngine.Object.Destroy(material);
            fadeMaterials.Clear();
        }
    }
}
