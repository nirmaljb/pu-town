using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PUtown.Runtime;
using UnityEngine;
using UnityEngine.TestTools;

namespace PUtown.IntegrationTests
{
    /// <summary>Opt-in real Java Room publication, Unity AssetBundle loader and instantiated Humanoid test.</summary>
    public sealed class NativeAvatarRoomTests
    {
        private GameSession session;
        private NativeAvatarCollection collection;
        private readonly List<GameObject> avatars = new List<GameObject>();

        [UnityTest]
        public IEnumerator PublishedRoomAvatarsLoadAndInstantiateWithTheirDeclaredIdentity()
        {
            if (Environment.GetEnvironmentVariable("PU_TOWN_NATIVE_AVATAR_E2E") != "1")
                Assert.Ignore("Set PU_TOWN_NATIVE_AVATAR_E2E=1 with Java configured for the native Avatar publication.");
            var endpoint = Environment.GetEnvironmentVariable("PU_TOWN_NATIVE_AVATAR_WS") ?? "ws://127.0.0.1:8080/ws/game";
            session = new GameSession(endpoint, () => new GameSocket(), null);
            session.Create("Avatar integration");
            var deadline = Time.realtimeSinceStartup + 15;
            while (Time.realtimeSinceStartup < deadline && !(session.Status == SessionStatus.Active && session.World.MapId == "woodland" && !session.SelectingTown))
            {
                session.ApplyFrame();
                Assert.That(session.Status, Is.Not.EqualTo(SessionStatus.Failed), session.Error);
                yield return null;
            }
            Assert.That(session.Status, Is.EqualTo(SessionStatus.Active), session.Error ?? "Native Room creation timed out.");
            Assert.That(session.World.MapId, Is.EqualTo("woodland")); Assert.That(session.SelectingTown, Is.False);

            collection = new NativeAvatarCollection(); var completed = false; string error = null;
            yield return collection.Fetch(endpoint, session.World.RoomId, result => { error = result; completed = true; });
            Assert.That(completed, Is.True, "The native collection fetch must finish.");
            Assert.That(error, Is.Null, error);
            Assert.That(collection.Covers(session.World), Is.True, "Every Player must resolve from the Room's pinned publication.");
            Assert.That(collection.Presets.Count, Is.GreaterThan(0));
            foreach (var preset in collection.Presets.Values)
            {
                var manifest = preset.Manifest;
                Assert.That(preset.Prefab.name, Is.EqualTo((string)manifest["model"]["rootNode"]));
                var instance = UnityEngine.Object.Instantiate(preset.Prefab); avatars.Add(instance);
                var animator = instance.GetComponentInChildren<Animator>();
                Assert.That(animator, Is.Not.Null); Assert.That(animator.avatar.isValid && animator.avatar.isHuman, Is.True);
                Assert.That(animator.avatar.name, Is.EqualTo((string)manifest["rig"]["avatarName"]));
                animator.cullingMode = AnimatorCullingMode.AlwaysAnimate; animator.Rebind(); animator.Update(0);
                var hips = animator.GetBoneTransform(HumanBodyBones.Hips);
                Assert.That(hips, Is.Not.Null); Assert.That(hips.name, Is.EqualTo((string)manifest["rig"]["hipsBone"]));
                var renderers = instance.GetComponentsInChildren<SkinnedMeshRenderer>(true);
                Assert.That(renderers.Length, Is.GreaterThan(0));
                Assert.That(renderers.All(renderer => renderer.sharedMesh != null && renderer.bones.Length > 0 && renderer.bones.All(bone => bone != null)), Is.True);
                foreach (var state in new[] { "standing", "walking", "seated" })
                {
                    var expected = manifest["animations"][state]; var clipName = (string)expected["clipName"];
                    var clip = animator.runtimeAnimatorController.animationClips.SingleOrDefault(candidate => candidate.name == clipName);
                    Assert.That(clip, Is.Not.Null); Assert.That(clip.length, Is.EqualTo((float)expected["durationSeconds"]).Within(.02f));
                    Assert.That(clip.isLooping, Is.EqualTo((bool)expected["loop"]));
                    Assert.That(animator.HasState(0, Animator.StringToHash(clipName)), Is.True, "The native controller must play the published clip: " + clipName);
                    animator.Play(clipName, 0, .25f); animator.Update(0);
                    Assert.That(animator.GetBoneTransform(HumanBodyBones.Hips), Is.EqualTo(hips));
                }
                Debug.Log("Native Room Avatar loaded and instantiated: " + preset.Id + ", root=" + preset.Prefab.name + ", rig=" + animator.avatar.name + ", clips=standing/walking/seated.");
            }
        }

        [UnityTearDown]
        public IEnumerator Cleanup()
        {
            foreach (var avatar in avatars) if (avatar != null) UnityEngine.Object.Destroy(avatar);
            avatars.Clear(); yield return null; collection?.Dispose(); collection = null;
            session?.Leave(); yield return new WaitForSecondsRealtime(.1f); session?.ApplyFrame(); session?.Dispose(); session = null;
        }
    }
}
