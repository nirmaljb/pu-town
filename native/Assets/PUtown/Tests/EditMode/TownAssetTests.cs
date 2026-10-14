using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;

namespace PUtown.Tests
{
    public sealed class TownAssetTests
    {
        [TestCase("barbarian")]
        [TestCase("knight")]
        [TestCase("mage")]
        [TestCase("ranger")]
        [TestCase("rogue")]
        public void SuppliedCharacterStandsAtItsPublishedFeetPivotAndHeight(string character)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Art/Avatars/kaykit-" + character + "/avatar.prefab");
            Assert.That(prefab, Is.Not.Null);
            var instance = Object.Instantiate(prefab);
            try
            {
                var animator = instance.GetComponentInChildren<Animator>();
                animator.Rebind(); animator.Play("Standing", 0, 0); animator.Update(0);
                var first = true; var bounds = new Bounds();
                foreach (var renderer in instance.GetComponentsInChildren<SkinnedMeshRenderer>())
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
                Assert.That(first, Is.False);
                Assert.That(bounds.min.y, Is.EqualTo(0).Within(.025f), "The standing mesh must rest on the accepted feet position.");
                Assert.That(bounds.size.y, Is.EqualTo(1.7f).Within(.05f), "The actual standing mesh must match model.heightMetres.");
            }
            finally { Object.DestroyImmediate(instance); }
        }
    }
}
