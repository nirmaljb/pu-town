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
    /// <summary>Import retained clothed Standard derivatives. Build candidates; publication requires a separate visual review.</summary>
    public static class QuaterniusAvatarBuild
    {
        private const string ArtRoot = "Assets/Art/Avatars";
        private static readonly string[] Ids = { "campus-ash", "campus-lea" };
        private static readonly string[] States = { "Standing", "Walking", "Seated" };
        private static string Repository => Path.GetFullPath(Environment.GetEnvironmentVariable("PU_TOWN_REPOSITORY") ?? "..");
        private static string Workshop => Path.Combine(Repository, "campus/assets/avatars");
        private static string Export(string id) => Path.Combine(Workshop, "exports", id);

        public static void RenderCandidates()
        {
            foreach (var id in Ids)
            {
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(ArtRoot + "/" + id + "/avatar.prefab");
                if (prefab == null) throw new InvalidOperationException("Build the Quaternius candidates before rendering: " + id);
                AvatarBuild.RenderEvidence(id, prefab);
            }
        }

        [MenuItem("PU Town/Avatars/Build Quaternius candidates")]
        public static void BuildCandidates()
        {
            foreach (var id in Ids) CopySource(id);
            AssetDatabase.Refresh();
            foreach (var id in Ids) Import(id);
            AssetDatabase.SaveAssets();
            foreach (var platform in new[] { ("macos-universal", BuildTarget.StandaloneOSX), ("windows-x86_64", BuildTarget.StandaloneWindows64) })
            {
                if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, platform.Item2)) throw new InvalidOperationException("Missing Avatar target support: " + platform.Item1);
                var destination = "Builds/QuaterniusAvatarBundles/" + platform.Item1;
                Directory.CreateDirectory(destination);
                var builds = Ids.Select(id => new AssetBundleBuild { assetBundleName = id, assetNames = new[] { ArtRoot + "/" + id + "/avatar.prefab" } }).ToArray();
                if (BuildPipeline.BuildAssetBundles(destination, builds, BuildAssetBundleOptions.ChunkBasedCompression | BuildAssetBundleOptions.StrictMode, platform.Item2) == null) throw new InvalidOperationException("Quaternius candidate bundle build failed.");
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
                [HumanBodyBones.Hips] = "pelvis", [HumanBodyBones.Spine] = "spine_01", [HumanBodyBones.Chest] = "spine_02", [HumanBodyBones.UpperChest] = "spine_03",
                [HumanBodyBones.Neck] = "neck_01", [HumanBodyBones.Head] = "Head",
                [HumanBodyBones.LeftShoulder] = "clavicle_l", [HumanBodyBones.LeftUpperArm] = "upperarm_l", [HumanBodyBones.LeftLowerArm] = "lowerarm_l", [HumanBodyBones.LeftHand] = "hand_l",
                [HumanBodyBones.RightShoulder] = "clavicle_r", [HumanBodyBones.RightUpperArm] = "upperarm_r", [HumanBodyBones.RightLowerArm] = "lowerarm_r", [HumanBodyBones.RightHand] = "hand_r",
                [HumanBodyBones.LeftUpperLeg] = "thigh_l", [HumanBodyBones.LeftLowerLeg] = "calf_l", [HumanBodyBones.LeftFoot] = "foot_l", [HumanBodyBones.LeftToes] = "ball_l",
                [HumanBodyBones.RightUpperLeg] = "thigh_r", [HumanBodyBones.RightLowerLeg] = "calf_r", [HumanBodyBones.RightFoot] = "foot_r", [HumanBodyBones.RightToes] = "ball_r"
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
            if (AssetDatabase.LoadAssetAtPath<AnimatorController>(controllerPath) != null) AssetDatabase.DeleteAsset(controllerPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            foreach (var state in States)
            {
                var entry = controller.layers[0].stateMachine.AddState(state); entry.motion = animations.Single(c => c.name == state);
                if (state == "Standing") controller.layers[0].stateMachine.defaultState = entry;
            }
            var root = new GameObject("avatar");
            try
            {
                var instance = Object.Instantiate(model, root.transform); instance.name = "Published Quaternius model";
                var animator = instance.GetComponentInChildren<Animator>() ?? instance.AddComponent<Animator>();
                animator.avatar = avatar; animator.runtimeAnimatorController = controller; animator.applyRootMotion = false; animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                animator.Rebind(); animator.Update(0);
                var renderers = instance.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                if (renderers.Length < 7 || renderers.Any(r => r.sharedMesh == null || r.bones.Length == 0)) throw new InvalidOperationException("Incomplete clothed Avatar meshes: " + id);
                foreach (var renderer in renderers)
                {
                    renderer.updateWhenOffscreen = true;
                    renderer.sharedMaterials = renderer.sharedMaterials.Select(m => NativeMaterial(id, m)).ToArray();
                }
                var bounds = renderers[0].bounds; foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
                var scale = 1.7f / bounds.size.y; instance.transform.localScale = Vector3.one * scale;
                instance.transform.localPosition = new Vector3(0, -bounds.min.y * scale, 0);
                var prefab = PrefabUtility.SaveAsPrefabAsset(root, ArtRoot + "/" + id + "/avatar.prefab");
                if (prefab == null) throw new InvalidOperationException("Could not save Quaternius candidate.");
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
                Debug.Log("Imported clothed Quaternius candidate " + id + ": " + report.ToString(Formatting.None));
            }
            finally { Object.DestroyImmediate(root); }
        }

        private static Material NativeMaterial(string id, Material source)
        {
            if (source == null) throw new InvalidOperationException("Missing source material.");
            var name = source.name.Split('.')[0]; var female = id == "campus-lea";
            string colour, normal, orm = null, roughness = null;
            if (name.StartsWith("MI_Peasant")) { colour = female ? "T_Peasant_2_BaseColor" : "T_Peasant_BaseColor"; normal = "T_Peasant_Normal"; orm = "T_Peasant_ORM"; }
            else if (name.StartsWith("MI_Hair")) { var set = name.Contains("2") ? "2" : "1"; colour = "T_Hair_" + set + "_BaseColor"; normal = "T_Hair_" + set + "_Normal"; }
            else if (name.StartsWith("MI_Eyes")) { colour = "T_Eye_Brown"; normal = "T_Eye_Normal"; }
            else if (name.StartsWith("MI_Superhero")) { colour = female ? "T_Superhero_Female_Dark_BaseColor" : "T_Superhero_Male_Dark"; normal = "T_Superhero_" + (female ? "Female" : "Male") + "_Normal"; roughness = "T_Superhero_" + (female ? "Female" : "Male") + "_Roughness"; }
            else if (name.StartsWith("MI_Regular_Male")) { colour = "T_Regular_Male_Dark_BaseColor"; normal = "T_Regular_Male_Normal"; roughness = "T_Regular_Male_Roughness"; }
            else throw new InvalidOperationException("Unsupported retained Standard material: " + name);
            var path = ArtRoot + "/" + id + "/" + name + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(Shader.Find("Standard")) { name = name }; AssetDatabase.CreateAsset(material, path); }
            material.color = name.StartsWith("MI_Hair") ? new Color(.16f, .10f, .07f) : Color.white;
            material.mainTexture = Texture(id, colour, false, false); material.SetTexture("_BumpMap", Texture(id, normal, true, false)); material.EnableKeyword("_NORMALMAP");
            material.SetFloat("_Glossiness", .2f); material.SetFloat("_Metallic", 0);
            if (orm != null || roughness != null)
            {
                var packed = Texture(id, orm ?? roughness, false, true); var pixels = packed.GetPixels32();
                for (var i = 0; i < pixels.Length; ++i) { var p = pixels[i]; pixels[i] = new Color32(orm == null ? (byte)0 : p.b, 0, 0, (byte)(255 - (orm == null ? p.r : p.g))); }
                var converted = new Texture2D(packed.width, packed.height, TextureFormat.RGBA32, false, true); converted.SetPixels32(pixels); converted.Apply();
                var output = ArtRoot + "/" + id + "/textures/" + name + "_MetallicSmoothness.png"; File.WriteAllBytes(output, converted.EncodeToPNG()); Object.DestroyImmediate(converted);
                AssetDatabase.ImportAsset(output); var texImporter = (TextureImporter)AssetImporter.GetAtPath(output); texImporter.sRGBTexture = false; texImporter.maxTextureSize = 1024; texImporter.SaveAndReimport();
                material.SetTexture("_MetallicGlossMap", AssetDatabase.LoadAssetAtPath<Texture2D>(output)); material.EnableKeyword("_METALLICGLOSSMAP"); material.SetFloat("_GlossMapScale", .6f);
            }
            EditorUtility.SetDirty(material); return material;
        }

        private static Texture2D Texture(string id, string name, bool normal, bool readable)
        {
            var path = ArtRoot + "/" + id + "/textures/" + name + ".png";
            var importer = AssetImporter.GetAtPath(path) as TextureImporter ?? throw new InvalidOperationException("Missing retained character texture: " + path);
            importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default; importer.sRGBTexture = !normal && !readable;
            importer.isReadable = readable; importer.maxTextureSize = 1024; importer.mipmapEnabled = true; importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
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
                ["id"] = id, ["name"] = id == "campus-ash" ? "Ash" : "Lea",
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
