using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using Object = UnityEngine.Object;

namespace PUtown.Editor
{
    /// <summary>Import retained Blender masters, inspect actual Unity rigs, and build immutable per-platform assets.</summary>
    public static class AvatarBuild
    {
        private const string ArtRoot = "Assets/Art/Avatars";
        private static readonly string[] Presets = { "campus-rowan", "campus-mira" };
        private static readonly string[] States = { "Standing", "Walking", "Seated" };
        private static string RepositoryRoot => Path.GetFullPath(Environment.GetEnvironmentVariable("PU_TOWN_REPOSITORY") ?? "..");
        private static string ExportDirectory(string id) => Path.Combine(RepositoryRoot, "campus", "assets", "avatars", "exports", id);

        [MenuItem("PU Town/Avatars/Import authored masters")]
        public static void Import()
        {
            AssetDatabase.Refresh();
            foreach (string id in Presets) Import(id);
            AssetDatabase.SaveAssets();
        }

        private static void Import(string id)
        {
            string source = ArtRoot + "/" + id + "/avatar.fbx";
            var importer = (ModelImporter)AssetImporter.GetAtPath(source);
            if (importer == null) throw new InvalidOperationException("Missing authored Avatar source: " + source);
            importer.animationType = ModelImporterAnimationType.Human;
            importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
            importer.importAnimation = true;
            importer.importBlendShapes = false;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            importer.materialLocation = ModelImporterMaterialLocation.InPrefab;
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(source);
            if (model == null) throw new InvalidOperationException("Avatar FBX did not import: " + source);
            var human = new List<HumanBone>();
            foreach (HumanBodyBones bone in new[] { HumanBodyBones.Hips, HumanBodyBones.Spine, HumanBodyBones.Chest,
                HumanBodyBones.Neck, HumanBodyBones.Head, HumanBodyBones.LeftUpperArm, HumanBodyBones.LeftLowerArm,
                HumanBodyBones.LeftHand, HumanBodyBones.RightUpperArm, HumanBodyBones.RightLowerArm,
                HumanBodyBones.RightHand, HumanBodyBones.LeftUpperLeg, HumanBodyBones.LeftLowerLeg,
                HumanBodyBones.LeftFoot, HumanBodyBones.RightUpperLeg, HumanBodyBones.RightLowerLeg, HumanBodyBones.RightFoot })
            {
                string name = bone.ToString();
                if (!model.GetComponentsInChildren<Transform>(true).Any(transform => transform.name == name))
                    throw new InvalidOperationException("Missing shared humanoid bone: " + name);
                human.Add(new HumanBone { boneName = name, humanName = HumanTrait.BoneName[(int)bone],
                    limit = new HumanLimit { useDefaultValues = true } });
            }
            var description = importer.humanDescription;
            description.human = human.ToArray();
            description.skeleton = model.GetComponentsInChildren<Transform>(true).Select(transform => new SkeletonBone
            {
                name = transform.name, position = transform.localPosition,
                rotation = transform.localRotation, scale = transform.localScale
            }).ToArray();
            description.armStretch = .05f;
            description.legStretch = .05f;
            description.upperArmTwist = .5f;
            description.lowerArmTwist = .5f;
            description.upperLegTwist = .5f;
            description.lowerLegTwist = .5f;
            importer.humanDescription = description;
            var clips = importer.defaultClipAnimations;
            foreach (var clip in clips)
            {
                string state = States.FirstOrDefault(candidate => clip.name.Contains(candidate, StringComparison.OrdinalIgnoreCase)
                    || clip.takeName.Contains(candidate, StringComparison.OrdinalIgnoreCase));
                if (state == null) continue;
                clip.name = state;
                clip.loopTime = true;
                clip.loopPose = true;
                clip.lockRootRotation = true;
                clip.lockRootHeightY = true;
                clip.lockRootPositionXZ = true;
                clip.keepOriginalPositionY = true;
            }
            importer.clipAnimations = clips;
            importer.SaveAndReimport();
            model = AssetDatabase.LoadAssetAtPath<GameObject>(source);
            Avatar avatar = AssetDatabase.LoadAllAssetsAtPath(source).OfType<Avatar>().FirstOrDefault();
            if (avatar == null || !avatar.isValid || !avatar.isHuman)
                throw new InvalidOperationException("The authored Avatar must import as a valid Unity humanoid: " + id);
            AnimationClip[] importedClips = AssetDatabase.LoadAllAssetsAtPath(source).OfType<AnimationClip>()
                .Where(clip => !clip.name.StartsWith("__preview__", StringComparison.Ordinal)).ToArray();
            if (States.Any(state => !importedClips.Any(clip => clip.name == state && clip.length > 0)))
                throw new InvalidOperationException("The authored Avatar lacks a standing, walking or seated clip: " + id);
            string controllerPath = ArtRoot + "/" + id + "/avatar.controller";
            AssetDatabase.DeleteAsset(controllerPath);
            AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            foreach (string state in States)
            {
                AnimatorState animationState = controller.layers[0].stateMachine.AddState(state);
                animationState.motion = importedClips.Single(clip => clip.name == state);
                if (state == "Standing") controller.layers[0].stateMachine.defaultState = animationState;
            }
            GameObject instance = (GameObject)PrefabUtility.InstantiatePrefab(model);
            try
            {
                instance.name = "Avatar";
                Animator animator = instance.GetComponent<Animator>() ?? instance.AddComponent<Animator>();
                animator.avatar = avatar;
                animator.runtimeAnimatorController = controller;
                animator.applyRootMotion = false;
                var renderers = instance.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                if (renderers.Length == 0 || renderers.Any(renderer => renderer.sharedMesh == null || renderer.bones.Length == 0))
                    throw new InvalidOperationException("Avatar meshes must be bound to their authored rig: " + id);
                foreach (var renderer in renderers)
                {
                    renderer.updateWhenOffscreen = true;
                    Material[] materials = renderer.sharedMaterials;
                    for (int index = 0; index < materials.Length; index++)
                    {
                        Material material = materials[index];
                        if (material == null) throw new InvalidOperationException("Avatar has a missing native material: " + id);
                        string safe = string.Concat(material.name.Select(character => char.IsLetterOrDigit(character) ? character : '-'));
                        string materialPath = ArtRoot + "/" + id + "/" + safe + ".mat";
                        Material native = AssetDatabase.LoadAssetAtPath<Material>(materialPath);
                        if (native == null)
                        {
                            native = new Material(Shader.Find("Standard")) { name = material.name, color = material.color };
                            native.SetFloat("_Glossiness", .15f);
                            native.SetFloat("_Metallic", 0);
                            AssetDatabase.CreateAsset(native, materialPath);
                        }
                        materials[index] = native;
                    }
                    renderer.sharedMaterials = materials;
                }
                // Normalize height/pivot once in the authored prefab; the client has no cosmetic geometry table.
                Bounds bounds = renderers[0].bounds;
                foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
                float scale = 1.7f / bounds.size.y;
                instance.transform.localScale = Vector3.one * scale;
                instance.transform.localPosition = new Vector3(0, -bounds.min.y * scale, 0);
                GameObject savedPrefab = PrefabUtility.SaveAsPrefabAsset(instance, ArtRoot + "/" + id + "/avatar.prefab");
                if (savedPrefab == null) throw new InvalidOperationException("The authored Avatar prefab could not be saved: " + id);
                var report = new
                {
                    preset = id, unityVersion = Application.unityVersion, validHumanoid = avatar.isValid && avatar.isHuman,
                    rootNode = savedPrefab.name,
                    rigName = avatar.name, hipsBone = animator.GetBoneTransform(HumanBodyBones.Hips)?.name,
                    skinnedRenderers = renderers.Length, vertices = renderers.Sum(renderer => renderer.sharedMesh.vertexCount),
                    triangles = renderers.Sum(renderer => renderer.sharedMesh.triangles.Length / 3),
                    heightMetres = 1.7, scale, sourceBounds = new[] { bounds.size.x, bounds.size.y, bounds.size.z },
                    animations = importedClips.Select(clip => new { clipName = clip.name, durationSeconds = clip.length, loop = clip.isLooping }).ToArray()
                };
                string output = ExportDirectory(id);
                Directory.CreateDirectory(output);
                File.WriteAllText(Path.Combine(output, "unity-report.json"), JsonConvert.SerializeObject(report, Formatting.Indented) + "\n");
                Debug.Log("Validated native Avatar " + id + ": " + JsonConvert.SerializeObject(report));
            }
            finally { Object.DestroyImmediate(instance); }
        }

