using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace PUtown.Editor
{
    /// <summary>Continuous, world-textured cosmetic surfaces; every collision remains in canonical Town rules.</summary>
    internal static class TownPavingBuild
    {
        public static void Square(Transform parent, Vector3 centre, float radius, float shortRadius, Material material, string mapId)
        {
            const int sides = 96;
            var vertices = new Vector3[sides + 1]; var triangles = new int[sides * 3];
            vertices[0] = centre;
            for (var i = 0; i < sides; i++)
            {
                var angle = i * Mathf.PI * 2 / sides;
                vertices[i + 1] = centre + new Vector3(Mathf.Cos(angle) * radius, 0, Mathf.Sin(angle) * shortRadius);
                triangles[i * 3] = 0; triangles[i * 3 + 1] = (i + 1) % sides + 1; triangles[i * 3 + 2] = i + 1;
            }
            Save(parent, "Meeting paving", mapId + "-square", vertices, triangles, material);
        }

        public static void Street(Transform parent, string name, string assetId, Vector3[] points, float width, Material material)
        {
            if (points.Length < 2) throw new ArgumentException("A street needs at least two distinct points.");
            var vertices = new Vector3[points.Length * 2]; var triangles = new int[(points.Length - 1) * 6];
            for (var i = 0; i < points.Length; i++)
            {
                var incoming = i == 0 ? points[1] - points[0] : points[i] - points[i - 1];
                var outgoing = i == points.Length - 1 ? incoming : points[i + 1] - points[i];
                if (incoming.sqrMagnitude < .000001f || outgoing.sqrMagnitude < .000001f) throw new ArgumentException("Street points cannot repeat.");
                var first = Vector3.Cross(incoming.normalized, Vector3.up);
                var second = Vector3.Cross(outgoing.normalized, Vector3.up);
                var miter = (first + second).normalized;
                var alignment = Vector3.Dot(miter, second);
                if (alignment < .25f) throw new ArgumentException("A street turn is too sharp for a continuous miter.");
                var offset = miter * (width * .5f / alignment);
                vertices[i * 2] = points[i] + offset; vertices[i * 2 + 1] = points[i] - offset;
                if (i == points.Length - 1) continue;
                var v = i * 2; var t = i * 6;
                triangles[t] = v; triangles[t + 1] = v + 2; triangles[t + 2] = v + 1;
                triangles[t + 3] = v + 1; triangles[t + 4] = v + 2; triangles[t + 5] = v + 3;
            }
            Save(parent, name, assetId, vertices, triangles, material);
        }

        private static void Save(Transform parent, string name, string assetId, Vector3[] vertices, int[] triangles, Material material)
        {
            const string folder = "Assets/Art/Quaternius/TownDerivedMeshes";
            Directory.CreateDirectory(folder);
            var mesh = new Mesh { name = assetId, vertices = vertices, triangles = triangles };
            var uv = new Vector2[vertices.Length];
            for (var i = 0; i < uv.Length; i++) uv[i] = new Vector2(vertices[i].x, vertices[i].z);
            mesh.uv = uv; mesh.RecalculateNormals(); mesh.RecalculateTangents(); mesh.RecalculateBounds();
            var path = folder + "/" + assetId + ".asset";
            var retained = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (retained == null) { AssetDatabase.CreateAsset(mesh, path); retained = mesh; }
            else { EditorUtility.CopySerialized(mesh, retained); UnityEngine.Object.DestroyImmediate(mesh); }
            var surface = new GameObject(name); surface.transform.SetParent(parent, false);
            surface.AddComponent<MeshFilter>().sharedMesh = retained;
            surface.AddComponent<MeshRenderer>().sharedMaterial = material;
        }
    }
}
