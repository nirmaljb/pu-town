using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace PUtown.Editor
{
    /// <summary>Render native Avatar evidence and inspect immutable published platform assets.</summary>
    public static class AvatarBuild
    {
        private const string ArtRoot = "Assets/Art/Avatars";
        private static readonly string[] Presets = { "kaykit-barbarian", "kaykit-knight", "kaykit-mage", "kaykit-ranger", "kaykit-rogue" };
        private static readonly string[] States = { "Standing", "Walking", "Seated" };
        private static string RepositoryRoot => Path.GetFullPath(Environment.GetEnvironmentVariable("PU_TOWN_REPOSITORY") ?? "..");
        private static string ExportDirectory(string id) => Path.Combine(RepositoryRoot, "towns", "assets", "avatars", "exports", id);

        [MenuItem("PU Town/Avatars/Render native review evidence")]
        public static void RenderEvidence()
        {
            foreach (string id in Presets)
            {
                GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ArtRoot + "/" + id + "/avatar.prefab");
                if (prefab == null) throw new InvalidOperationException("Import the authored Avatar before reviewing: " + id);
                RenderEvidence(id, prefab);
            }
        }

        public static void RenderEvidence(string id, GameObject prefab)
        {
            var preview = new PreviewRenderUtility();
            try
            {
                GameObject instance = Object.Instantiate(prefab);
                preview.AddSingleGO(instance);
                Animator animator = instance.GetComponentInChildren<Animator>();
                animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                animator.Rebind();
                var camera = preview.camera;
                camera.orthographic = true;
                camera.orthographicSize = 1.1f;
                camera.nearClipPlane = .01f;
                camera.farClipPlane = 50;
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = new Color(.26f, .31f, .29f);
                preview.ambientColor = new Color(.48f, .51f, .50f);
                preview.lights[0].intensity = 1.2f;
                preview.lights[0].transform.rotation = Quaternion.Euler(35, -35, 0);
                preview.lights[0].color = new Color(1, .91f, .77f);
                preview.lights[1].intensity = .7f;
                var poses = new List<object>();
                foreach (var view in new[] {
                    ("front", "Standing", 0f, new Vector3(3, 3, 5)),
                    ("back", "Standing", 0f, new Vector3(-3, 3, -5)),
                    ("side", "Standing", 0f, new Vector3(5, 2.5f, 0)),
                    ("walking", "Walking", .25f, new Vector3(3, 3, 5)),
                    ("seated", "Seated", 0f, new Vector3(3, 3, 5)) })
                {
                    animator.Play(view.Item2, 0, view.Item3);
                    animator.Update(0);
                    // The preview scene has no Player frame loop. Bake the current actual Unity
                    // skinning result to avoid a stale edit-mode renderer between sampled poses.
                    var bakedObjects = new List<GameObject>();
                    var bakedMeshes = new List<Mesh>();
                    foreach (var renderer in instance.GetComponentsInChildren<SkinnedMeshRenderer>())
                    {
                        var mesh = new Mesh();
                        renderer.BakeMesh(mesh, true);
                        var baked = new GameObject("Reviewed " + renderer.name);
                        baked.transform.SetParent(renderer.transform, false);
                        baked.AddComponent<MeshFilter>().sharedMesh = mesh;
                        baked.AddComponent<MeshRenderer>().sharedMaterials = renderer.sharedMaterials;
                        bakedObjects.Add(baked);
                        bakedMeshes.Add(mesh);
                        renderer.enabled = false;
                    }
                    camera.transform.position = view.Item4;
                    camera.transform.LookAt(new Vector3(0, .9f, 0));
                    preview.BeginStaticPreview(new Rect(0, 0, 800, 800));
                    preview.Render();
                    Texture2D texture = preview.EndStaticPreview();
                    string output = Path.Combine(ExportDirectory(id), "unity-" + view.Item1 + ".png");
                    File.WriteAllBytes(output, texture.EncodeToPNG());
                    Object.DestroyImmediate(texture);
                    foreach (var baked in bakedObjects) Object.DestroyImmediate(baked);
                    foreach (var mesh in bakedMeshes) Object.DestroyImmediate(mesh);
                    foreach (var renderer in instance.GetComponentsInChildren<SkinnedMeshRenderer>()) renderer.enabled = true;
                    Vector3 hips = animator.GetBoneTransform(HumanBodyBones.Hips).position;
                    Vector3 foot = animator.GetBoneTransform(HumanBodyBones.LeftFoot).position;
                    poses.Add(new { view = view.Item1, state = view.Item2, normalizedTime = view.Item3,
                        hips = new[] { hips.x, hips.y, hips.z }, leftFoot = new[] { foot.x, foot.y, foot.z } });
                }
                File.WriteAllText(Path.Combine(ExportDirectory(id), "unity-pose-report.json"),
                    JsonConvert.SerializeObject(new { preset = id, actualNativeCameraRender = true, unityVersion = Application.unityVersion, poses }, Formatting.Indented) + "\n");
            }
            finally { preview.Cleanup(); }
        }

        public static void ValidateMacBundles() => ValidateMacBundles(true);

        /// <summary>Inspect retained bundle bytes against the candidate publication without rebuilding or rerendering them.</summary>
        public static void ReportAndValidateMacBundles() => ValidateMacBundles(false);

        private static void ValidateMacBundles(bool renderEvidence)
        {
            string publicationPath = Environment.GetEnvironmentVariable("PU_TOWN_AVATAR_PUBLICATION") ?? Path.Combine(RepositoryRoot, "towns", "assets", "avatars", "publication.json");
            var publication = JObject.Parse(File.ReadAllText(publicationPath));
            var violations = new List<string>();
            foreach (JObject preset in (JArray)publication["presets"])
            {
                string id = (string)preset["id"]; var native = preset["native"];
                var asset = ((JArray)native["platformAssets"]).Single(item => (string)item["platform"] == "macos-universal");
                string file = Path.Combine(ExportDirectory(id), "macos-universal.bundle");
                byte[] contents = File.ReadAllBytes(file); string digest;
                using (var hash = SHA256.Create()) digest = string.Concat(hash.ComputeHash(contents).Select(value => value.ToString("x2")));
                var problems = new List<string>();
                if (contents.LongLength != (long)asset["byteLength"] || digest != (string)asset["sha256"]
                        || !contents.SequenceEqual(Convert.FromBase64String((string)asset["data"])))
                    problems.Add("Retained bundle bytes do not match the candidate publication.");
                if ((string)asset["unityVersion"] != Application.unityVersion) problems.Add("Bundle Unity version does not match this Editor.");
                AssetBundle bundle = AssetBundle.LoadFromFile(file);
                if (bundle == null) throw new InvalidOperationException("Native macOS bundle did not load: " + id);
                GameObject instance = null;
                try
                {
                    GameObject prefab = bundle.LoadAsset<GameObject>((string)asset["assetName"]);
                    if (prefab == null) throw new InvalidOperationException("Published native prefab asset is absent from the retained bundle: " + id);
                    if (prefab.name != (string)native["model"]["rootNode"]) problems.Add("Prefab root does not match model.rootNode.");
                    instance = Object.Instantiate(prefab);
                    Animator animator = instance.GetComponentInChildren<Animator>();
                    if (animator?.avatar == null || !animator.avatar.isValid || !animator.avatar.isHuman
                            || animator.runtimeAnimatorController == null || instance.GetComponentsInChildren<SkinnedMeshRenderer>().Length == 0)
                        problems.Add("Bundle lacks a complete valid Humanoid Avatar, controller or skinned model.");
                    Transform hips = null;
                    if (animator?.avatar != null && animator.avatar.isValid && animator.avatar.isHuman)
                    {
                        animator.cullingMode = AnimatorCullingMode.AlwaysAnimate; animator.Rebind(); animator.Update(0);
                        hips = animator.GetBoneTransform(HumanBodyBones.Hips);
                    }
                    if (animator?.avatar?.name != (string)native["rig"]["avatarName"] || hips?.name != (string)native["rig"]["hipsBone"])
                        problems.Add("Instantiated Humanoid rig does not match the published Avatar/Hips identities.");
                    var clips = animator?.runtimeAnimatorController?.animationClips ?? Array.Empty<AnimationClip>();
                    foreach (string state in new[] { "standing", "walking", "seated" })
                    {
                        var expected = native["animations"][state];
                        var clip = clips.SingleOrDefault(candidate => candidate.name == (string)expected["clipName"]);
                        if (clip == null || Mathf.Abs(clip.length - (float)expected["durationSeconds"]) > .02f || clip.isLooping != (bool)expected["loop"])
                            problems.Add("Bundle animation does not match the published " + state + " clip.");
                    }
                    var report = new
                    {
                        preset = id, platform = "macos-universal", unityVersion = Application.unityVersion,
                        assetName = (string)asset["assetName"], rootNode = prefab.name, expectedRootNode = (string)native["model"]["rootNode"],
                        rigName = animator?.avatar?.name, hipsBone = hips?.name, bundleSha256 = digest, bundleBytes = contents.LongLength,
                        matchesPublication = problems.Count == 0, mismatches = problems.ToArray(),
                        animations = clips.Select(clip => new { clipName = clip.name, durationSeconds = clip.length, loop = clip.isLooping }).ToArray()
                    };
                    File.WriteAllText(Path.Combine(ExportDirectory(id), "unity-bundle-report.json"), JsonConvert.SerializeObject(report, Formatting.Indented) + "\n");
                    Debug.Log("Inspected native Avatar bundle identity: " + JsonConvert.SerializeObject(report));
                    violations.AddRange(problems.Select(problem => id + ": " + problem));
                    if (renderEvidence && problems.Count == 0) RenderEvidence(id, prefab);
                }
                finally { if (instance != null) Object.DestroyImmediate(instance); bundle.Unload(true); }
            }
            if (violations.Count > 0) throw new InvalidOperationException("Native Avatar publication does not match its actual bundles: " + string.Join(" ", violations));
        }

    }
}
