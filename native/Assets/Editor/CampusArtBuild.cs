using System;
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
    /// <summary>Build source-preserving pack art against the canonical traversal rectangles.</summary>
    public static class CampusArtBuild
    {
        private const string ArtPath = "Assets/Art/Campus/";

        public static void Prepare()
        {
            AssetDatabase.Refresh();
            var rules = JObject.Parse(File.ReadAllText("Assets/PUtown/Resources/Campus/campus.json"));
            float units = (float)rules["coordinates"]["serverUnitsPerUnityUnit"];
            float zSign = (float)rules["coordinates"]["unityZSign"];
            Directory.CreateDirectory("Assets/PUtown/Resources/Campus");
            Directory.CreateDirectory(ArtPath + "Materials");
            foreach (string model in new[] { "Chair", "Table", "Shelf", "Wall", "Door", "Roof", "Quarters", "Tree" })
                Import(model);
            var root = new GameObject("Campus pack art");
            try
            {
                foreach (JObject building in (JArray)rules["buildings"])
                {
                    string id = (string)building["interiorId"];
                    var shell = new GameObject("Exterior:" + id);
                    shell.transform.SetParent(root.transform);
                    float height = (float)building["heightUnits"] / units;
                    foreach (JObject wall in ((JArray)rules["obstacles"]).Where(r => (string)r["kind"] == "wall" && ((string)r["id"]).StartsWith(id + "-", StringComparison.Ordinal)))
                    {
                        Place("Wall", shell.transform, (string)wall["id"], Centre(wall, units, zSign, height / 2),
                            new Vector3((float)wall["width"] / units, height, (float)wall["height"] / units));
                    }
                    // Roofs are presentation, hidden with the exterior while the recipient is indoors.
                    Place("Roof", shell.transform, id + " roof", Centre(building, units, zSign, height + .09f),
                        new Vector3((float)building["width"] / units, .18f, (float)building["height"] / units));
                }
                foreach (JObject furniture in (JArray)rules["furnishings"])
                {
                    string kind = (string)furniture["kind"];
                    string model = kind == "table" ? "Table" : kind == "shelf" ? "Shelf" : "Chair";
                    float height = (float)furniture["heightUnits"] / units;
                    Place(model, root.transform, "Furniture:" + furniture["id"], Centre(furniture, units, zSign, height / 2),
                        new Vector3((float)furniture["width"] / units, height, (float)furniture["height"] / units));
                }
                // Retain all furniture footprints. Decorative planting is off the checked routes
                // and never adds a Collider or changes authorized Vision.
                foreach (JObject district in (JArray)rules["districts"])
                {
                    for (int i = 0; i < 5; i++)
                    {
                        float x = (float)district["x"] + 24 + i * 42;
                        float y = (float)district["y"] + 24;
                        Place("Tree", root.transform, "Planting " + district["id"] + " " + i,
                            new Vector3(x / units, 1.4f, y / units * zSign), new Vector3(.7f, 2.8f, .7f));
                    }
                }
                PrefabUtility.SaveAsPrefabAsset(root, "Assets/PUtown/Resources/Campus/CampusArt.prefab");
                var meshes = root.GetComponentsInChildren<MeshFilter>(true);
                var renderers = root.GetComponentsInChildren<Renderer>(true);
                var report = new
                {
                    unityVersion = Application.unityVersion,
                    reusedBuildingCount = ((JArray)rules["buildings"]).Count,
                    reusedFurnitureCount = ((JArray)rules["furnishings"]).Count,
                    triangles = meshes.Sum(m => m.sharedMesh.triangles.Length / 3),
                    rendererCount = renderers.Length,
                    distinctMaterials = renderers.SelectMany(r => r.sharedMaterials).Distinct().Count(),
                    textures = renderers.SelectMany(r => r.sharedMaterials).Select(m => m.mainTexture).Where(t => t != null).Distinct().Count(),
                    collisionAuthority = "canonical Java rectangles; no art Colliders"
                };
                Directory.CreateDirectory("../campus/assets/adapted");
                File.WriteAllText("../campus/assets/adapted/unity-costs.json", JsonConvert.SerializeObject(report, Formatting.Indented) + "\n");
                Debug.Log("Campus pack art prepared: " + JsonConvert.SerializeObject(report));
            }
            finally { Object.DestroyImmediate(root); }
            AssetDatabase.SaveAssets();
        }

        private static Vector3 Centre(JObject rect, float units, float zSign, float y)
            => new Vector3(((float)rect["x"] + (float)rect["width"] / 2) / units, y,
                ((float)rect["y"] + (float)rect["height"] / 2) / units * zSign);

        private static void Import(string name)
        {
            var importer = (ModelImporter)AssetImporter.GetAtPath(ArtPath + name + ".fbx");
            if (importer == null) throw new InvalidOperationException("Run Blender pack adaptation first: " + name);
            importer.importAnimation = false;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            importer.SaveAndReimport();
        }

        private static void Place(string model, Transform parent, string name, Vector3 centre, Vector3 size)
        {
            var source = AssetDatabase.LoadAssetAtPath<GameObject>(ArtPath + model + ".fbx");
            if (source == null) throw new InvalidOperationException("Missing adapted model: " + model);
            var container = new GameObject(name); container.transform.SetParent(parent);
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(source); instance.transform.SetParent(container.transform);
            foreach (var collider in instance.GetComponentsInChildren<Collider>(true)) Object.DestroyImmediate(collider);
            var renderers = instance.GetComponentsInChildren<Renderer>(true);
            var bounds = renderers[0].bounds;
            foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
            if (bounds.size.x <= 0 || bounds.size.y <= 0 || bounds.size.z <= 0) throw new InvalidOperationException("Adapted mesh has invalid bounds: " + model);
            instance.transform.localPosition = -bounds.center;
            container.transform.localScale = new Vector3(size.x / bounds.size.x, size.y / bounds.size.y, size.z / bounds.size.z);
            container.transform.localPosition = centre;
            foreach (var renderer in renderers)
            {
                var materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    string key = model + "-" + materials[i].name.Replace(" ", "-");
                    string path = ArtPath + "Materials/" + key + ".mat";
                    var native = AssetDatabase.LoadAssetAtPath<Material>(path);
                    if (native == null)
                    {
                        native = new Material(Shader.Find("Standard")) { color = materials[i].color };
                        native.SetFloat("_Glossiness", .1f);
                        AssetDatabase.CreateAsset(native, path);
                    }
                    if (native.shader != null && native.shader.name == "Standard" && !native.enableInstancing) { native.enableInstancing = true; EditorUtility.SetDirty(native); }
                    materials[i] = native;
                }
                renderer.sharedMaterials = materials;
            }
        }

        public static void RenderEvidence()
        {
            var scene = EditorSceneManager.NewPreviewScene();
            try
            {
                var art = Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/PUtown/Resources/Campus/CampusArt.prefab"));
                SceneManager.MoveGameObjectToScene(art, scene);
                var ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
                ground.transform.position = new Vector3(24, -.06f, 18);
                ground.transform.localScale = new Vector3(48, .1f, 36);
                var grass = new Material(Shader.Find("Standard")) { color = new Color(.32f, .53f, .28f) };
                ground.GetComponent<Renderer>().sharedMaterial = grass;
                SceneManager.MoveGameObjectToScene(ground, scene);
                var camera = new GameObject("Gameplay review camera").AddComponent<Camera>();
                camera.fieldOfView = 50;
                camera.scene = scene;
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.transform.rotation = Quaternion.Euler(52, 0, 0);
                camera.nearClipPlane = .1f; camera.farClipPlane = 150;
                SceneManager.MoveGameObjectToScene(camera.gameObject, scene);
                var light = new GameObject("Review sunlight").AddComponent<Light>();
                light.type = LightType.Directional;
                light.transform.rotation = Quaternion.Euler(50, -25, 0);
                SceneManager.MoveGameObjectToScene(light.gameObject, scene);
                var texture = new RenderTexture(1280, 720, 24);
                camera.targetTexture = texture;
                Directory.CreateDirectory("../campus/assets/adapted/previews");
                foreach (bool night in new[] { false, true })
                {
                    light.color = night ? new Color(.38f, .54f, 1) : new Color(1, .92f, .73f);
                    light.intensity = night ? .35f : 1.35f;
                    camera.backgroundColor = night ? new Color(.05f, .10f, .19f) : new Color(.53f, .73f, .77f);
                    camera.transform.position = new Vector3(29.92f, 13, 22.08f - 9.36f);
                    camera.Render();
                    RenderTexture.active = texture;
                    var image = new Texture2D(1280, 720, TextureFormat.RGB24, false);
                    image.ReadPixels(new Rect(0, 0, 1280, 720), 0, 0); image.Apply();
                    File.WriteAllBytes("../campus/assets/adapted/previews/library-" + (night ? "night" : "day") + ".png", image.EncodeToPNG());
                    Object.DestroyImmediate(image);
                }
                RenderTexture.active = null; camera.targetTexture = null;
                Object.DestroyImmediate(texture); Object.DestroyImmediate(grass);
            }
            finally { EditorSceneManager.ClosePreviewScene(scene); }
        }

        public static void BuildAndReview() { Prepare(); RenderEvidence(); }
    }
}
