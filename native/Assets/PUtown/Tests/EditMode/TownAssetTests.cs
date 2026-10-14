using System.Linq;
using NUnit.Framework;
using UnityEditor;
using UnityEngine;
using PUtown.Runtime;

namespace PUtown.Tests
{
    public sealed class TownAssetTests
    {
        [Test]
        public void WoodlandSquareHasOneContinuousPavedSurfaceAndTenSeats()
        {
            var prefab = Resources.Load<GameObject>("Towns/woodlandGarden");
            var square = prefab.transform.Find("Meeting Area");
            var paving = square.GetComponentsInChildren<Transform>().Where(t => t.name == "Meeting paving")
                .SelectMany(t => t.GetComponentsInChildren<MeshFilter>()).ToArray();
            Assert.That(paving, Has.Length.EqualTo(1), "The square should not use many overlapping paving tiles.");
            var town = NativeTownMaps.Load("woodland");
            foreach (var seat in town.Seats)
                Assert.That(Covers(paving[0], town.ToWorld((float)seat["x"], (float)seat["y"])), Is.True, "Paving must reach retained Seat " + seat["seat"]);
            Assert.That(square.GetComponentsInChildren<Transform>().Count(t => t.name.StartsWith("Seat:")), Is.EqualTo(10));
            Assert.That(prefab.GetComponentsInChildren<Collider>(true), Is.Empty);
        }

        private static bool Covers(MeshFilter filter, Vector3 point)
        {
            var vertices = filter.sharedMesh.vertices; var triangles = filter.sharedMesh.triangles;
            var local = filter.transform.InverseTransformPoint(point); var p = new Vector2(local.x, local.z);
            for (var i = 0; i < triangles.Length; i += 3)
            {
                var a = vertices[triangles[i]]; var b = vertices[triangles[i + 1]]; var c = vertices[triangles[i + 2]];
                var v0 = new Vector2(c.x - a.x, c.z - a.z); var v1 = new Vector2(b.x - a.x, b.z - a.z); var v2 = p - new Vector2(a.x, a.z);
                var d00 = Vector2.Dot(v0, v0); var d01 = Vector2.Dot(v0, v1); var d11 = Vector2.Dot(v1, v1);
                var denominator = d00 * d11 - d01 * d01; if (Mathf.Abs(denominator) < .000001f) continue;
                var u = (d11 * Vector2.Dot(v0, v2) - d01 * Vector2.Dot(v1, v2)) / denominator;
                var v = (d00 * Vector2.Dot(v1, v2) - d01 * Vector2.Dot(v0, v2)) / denominator;
                if (u >= -.001f && v >= -.001f && u + v <= 1.001f) return true;
            }
            return false;
        }

        [TestCase("woodland")]
        [TestCase("market")]
        public void StreetsKeepEverySavedBendInOneSurfacePerRoad(string mapId)
        {
            var prefab = Resources.Load<GameObject>("Towns/" + mapId + "Garden"); var town = NativeTownMaps.Load(mapId);
            foreach (var route in town.Data["routes"])
            {
                var street = prefab.transform.Find("Town streets").Find((string)route["name"]);
                var surfaces = street.GetComponentsInChildren<MeshFilter>();
                Assert.That(surfaces, Has.Length.EqualTo(1), "A road should not require separate renderers for repeated slabs.");
                foreach (var point in route["points"])
                    Assert.That(Covers(surfaces[0], town.ToWorld((float)point["x"], (float)point["y"])), Is.True, "The saved street bend must remain paved.");
            }
        }

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
