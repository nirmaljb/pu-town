using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
using Object = UnityEngine.Object;

namespace PUtown.Editor
{
    /// <summary>Import retained free KayKit Adventurers and animations. Build candidates; publication requires a separate visual review.</summary>
    public static class KayKitAvatarBuild
    {
        private const string ArtRoot = "Assets/Art/Avatars";
        private static readonly string[] Ids = { "kaykit-barbarian", "kaykit-knight", "kaykit-mage", "kaykit-ranger", "kaykit-rogue" };
        private static readonly string[] States = { "Standing", "Walking", "Seated" };
        private static string Repository => Path.GetFullPath(Environment.GetEnvironmentVariable("PU_TOWN_REPOSITORY") ?? "..");
        private static string Workshop => Path.Combine(Repository, "towns/assets/avatars");
        private static string Export(string id) => Path.Combine(Workshop, "exports", id);

        public static void RenderCandidates()
        {
            foreach (var id in Ids)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ArtRoot + "/" + id + "/avatar.prefab");
                if (prefab == null) throw new InvalidOperationException("Build the KayKit candidates before rendering: " + id);
                AvatarBuild.RenderEvidence(id, prefab);
            }
        }

        [MenuItem("PU Town/Avatars/Build KayKit candidates")]
        public static void BuildCandidates()
        {
            foreach (var id in Ids) CopySource(id);
            AssetDatabase.Refresh();
            foreach (var id in Ids) Import(id);
            AssetDatabase.SaveAssets();
            foreach (var platform in new[] { ("macos-universal", BuildTarget.StandaloneOSX), ("windows-x86_64", BuildTarget.StandaloneWindows64) })
            {
                if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, platform.Item2)) throw new InvalidOperationException("Missing Avatar target support: " + platform.Item1);
                var destination = "Builds/KayKitAvatarBundles/" + platform.Item1;
                Directory.CreateDirectory(destination);
                var builds = Ids.Select(id => new AssetBundleBuild { assetBundleName = id, assetNames = new[] { ArtRoot + "/" + id + "/avatar.prefab" } }).ToArray();
                if (BuildPipeline.BuildAssetBundles(destination, builds, BuildAssetBundleOptions.ChunkBasedCompression | BuildAssetBundleOptions.StrictMode, platform.Item2) == null) throw new InvalidOperationException("KayKit candidate bundle build failed.");
                foreach (var id in Ids) File.Copy(Path.Combine(destination, id), Path.Combine(Export(id), platform.Item1 + ".bundle"), true);
            }
            foreach (var id in Ids) WriteDraft(id);
        }

        private static void CopySource(string id)
        {
            var source = Export(id); var target = ArtRoot + "/" + id;
            Directory.CreateDirectory(target); Directory.CreateDirectory(target + "/textures");
            File.Copy(Path.Combine(source, "avatar.fbx"), target + "/avatar.fbx", true);
            foreach (var texture in Directory.GetFiles(Path.Combine(source, "textures"), "*.png")) File.Copy(texture, target + "/textures/" + Path.GetFileName(texture), true);
        }

        private static void Import(string id)
        {
            var source = ArtRoot + "/" + id + "/avatar.fbx";
            var importer = AssetImporter.GetAtPath(source) as ModelImporter ?? throw new InvalidOperationException("Missing derived FBX: " + source);
            importer.animationType = ModelImporterAnimationType.Human; importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
            importer.importAnimation = true; importer.importBlendShapes = false; importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            importer.materialLocation = ModelImporterMaterialLocation.InPrefab;
            var model = AssetDatabase.LoadAssetAtPath<GameObject>(source);
            var names = new Dictionary<HumanBodyBones, string>
            {
                [HumanBodyBones.Hips] = "hips", [HumanBodyBones.Spine] = "spine", [HumanBodyBones.Chest] = "chest", [HumanBodyBones.Head] = "head",
                [HumanBodyBones.LeftUpperArm] = "upperarm.l", [HumanBodyBones.LeftLowerArm] = "lowerarm.l", [HumanBodyBones.LeftHand] = "hand.l",
                [HumanBodyBones.RightUpperArm] = "upperarm.r", [HumanBodyBones.RightLowerArm] = "lowerarm.r", [HumanBodyBones.RightHand] = "hand.r",
                [HumanBodyBones.LeftUpperLeg] = "upperleg.l", [HumanBodyBones.LeftLowerLeg] = "lowerleg.l", [HumanBodyBones.LeftFoot] = "foot.l", [HumanBodyBones.LeftToes] = "toes.l",
                [HumanBodyBones.RightUpperLeg] = "upperleg.r", [HumanBodyBones.RightLowerLeg] = "lowerleg.r", [HumanBodyBones.RightFoot] = "foot.r", [HumanBodyBones.RightToes] = "toes.r"
            };
            var transforms = model.GetComponentsInChildren<Transform>(true);
            foreach (var entry in names) if (!transforms.Any(t => t.name == entry.Value)) throw new InvalidOperationException("Derived rig is missing " + entry.Value);
            var description = importer.humanDescription;
            description.human = names.Select(entry => new HumanBone { boneName = entry.Value, humanName = HumanTrait.BoneName[(int)entry.Key], limit = new HumanLimit { useDefaultValues = true } }).ToArray();
            description.skeleton = transforms.Select(t => new SkeletonBone { name = t.name, position = t.localPosition, rotation = t.localRotation, scale = t.localScale }).ToArray();
            description.armStretch = description.legStretch = .05f;
            description.upperArmTwist = description.lowerArmTwist = description.upperLegTwist = description.lowerLegTwist = .5f;
            importer.humanDescription = description;
            var clips = importer.defaultClipAnimations;
            foreach (var clip in clips)
            {
                var state = States.FirstOrDefault(s => clip.name.EndsWith(s, StringComparison.OrdinalIgnoreCase) || clip.takeName.EndsWith(s, StringComparison.OrdinalIgnoreCase));
                if (state == null) continue;
                clip.name = state; clip.loopTime = clip.loopPose = true;
                clip.lockRootRotation = clip.lockRootHeightY = clip.lockRootPositionXZ = true; clip.keepOriginalPositionY = true;
            }
            importer.clipAnimations = clips; importer.SaveAndReimport();
            model = AssetDatabase.LoadAssetAtPath<GameObject>(source);
            var avatar = AssetDatabase.LoadAllAssetsAtPath(source).OfType<Avatar>().FirstOrDefault();
            if (avatar == null || !avatar.isHuman || !avatar.isValid) throw new InvalidOperationException("Derived Avatar has no valid Humanoid mapping: " + id);
            var animations = AssetDatabase.LoadAllAssetsAtPath(source).OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview__")).ToArray();
            if (States.Any(s => !animations.Any(c => c.name == s && c.length > 0))) throw new InvalidOperationException("Missing derived animation: " + string.Join(",", animations.Select(c => c.name)));
            var controllerPath = ArtRoot + "/" + id + "/avatar.controller";
            var controller = AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath) ?? AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            if (controller.layers.Length == 0) controller.AddLayer("Base Layer");
            foreach (var previous in controller.layers[0].stateMachine.states) controller.layers[0].stateMachine.RemoveState(previous.state);
            foreach (var state in States)
            {
                var entry = controller.layers[0].stateMachine.AddState(state); entry.motion = animations.Single(c => c.name == state);
                if (state == "Standing") controller.layers[0].stateMachine.defaultState = entry;
            }
            EditorUtility.SetDirty(controller); AssetDatabase.SaveAssets();
            var root = new GameObject("avatar");
            try
            {
                var instance = Object.Instantiate(model, root.transform); instance.name = "Published KayKit model";
                var animator = instance.GetComponentInChildren<Animator>() ?? instance.AddComponent<Animator>();
                animator.avatar = avatar; animator.runtimeAnimatorController = controller; animator.applyRootMotion = false; animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                animator.Rebind(); animator.Update(0);
                var renderers = instance.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                if (renderers.Length < 1 || renderers.Any(r => r.sharedMesh == null || r.bones.Length == 0)) throw new InvalidOperationException("Incomplete clothed Avatar meshes: " + id);
                foreach (var renderer in renderers)
                {
                    renderer.updateWhenOffscreen = true;
                    renderer.sharedMaterials = renderer.sharedMaterials.Select(m => NativeMaterial(id, m)).ToArray();
                }
                animator.Play("Standing", 0, 0); animator.Update(0);
                var bounds = StandingBounds(renderers);
                if (bounds.size.y < .1f) throw new InvalidOperationException("The standing character has no measurable surface.");
                var scale = 1.7f / bounds.size.y; instance.transform.localScale *= scale;
                instance.transform.localPosition += new Vector3(0, -bounds.min.y * scale, 0);
                var prefab = PrefabUtility.SaveAsPrefabAsset(root, ArtRoot + "/" + id + "/avatar.prefab");
                if (prefab == null) throw new InvalidOperationException("Could not save KayKit candidate.");
                var report = new JObject
                {
                    ["preset"] = id, ["unityVersion"] = Application.unityVersion, ["validHumanoid"] = true, ["rootNode"] = prefab.name,
                    ["rigName"] = avatar.name, ["hipsBone"] = animator.GetBoneTransform(HumanBodyBones.Hips).name,
                    ["skinnedRenderers"] = renderers.Length, ["vertices"] = renderers.Sum(r => r.sharedMesh.vertexCount), ["triangles"] = renderers.Sum(r => r.sharedMesh.triangles.Length / 3),
                    ["heightMetres"] = 1.7, ["sourceBounds"] = new JArray(bounds.size.x, bounds.size.y, bounds.size.z),
                    ["animations"] = JArray.FromObject(States.Select(s => new { clipName = s, durationSeconds = animations.Single(c => c.name == s).length, loop = animations.Single(c => c.name == s).isLooping })),
                    ["materials"] = JArray.FromObject(renderers.SelectMany(r => r.sharedMaterials).Distinct().Select(m => new { name = m.name, baseTexture = m.mainTexture?.name, normalTexture = m.GetTexture("_BumpMap")?.name }))
                };
                File.WriteAllText(Path.Combine(Export(id), "unity-report.json"), report.ToString(Formatting.Indented) + "\n");
                Debug.Log("Imported clothed KayKit candidate " + id + ": " + report.ToString(Formatting.None));
            }
            finally { Object.DestroyImmediate(root); }
        }

        private static Bounds StandingBounds(IEnumerable<SkinnedMeshRenderer> renderers)
        {
            var first = true; var bounds = new Bounds();
            foreach (var renderer in renderers)
            {
                var mesh = new Mesh();
                try
                {
                    renderer.BakeMesh(mesh, true);
                    foreach (var vertex in mesh.vertices)
                    {
                        var point = renderer.transform.TransformPoint(vertex);
                        if (first) { bounds = new Bounds(point, Vector3.zero); first = false; }
                        else bounds.Encapsulate(point);
                    }
                }
                finally { Object.DestroyImmediate(mesh); }
            }
            return bounds;
        }

        private static Material NativeMaterial(string id, Material source)
        {
            if (source == null) throw new InvalidOperationException("Missing supplied KayKit atlas material.");
            var path = ArtRoot + "/" + id + "/character.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(Shader.Find("Standard")); AssetDatabase.CreateAsset(material, path); }
            var texture = ArtRoot + "/" + id + "/textures/" + id.Substring(7) + "_texture.png";
            var importer = AssetImporter.GetAtPath(texture) as TextureImporter ?? throw new InvalidOperationException("Missing original KayKit atlas: " + texture);
            importer.textureType = TextureImporterType.Default; importer.sRGBTexture = true; importer.maxTextureSize = 1024; importer.mipmapEnabled = true; importer.SaveAndReimport();
            material.color = Color.white; material.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(texture);
            material.SetFloat("_Glossiness", .18f); material.SetFloat("_Metallic", 0); material.enableInstancing = true;
            EditorUtility.SetDirty(material); return material;
        }

        private static void WriteDraft(string id)
        {
            var report = JObject.Parse(File.ReadAllText(Path.Combine(Export(id), "unity-report.json")));
            var authored = JObject.Parse(File.ReadAllText(Path.Combine(Export(id), "blender-report.json")));
            var masterRevision = (int)authored["masterRevision"];
            var master = JObject.Parse(File.ReadAllText(Path.Combine(Workshop, "masters", id, "v" + masterRevision, "master.json")));
            if ((string)master["sourceSha256"] != (string)authored["sourceSha256"]) throw new InvalidOperationException("The candidate does not match its registered immutable master.");
            var clips = (JArray)report["animations"];
            var animations = new JObject(); foreach (var state in States) animations[state.ToLowerInvariant()] = clips.Single(c => (string)c["clipName"] == state).DeepClone();
            var draft = new JObject
            {
                ["id"] = id, ["name"] = char.ToUpperInvariant(id[7]) + id.Substring(8),
                ["native"] = new JObject
                {
                    ["version"] = 1, ["masterId"] = id, ["masterRevision"] = masterRevision,
                    ["model"] = new JObject { ["sourceFile"] = "exports/" + id + "/avatar.fbx", ["rootNode"] = report["rootNode"], ["heightMetres"] = 1.7, ["pivot"] = "feet", ["forwardAxis"] = "+z" },
                    ["rig"] = new JObject { ["type"] = "humanoid", ["avatarName"] = report["rigName"], ["hipsBone"] = report["hipsBone"] }, ["animations"] = animations,
                    ["platformAssets"] = JArray.FromObject(new[] { "macos-universal", "windows-x86_64" }.Select(platform => new { platform, format = "unity-assetbundle", unityVersion = Application.unityVersion, assetName = (ArtRoot + "/" + id + "/avatar.prefab").ToLowerInvariant(), file = "exports/" + id + "/" + platform + ".bundle" }))
                },
                ["review"] = new JObject { ["sourceSha256"] = Digest(Path.Combine(Export(id), "avatar.fbx")), ["platformSha256"] = new JObject { ["macos-universal"] = Digest(Path.Combine(Export(id), "macos-universal.bundle")), ["windows-x86_64"] = Digest(Path.Combine(Export(id), "windows-x86_64.bundle")) }, ["checks"] = new JArray(), ["evidenceFiles"] = new JArray("exports/" + id + "/blender-report.json", "exports/" + id + "/unity-report.json") }
            };
            Directory.CreateDirectory(Path.Combine(Workshop, "drafts")); File.WriteAllText(Path.Combine(Workshop, "drafts", id + ".json"), draft.ToString(Formatting.Indented) + "\n");
        }
        private static string Digest(string file) { using (var hash = System.Security.Cryptography.SHA256.Create()) return string.Concat(hash.ComputeHash(File.ReadAllBytes(file)).Select(b => b.ToString("x2"))); }
    }
}
