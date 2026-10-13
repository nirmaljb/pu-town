using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PUtown.Runtime;

namespace PUtown.Tests
{
    public sealed class NativeAvatarContractTests
    {
        private static JObject Collection()
        {
            // Contract fixture only. Unity must load and inspect real platform bundles in integration acceptance.
            var bytes = Encoding.UTF8.GetBytes("UnityFS\0manifest-fixture"); string hash;
            using (var sha = SHA256.Create()) hash = string.Concat(sha.ComputeHash(bytes).Select(b => b.ToString("x2")));
            var platforms = new JArray();
            foreach (var target in new[] { "windows-x86_64", "macos-universal" }) platforms.Add(new JObject { ["platform"] = target, ["format"] = "unity-assetbundle", ["unityVersion"] = "6000.6.0f1", ["assetName"] = "assets/avatar.prefab", ["sha256"] = hash, ["byteLength"] = bytes.Length, ["data"] = Convert.ToBase64String(bytes) });
            var animations = new JObject(); foreach (var state in new[] { "standing", "walking", "seated" }) animations[state] = new JObject { ["clipName"] = state, ["durationSeconds"] = 2.0, ["loop"] = true };
            return new JObject { ["version"] = 2, ["collectionId"] = "collection-1", ["presets"] = new JArray(new JObject { ["id"] = "campus-scholar", ["name"] = "Scholar", ["native"] = new JObject { ["version"] = 1, ["masterId"] = "campus-master", ["masterRevision"] = 1, ["model"] = new JObject { ["sourceSha256"] = new string('a', 64), ["rootNode"] = "Avatar", ["heightMetres"] = 1.7, ["pivot"] = "feet", ["forwardAxis"] = "+z" }, ["rig"] = new JObject { ["type"] = "humanoid", ["avatarName"] = "Humanoid", ["hipsBone"] = "Hips" }, ["animations"] = animations, ["platformAssets"] = platforms } }) };
        }
        [Test]
        public void RoomCollectionRequiresBothVersionedIntegrityCheckedPlatformAssets()
        {
            var collection = Collection(); Assert.That(() => NativeAvatarCollection.ValidateManifest(collection.ToString(), "macos-universal", "6000.6.0f1"), Throws.Nothing);
            ((JArray)collection["presets"][0]["native"]["platformAssets"]).RemoveAt(0);
            Assert.That(() => NativeAvatarCollection.ValidateManifest(collection.ToString(), "macos-universal", "6000.6.0f1"), Throws.TypeOf<FormatException>());
        }
        [Test]
        public void ChangedAssetBytesAndUnknownMetadataAreRejectedBeforeBundleLoad()
        {
            var collection = Collection(); collection["presets"][0]["native"]["platformAssets"][0]["data"] = Convert.ToBase64String(Encoding.UTF8.GetBytes("UnityFS\0changed-fixture"));
            Assert.That(() => NativeAvatarCollection.ValidateManifest(collection.ToString(), "macos-universal", "6000.6.0f1"), Throws.TypeOf<FormatException>());
            collection = Collection(); collection["presets"][0]["native"]["model"]["extra"] = true;
            Assert.That(() => NativeAvatarCollection.ValidateManifest(collection.ToString(), "macos-universal", "6000.6.0f1"), Throws.TypeOf<FormatException>());
        }
        [Test]
        public void OlderSpriteCollectionAndIncompatibleUnityAssetsRequireExplicitReplacement()
        {
            var collection = Collection(); collection["version"] = 1; Assert.That(() => NativeAvatarCollection.ValidateManifest(collection.ToString(), "macos-universal", "6000.6.0f1"), Throws.TypeOf<FormatException>());
            collection = Collection(); collection["presets"][0]["native"]["platformAssets"][1]["unityVersion"] = "6000.5.0f1";
            Assert.That(() => NativeAvatarCollection.ValidateManifest(collection.ToString(), "macos-universal", "6000.6.0f1"), Throws.TypeOf<FormatException>());
        }
    }
}