        [MenuItem("PU Town/Avatars/Build platform bundles")]
        public static void BuildBundles()
        {
            Import();
            foreach (var platform in new[] { ("windows-x86_64", BuildTarget.StandaloneWindows64), ("macos-universal", BuildTarget.StandaloneOSX) })
            {
                if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, platform.Item2))
                    throw new InvalidOperationException("Missing native Avatar build support: " + platform.Item1);
                string output = "Builds/AvatarBundles/" + platform.Item1;
                Directory.CreateDirectory(output);
                AssetBundleBuild[] builds = Presets.Select(id => new AssetBundleBuild
                {
                    assetBundleName = id, assetNames = new[] { ArtRoot + "/" + id + "/avatar.prefab" }
                }).ToArray();
                AssetBundleManifest manifest = BuildPipeline.BuildAssetBundles(output, builds,
                    BuildAssetBundleOptions.ChunkBasedCompression | BuildAssetBundleOptions.StrictMode, platform.Item2);
                if (manifest == null) throw new InvalidOperationException("Native Avatar bundle build failed: " + platform.Item1);
                foreach (string id in Presets)
                {
                    string target = Path.Combine(ExportDirectory(id), platform.Item1 + ".bundle");
                    File.Copy(Path.Combine(output, id), target, true);
                }
                Debug.Log("Native Avatar bundles built for " + platform.Item1);
            }
        }

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
            string publicationPath = Path.Combine(RepositoryRoot, "campus", "assets", "avatars", "publication.json");
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

        public static void BuildAndReview()
        {
            BuildBundles();
            ValidateMacBundles();
            Debug.Log("Both native Avatar platform bundles built; actual macOS bundles loaded and rendered for art review.");
        }
    }
}
