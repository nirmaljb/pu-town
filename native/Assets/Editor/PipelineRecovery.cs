using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEngine;

namespace PUtown.Editor
{
    // Editor-only recovery for an experimental Pipeline descriptor disappearing
    // after a domain reload. Uses the package's own restart API; never exits Unity.
    public static class PipelineRecovery
    {
        [InitializeOnLoadMethod]
        private static void AfterReload()
        {
            EditorApplication.delayCall += RecoverMissingDescriptor;
        }

        [MenuItem("PU Town/Recover local Pipeline discovery")]
        public static void RecoverMissingDescriptor()
        {
            if (AssetDatabase.IsAssetImportWorkerProcess() || EditorApplication.isCompiling) return;
            if (File.Exists("Library/Pipeline/.unity-pipeline-port")) return;
            var startup = Type.GetType("Unity.Pipeline.Editor.PipelineServerStartup, Unity.Pipeline.Editor");
            var method = startup?.GetMethod("RestartServer", BindingFlags.Public | BindingFlags.Static);
            if (method == null) return;
            try
            {
                method.Invoke(null, null);
                Debug.Log("PU Town restored local Pipeline discovery without closing the editor");
            }
            catch (Exception error)
            {
                Debug.LogError("PU Town Pipeline recovery failed: " + error.GetBaseException().Message);
            }
        }
    }
}
