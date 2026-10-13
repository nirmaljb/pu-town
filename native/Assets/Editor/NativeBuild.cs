using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace PUtown.Editor
{
    public static class NativeBuild
    {
        public const string ScenePath = "Assets/Scenes/Campus.unity";

        [MenuItem("PU Town/Prepare authoring proof")]
        public static void PrepareAuthoringProof()
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var model = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Art/Starter/starter-courtyard.obj");
            if (model == null) throw new InvalidOperationException("Import the Blender starter before preparing the scene.");
            PrefabUtility.InstantiatePrefab(model);
            new GameObject("Server health").AddComponent<PUtown.Bootstrap.ServerHealth>();
            var camera = new GameObject("Camera").AddComponent<Camera>();
            camera.tag = "MainCamera";
            camera.transform.position = new Vector3(3, 3, -3);
            camera.transform.LookAt(new Vector3(0, .2f, 0));
            camera.backgroundColor = new Color(.28f, .43f, .34f);
            var sunlight = new GameObject("Sunlight").AddComponent<Light>();
            sunlight.type = LightType.Directional;
            sunlight.transform.rotation = Quaternion.Euler(45, -30, 0);
            RenderSettings.ambientLight = new Color(.48f, .55f, .52f);
            EditorSceneManager.SaveScene(scene, "Assets/Scenes/AuthoringProof.unity");
            AssetDatabase.SaveAssets();
        }

        [MenuItem("PU Town/Prepare starter scene")]
        public static void Prepare()
        {
            QuaterniusCampusBuild.Prepare();
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var root = new GameObject("PU Town");
            root.AddComponent<PUtown.Bootstrap.ServerHealth>();
            var native = Type.GetType("PUtown.Runtime.NativeGameClient, PUtown.Runtime");
            if (native != null) root.AddComponent(native);
            else throw new InvalidOperationException("NativeGameClient runtime must compile before preparing the scene.");
            RenderSettings.ambientLight = new Color(.65f, .72f, .67f);
            var sunlight = new GameObject("Sunlight").AddComponent<Light>();
            sunlight.type = LightType.Directional;
            sunlight.transform.rotation = Quaternion.Euler(50, -25, 0);
            sunlight.color = new Color(1f, .96f, .87f);
            sunlight.intensity = .95f;
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            PlayerSettings.companyName = "PU Town";
            PlayerSettings.productName = "PU Town";
            PlayerSettings.iOS.microphoneUsageDescription = "Use your microphone to speak to authorized nearby Players and the Townhall.";
            // The SDK includes WebCamTexture types even though this client never creates camera capture.
            PlayerSettings.iOS.cameraUsageDescription = "PU Town does not enable camera capture.";
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Standalone, "dev.putown.campus");
            PlayerSettings.defaultScreenWidth = 1920;
            PlayerSettings.defaultScreenHeight = 1080;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);
            AssetDatabase.SaveAssets();
            Debug.Log("PU Town editable starter scene prepared");
        }

        public static void BuildMac() => Build(BuildTarget.StandaloneOSX, "Builds/macOS/PU Town.app");
        public static void BuildWindows() => Build(BuildTarget.StandaloneWindows64, "Builds/Windows/PU Town.exe");

        private static void Build(BuildTarget target, string path)
        {
            if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.Standalone, target))
                throw new InvalidOperationException("Missing build support for " + target);
            Prepare();
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath }, locationPathName = path,
                target = target, options = BuildOptions.None
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new InvalidOperationException("Native build failed: " + report.summary.result);
            Debug.Log("PU Town build: " + path + "; bytes=" + report.summary.totalSize);
        }
    }
}
