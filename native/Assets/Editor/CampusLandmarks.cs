using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace PUtown.Editor
{
    /// <summary>Authored detail variants supplement retained pack buildings; canonical rules own every footprint.</summary>
    public static class CampusLandmarks
    {
        private const string Art = "Assets/Art/Landmarks/";
        private static float units, sign;
        private static readonly string[] Masters = { "LibraryLantern", "GateCrown", "ShadeFin", "SolarModule", "Palm", "Boulder", "GroundRing" };
        private static readonly List<object> placements = new List<object>();

        [MenuItem("PU Town/Campus/Prepare landmark variants")]
        public static void Prepare()
        {
            AssetDatabase.Refresh(); Directory.CreateDirectory(Art + "Materials");
            var rules = JObject.Parse(File.ReadAllText("Assets/PUtown/Resources/Campus/campus.json"));
            units = (float)rules["coordinates"]["serverUnitsPerUnityUnit"]; sign = (float)rules["coordinates"]["unityZSign"];
            foreach (var name in Masters)
            {
                var importer = AssetImporter.GetAtPath(Art + name + ".fbx") as ModelImporter;
                if (importer == null) throw new InvalidOperationException("Run the source-preserving Blender landmark authoring first: " + name);
                importer.importAnimation = false; importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard; importer.SaveAndReimport();
            }
            var root = new GameObject("Campus landmarks"); placements.Clear();
            try
            {
                foreach (JObject building in (JArray)rules["buildings"])
                {
                    var id = (string)building["interiorId"]; var exterior = new GameObject("Exterior:" + id); exterior.transform.SetParent(root.transform);
                    var height = (float)building["heightUnits"] / units;
                    var centre = World((float)building["x"] + (float)building["width"] / 2, (float)building["y"] + (float)building["height"] / 2, height + .18f);
                    if (id == "library") Place("LibraryLantern", exterior.transform, "Library clerestory", centre, new Vector3(2.6f, .9f, 2.6f));
                    if (id == "green-energy")
                    {
                        for (var i = 0; i < 3; ++i) Place("SolarModule", exterior.transform, "Green Energy solar canopy " + i, centre + new Vector3((i - 1) * 1.4f, .05f, 0), new Vector3(1.15f, .24f, 1));
                    }
                    var walls = ((JArray)rules["obstacles"]).Cast<JObject>().Where(o => (string)o["kind"] == "wall" && ((string)o["id"]).StartsWith(id + "-", StringComparison.Ordinal));
                    foreach (var wall in walls)
                    {
                        var width = (float)wall["width"] / units; var depth = (float)wall["height"] / units;
                        if (width <= depth || width < .7f) continue;
                        // Fins stay within the accepted wall footprint. Door gaps receive no mesh.
                        var count = Mathf.Max(1, Mathf.FloorToInt(width / .7f));
                        for (var i = 0; i < count; ++i)
                        {
                            var x = (float)wall["x"] + (i + .5f) * (float)wall["width"] / count;
                            var y = (float)wall["y"] + (float)wall["height"] / 2;
                            var fin = Place("ShadeFin", exterior.transform, id + " shade fin", World(x, y, height * .6f), new Vector3(.14f, height * .72f, Mathf.Max(.05f, depth)));
                            if (id.StartsWith("jubilee", StringComparison.Ordinal)) fin.transform.Rotate(0, id == "jubilee-a" ? 8 : -8, 0);
                        }
                    }
                    if (id.Contains("hostel") || id == "mess" || id == "quarters")
                    {
                        var band = new GameObject("Residential identity band"); band.transform.SetParent(exterior.transform);
                        var caption = id == "mens-hostel" ? "Men's hostels" : id == "womens-hostel" ? "Women's hostels" : id == "mess" ? "Campus mess" : "Staff quarters";
                        Label(band.transform, caption, World((float)building["x"] + (float)building["width"] / 2, (float)building["y"] - 3, height * .78f), .07f);
                    }
                }
                foreach (JObject landmark in (JArray)rules["landmarks"])
                {
                    var id = (string)landmark["id"]; var position = World((float)landmark["x"] + (float)landmark["width"] / 2, (float)landmark["y"] + (float)landmark["height"] / 2);
                    var width = (float)landmark["width"] / units; var depth = (float)landmark["height"] / units;
                    if ((string)landmark["kind"] == "gate")
                    {
                        // Identity crowns are above head clearance. No unsupported ground pillar is introduced.
                        Place("GateCrown", root.transform, id + " overhead identity", position + Vector3.up * 3.1f, new Vector3(width, .45f, .35f));
                        Label(root.transform, "Pondicherry University", position + new Vector3(0, 3.28f, -.21f), .045f);
                        GroundPanel(root.transform, id + " entrance stone", position + Vector3.up * .01f, new Vector3(width, .015f, depth), new Color(.65f, .61f, .48f));
                    }
                    else if ((string)landmark["kind"] == "sports")
                    {
                        GroundPanel(root.transform, "Sports turf", position + Vector3.up * .012f, new Vector3(width, .016f, depth), new Color(.29f, .51f, .24f));
                        for (var i = 0; i < 3; ++i) Place("GroundRing", root.transform, "Running track lane " + i, position + Vector3.up * (.025f + i * .001f), new Vector3(width - i * .24f, .005f, depth - i * .24f));
                    }
                    else if (id == "jubilee-circle")
                    {
                        for (var i = 0; i < 3; ++i) Place("GroundRing", root.transform, "Silver Jubilee circular court " + i, position + Vector3.up * (.018f + i * .001f), new Vector3(width - i * .32f, .004f, depth - i * .32f));
                    }
                }
                foreach (JObject patch in (JArray)rules["landscapeObstacles"])
                {
                    var centre = World((float)patch["x"] + (float)patch["width"] / 2, (float)patch["y"] + (float)patch["height"] / 2);
                    if ((string)patch["kind"] == "water")
                    {
                        var water = GroundPanel(root.transform, "Water:" + patch["id"], centre + Vector3.up * .055f, new Vector3((float)patch["width"] / units, .008f, (float)patch["height"] / units), new Color(.14f, .52f, .58f));
                        var waterMaterial = MaterialAsset("Water", new Color(.14f, .52f, .58f)); waterMaterial.SetFloat("_Glossiness", .85f); water.GetComponent<Renderer>().sharedMaterial = waterMaterial;
                        for (var i = 0; i < 5; ++i) Place("Boulder", root.transform, "Water shore boulder " + i, World((float)patch["x"] + 42 + i * 110, (float)patch["y"] + 46, .28f), new Vector3(.65f, .5f, .5f));
                    }
                    else
                    {
                        var grove = new GameObject("Foliage:" + patch["id"]); grove.transform.SetParent(root.transform);
                        var palms = new List<Renderer>();
                        var countX = Mathf.Max(2, Mathf.FloorToInt((float)patch["width"] / 80)); var countY = Mathf.Max(2, Mathf.FloorToInt((float)patch["height"] / 85));
                        for (var row = 0; row < countY; ++row) for (var column = 0; column < countX; ++column)
                        {
                            var x = (float)patch["x"] + 30 + column * ((float)patch["width"] - 60) / Mathf.Max(1, countX - 1);
                            var y = (float)patch["y"] + 30 + row * ((float)patch["height"] - 60) / Mathf.Max(1, countY - 1);
                            var palm = Place("Palm", grove.transform, "Palm master variation", World(x, y, 1.4f), new Vector3(1.7f, 2.8f, 1.7f)); palm.transform.Rotate(0, (row * 43 + column * 67) % 360, 0); palms.AddRange(palm.GetComponentsInChildren<Renderer>());
                        }
                        var lod = grove.AddComponent<LODGroup>(); lod.SetLODs(new[] { new LOD(.05f, palms.ToArray()), new LOD(.025f, palms.Where((r, i) => i % 3 == 0).ToArray()) }); lod.RecalculateBounds();
                    }
                }
                PrefabUtility.SaveAsPrefabAsset(root, "Assets/PUtown/Resources/Campus/CampusLandmarks.prefab");
                var meshes = root.GetComponentsInChildren<MeshFilter>(true); var renderers = root.GetComponentsInChildren<Renderer>(true);
                var report = new { unityVersion = Application.unityVersion, placements, triangles = meshes.Sum(m => m.sharedMesh.triangles.Length / 3), renderers = renderers.Length, materials = renderers.SelectMany(r => r.sharedMaterials).Distinct().Count(), textureCount = 0,
                    groundCollision = "Unchanged canonical rules; art has no Colliders", interpretation = "Compressed playable main-campus districts; facade/interior details are authored interpretations" };
                Directory.CreateDirectory("../campus/assets/landmarks"); File.WriteAllText("../campus/assets/landmarks/unity-costs.json", JsonConvert.SerializeObject(report, Formatting.Indented) + "\n"); AssetDatabase.SaveAssets();
            }
            finally { Object.DestroyImmediate(root); }
        }

        private static Vector3 World(float x, float y, float height = 0) => new Vector3(x / units, height, y / units * sign);
        private static Material MaterialAsset(string name, Color colour)
        {
            var path = Art + "Materials/" + name.Replace(" ", "-") + ".mat"; var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(Shader.Find("Standard")) { color = colour }; material.SetFloat("_Glossiness", .16f); AssetDatabase.CreateAsset(material, path); }
            if (material.shader != null && material.shader.name == "Standard" && !material.enableInstancing) { material.enableInstancing = true; EditorUtility.SetDirty(material); }
            return material;
        }
        private static GameObject Place(string master, Transform parent, string name, Vector3 centre, Vector3 size)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Art + master + ".fbx"); if (prefab == null) throw new InvalidOperationException("Missing authored landmark " + master);
            var container = new GameObject(name); container.transform.SetParent(parent); var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab); instance.transform.SetParent(container.transform);
            var renderers = instance.GetComponentsInChildren<Renderer>(); var bounds = renderers[0].bounds; foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
            instance.transform.localPosition = -bounds.center; container.transform.localScale = new Vector3(size.x / Mathf.Max(.001f, bounds.size.x), size.y / Mathf.Max(.001f, bounds.size.y), size.z / Mathf.Max(.001f, bounds.size.z)); container.transform.position = centre;
            foreach (var renderer in renderers)
            {
                var materials = renderer.sharedMaterials; for (var i = 0; i < materials.Length; ++i) materials[i] = MaterialAsset(master + "-" + materials[i].name, materials[i].color); renderer.sharedMaterials = materials;
            }
            foreach (var collider in instance.GetComponentsInChildren<Collider>()) Object.DestroyImmediate(collider);
            placements.Add(new { master, name, x = centre.x, y = centre.y, z = centre.z, size = new[] { size.x, size.y, size.z } }); return container;
        }
        private static GameObject GroundPanel(Transform parent, string name, Vector3 centre, Vector3 size, Color colour)
        {
            var panel = GameObject.CreatePrimitive(PrimitiveType.Cube); panel.name = name; panel.transform.SetParent(parent); panel.transform.position = centre; panel.transform.localScale = size;
            Object.DestroyImmediate(panel.GetComponent<Collider>()); panel.GetComponent<Renderer>().sharedMaterial = MaterialAsset(name.Split(':')[0], colour); return panel;
        }
        private static void Label(Transform parent, string text, Vector3 position, float size)
        {
            var objectLabel = new GameObject(text); objectLabel.transform.SetParent(parent); objectLabel.transform.position = position; objectLabel.transform.rotation = Quaternion.identity;
            var label = objectLabel.AddComponent<TextMesh>(); label.text = text; label.fontSize = 64; label.characterSize = size; label.anchor = TextAnchor.MiddleCenter; label.alignment = TextAlignment.Center; label.color = new Color(.93f, .88f, .66f);
            var font = AssetDatabase.LoadAssetAtPath<Font>("Assets/PUtown/Fonts/Resources/Fonts/AtkinsonHyperlegible-Regular.ttf"); if (font != null) { label.font = font; objectLabel.GetComponent<Renderer>().sharedMaterial = font.material; }
        }

        [MenuItem("PU Town/Campus/Render landmark evidence")]
        public static void RenderEvidence()
        {
            var scene = EditorSceneManager.NewPreviewScene(); var texture = new RenderTexture(1920, 1080, 24);
            try
            {
                foreach (var name in new[] { "CampusArt", "CampusLandmarks" })
                { var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/PUtown/Resources/Campus/" + name + ".prefab"); if (prefab != null) SceneManager.MoveGameObjectToScene(Object.Instantiate(prefab), scene); }
                var ground = GameObject.CreatePrimitive(PrimitiveType.Cube); ground.transform.position = new Vector3(24, -.055f, 18); ground.transform.localScale = new Vector3(48, .1f, 36); ground.GetComponent<Renderer>().sharedMaterial = MaterialAsset("Ground grass", new Color(.32f, .53f, .28f)); SceneManager.MoveGameObjectToScene(ground, scene);
                var camera = new GameObject("Landmark gameplay camera").AddComponent<Camera>(); camera.fieldOfView = 50; camera.transform.rotation = Quaternion.Euler(52, 0, 0); camera.farClipPlane = 150; camera.targetTexture = texture; camera.clearFlags = CameraClearFlags.SolidColor; SceneManager.MoveGameObjectToScene(camera.gameObject, scene); camera.scene = scene;
                var light = new GameObject("Landmark sunlight").AddComponent<Light>(); light.type = LightType.Directional; light.transform.rotation = Quaternion.Euler(50, -25, 0); light.shadows = LightShadows.Soft; SceneManager.MoveGameObjectToScene(light.gameObject, scene);
                var rules = JObject.Parse(File.ReadAllText("Assets/PUtown/Resources/Campus/campus.json")); units = (float)rules["coordinates"]["serverUnitsPerUnityUnit"]; sign = (float)rules["coordinates"]["unityZSign"];
                var sites = ((JArray)rules["buildings"]).Concat((JArray)rules["landmarks"]).Cast<JObject>(); Directory.CreateDirectory("../campus/assets/landmarks/previews");
                foreach (var site in sites) foreach (var night in new[] { false, true })
                {
                    var centre = World((float)site["x"] + (float)site["width"] / 2, (float)site["y"] + (float)site["height"] / 2); camera.transform.position = centre + new Vector3(0, 13, -9.36f);
                    light.color = night ? new Color(.38f, .54f, 1) : new Color(1, .92f, .73f); light.intensity = night ? .35f : 1.35f; camera.backgroundColor = night ? new Color(.05f, .10f, .19f) : new Color(.53f, .73f, .77f);
                    camera.Render(); RenderTexture.active = texture; var image = new Texture2D(1920, 1080, TextureFormat.RGB24, false); image.ReadPixels(new Rect(0, 0, 1920, 1080), 0, 0); image.Apply(); File.WriteAllBytes("../campus/assets/landmarks/previews/" + site["id"] + "-" + (night ? "night" : "day") + ".png", image.EncodeToPNG()); Object.DestroyImmediate(image);
                }
            }
            finally { RenderTexture.active = null; Object.DestroyImmediate(texture); EditorSceneManager.ClosePreviewScene(scene); }
        }
        public static void BuildAndReview() { Prepare(); RenderEvidence(); }
    }
}
