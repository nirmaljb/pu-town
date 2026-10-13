using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace PUtown.Runtime
{
    public sealed class NativeAvatarPreset
    {
        public readonly string Id, Name;
        public readonly JObject Manifest;
        public readonly GameObject Prefab;
        public readonly AssetBundle Bundle;
        public NativeAvatarPreset(string id, string name, JObject manifest, GameObject prefab, AssetBundle bundle) { Id = id; Name = name; Manifest = manifest; Prefab = prefab; Bundle = bundle; }
    }
    public sealed class NativeAvatarCollection : IDisposable
    {
        public string CollectionId { get; private set; }
        public IReadOnlyDictionary<string, NativeAvatarPreset> Presets { get { return presets; } }
        private readonly Dictionary<string, NativeAvatarPreset> presets = new Dictionary<string, NativeAvatarPreset>();

        public static JObject ValidateManifest(string json, string platform, string unityVersion)
        {
            var collection = StrictProtocol.ParseObject(json, 268435456); StrictProtocol.Fields(collection, "version", "collectionId", "presets");
            if (StrictProtocol.Integer(collection["version"]) != 2) throw new FormatException("This native client requires Avatar Collection version 2.");
            StrictProtocol.Text(collection["collectionId"]); var presets = StrictProtocol.Array(collection["presets"]);
            if (presets.Count < 1) throw new FormatException("Avatar Collection must contain at least one complete design.");
            var ids = new HashSet<string>();
            foreach (var token in presets)
            {
                var p = StrictProtocol.Obj(token); StrictProtocol.Fields(p, "id", "name", "native");
                var id = StrictProtocol.Text(p["id"]); if (!Regex.IsMatch(id, "^[a-z0-9][a-z0-9-]{0,63}$") || !ids.Add(id)) throw new FormatException("Invalid or duplicate Avatar Preset ID.");
                StrictProtocol.DisplayName(StrictProtocol.Text(p["name"])); var n = StrictProtocol.Obj(p["native"]);
                StrictProtocol.Fields(n, "version", "masterId", "masterRevision", "model", "rig", "animations", "platformAssets");
                if (StrictProtocol.Integer(n["version"]) != 1) throw new FormatException("Unsupported native Avatar manifest.");
                if (!Regex.IsMatch(StrictProtocol.Text(n["masterId"]), "^[a-z0-9][a-z0-9-]{0,63}$") || StrictProtocol.Round(n["masterRevision"]) > int.MaxValue) throw new FormatException("Invalid native Avatar master identity.");
                var model = StrictProtocol.Obj(n["model"]); StrictProtocol.Fields(model, "sourceSha256", "rootNode", "heightMetres", "pivot", "forwardAxis");
                Digest(model["sourceSha256"]); StrictProtocol.Text(model["rootNode"]); if (StrictProtocol.Number(model["heightMetres"]) <= 0) throw new FormatException("Invalid Avatar height.");
                StrictProtocol.Member(model["pivot"], "feet"); StrictProtocol.Member(model["forwardAxis"], "+z");
                var rig = StrictProtocol.Obj(n["rig"]); StrictProtocol.Fields(rig, "type", "avatarName", "hipsBone"); StrictProtocol.Member(rig["type"], "humanoid"); StrictProtocol.Text(rig["avatarName"]); StrictProtocol.Text(rig["hipsBone"]);
                var animations = StrictProtocol.Obj(n["animations"]); StrictProtocol.Fields(animations, "standing", "walking", "seated");
                foreach (var state in new[] { "standing", "walking", "seated" })
                {
                    var clip = StrictProtocol.Obj(animations[state]); StrictProtocol.Fields(clip, "clipName", "durationSeconds", "loop"); StrictProtocol.Text(clip["clipName"]);
                    if (StrictProtocol.Number(clip["durationSeconds"]) <= 0 || !StrictProtocol.Bool(clip["loop"])) throw new FormatException("Invalid animation duration or loop.");
                }
                var platforms = new HashSet<string>();
                foreach (var assetToken in StrictProtocol.Array(n["platformAssets"]))
                {
                    var asset = StrictProtocol.Obj(assetToken); StrictProtocol.Fields(asset, "platform", "format", "unityVersion", "assetName", "sha256", "byteLength", "data");
                    var target = StrictProtocol.Member(asset["platform"], "windows-x86_64", "macos-universal"); if (!platforms.Add(target)) throw new FormatException("Duplicate Avatar platform.");
                    StrictProtocol.Member(asset["format"], "unity-assetbundle"); StrictProtocol.Text(asset["assetName"]); Digest(asset["sha256"]); StrictProtocol.Text(asset["unityVersion"]); StrictProtocol.Text(asset["data"]);
                    var bytes = StrictProtocol.Integer(asset["byteLength"]); if (bytes < 8 || bytes > 67108864) throw new FormatException("Invalid Avatar bundle size.");
                    if ((string)asset["unityVersion"] != unityVersion) throw new FormatException("Avatar bundle was built for a different Unity version.");
                    BundleBytes(asset);
                    if (target == platform)
                    {
                        // Runtime loading selects this platform; both published payloads were integrity checked above.
                    }
                }
                if (platforms.Count != 2 || !platforms.Contains(platform)) throw new FormatException("Both desktop Avatar platform assets are required.");
            }
            return collection;
        }
        private static void Digest(JToken value) { if (!Regex.IsMatch(StrictProtocol.Text(value), "^[a-f0-9]{64}$")) throw new FormatException("Invalid asset SHA-256."); }
        private static byte[] BundleBytes(JObject asset)
        {
            var bytes = Convert.FromBase64String((string)asset["data"]);
            if (bytes.LongLength != (long)asset["byteLength"]) throw new FormatException("Avatar bundle length mismatch.");
            if (bytes.Length < 8 || bytes[0] != 'U' || bytes[1] != 'n' || bytes[2] != 'i' || bytes[3] != 't' || bytes[4] != 'y' || bytes[5] != 'F' || bytes[6] != 'S' || bytes[7] != 0) throw new FormatException("Avatar bundle is not a UnityFS asset.");
            using (var sha = SHA256.Create())
            {
                var hash = string.Concat(sha.ComputeHash(bytes).Select(b => b.ToString("x2")));
                if (hash != (string)asset["sha256"]) throw new FormatException("Avatar bundle integrity check failed.");
            }
            return bytes;
        }
        public IEnumerator Fetch(string endpoint, string roomId, Action<string> completed)
        {
            var source = new Uri(endpoint); var uri = new UriBuilder(source) { Scheme = source.Scheme == "wss" ? "https" : "http", Path = "/rooms/" + Uri.EscapeDataString(roomId) + "/avatars", Query = "version=2" }.Uri;
            using (var request = UnityWebRequest.Get(uri))
            {
                request.timeout = 10; yield return request.SendWebRequest();
                if (request.result != UnityWebRequest.Result.Success)
                { completed(request.responseCode == 409 ? "This Room has no published native Avatar Collection. Publish native designs and create a new Room." : "Could not load the Room's Avatar Collection. " + request.error); yield break; }
                string error = null;
                try
                {
                    var platform = Application.platform == RuntimePlatform.WindowsPlayer || Application.platform == RuntimePlatform.WindowsEditor ? "windows-x86_64" : "macos-universal";
                    var manifest = ValidateManifest(request.downloadHandler.text, platform, Application.unityVersion);
                    Load(manifest, platform);
                }
                catch (Exception e) when (e is FormatException || e is JsonException || e is InvalidOperationException || e is ArgumentException)
                { Dispose(); error = "The Room's native Avatar Collection is invalid. " + e.Message; }
                completed(error);
            }
        }
        private void Load(JObject collection, string platform)
        {
            Dispose(); CollectionId = (string)collection["collectionId"];
            foreach (var p in (JArray)collection["presets"])
            {
                var manifest = (JObject)p["native"]; var asset = ((JArray)manifest["platformAssets"]).Cast<JObject>().Single(a => (string)a["platform"] == platform);
                var bundle = AssetBundle.LoadFromMemory(BundleBytes(asset)); if (bundle == null) throw new FormatException("AssetBundle cannot be loaded by this runtime.");
                try
                {
                    var prefab = bundle.LoadAsset<GameObject>((string)asset["assetName"]); if (prefab == null) throw new FormatException("Published Avatar prefab is missing.");
                    if (prefab.name != (string)manifest["model"]["rootNode"]) throw new FormatException("Avatar root does not match its manifest.");
                    var animator = prefab.GetComponentInChildren<Animator>();
                    if (animator == null || animator.avatar == null || !animator.avatar.isValid || !animator.avatar.isHuman || animator.runtimeAnimatorController == null) throw new FormatException("Avatar needs a complete Humanoid rig and animation controller.");
                    if (animator.avatar.name != (string)manifest["rig"]["avatarName"] || !prefab.GetComponentsInChildren<Transform>(true).Any(t => t.name == (string)manifest["rig"]["hipsBone"])) throw new FormatException("Avatar rig does not match its manifest.");
                    if (!prefab.GetComponentsInChildren<Renderer>(true).Any()) throw new FormatException("Avatar has no rendered model.");
                    foreach (var state in new[] { "standing", "walking", "seated" })
                    {
                        var animation = manifest["animations"][state]; var name = (string)animation["clipName"];
                        var clip = animator.runtimeAnimatorController.animationClips.FirstOrDefault(c => c.name == name);
                        if (clip == null || Mathf.Abs(clip.length - (float)animation["durationSeconds"]) > .02f || clip.isLooping != (bool)animation["loop"]) throw new FormatException("Avatar animation does not match its manifest.");
                    }
                    var id = (string)p["id"]; presets.Add(id, new NativeAvatarPreset(id, (string)p["name"], manifest, prefab, bundle));
                }
                catch { bundle.Unload(true); throw; }
            }
        }
        public bool Covers(NativeWorld world)
        {
            return presets.Count > 0 && world.Players.Values.All(p => presets.ContainsKey((string)p["avatarPreset"])) && ((JArray)world.Game?["players"] ?? new JArray()).All(p => presets.ContainsKey((string)p["avatarPreset"]));
        }
        public void Dispose() { foreach (var p in presets.Values) p.Bundle.Unload(true); presets.Clear(); CollectionId = null; }
    }
}
