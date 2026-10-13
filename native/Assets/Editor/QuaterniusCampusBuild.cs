using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace PUtown.Editor
{
    /// <summary>Combines explicitly licensed Standard sources; canonical geometry remains the only traversal authority.</summary>
    public static class QuaterniusCampusBuild
    {
        private const string Art = "Assets/Art/Quaternius/";
        private const string PrefabPath = "Assets/PUtown/Resources/Campus/CampusGarden.prefab";
        private static readonly Dictionary<string, JObject> materialDescriptions = new Dictionary<string, JObject>();
        private static readonly Dictionary<string, Material> materials = new Dictionary<string, Material>();
        private static readonly Dictionary<string, Texture2D[]> repackedTextures = new Dictionary<string, Texture2D[]>();
        private static readonly List<object> placements = new List<object>();
        private static JObject rules;
        private static float units, zSign;
        private static string Repository => Environment.GetEnvironmentVariable("PU_TOWN_REPOSITORY") ?? Path.GetFullPath(Path.Combine(Application.dataPath, "../.."));
        private static string Evidence => Path.Combine(Repository, "campus/assets/sources/quaternius");

        [MenuItem("PU Town/Campus/Prepare Quaternius garden")]
        public static void Prepare()
        {
            AssetDatabase.Refresh(); materials.Clear(); materialDescriptions.Clear(); repackedTextures.Clear(); placements.Clear();
            Directory.CreateDirectory(Art + "Materials"); Directory.CreateDirectory(Art + "DerivedTextures");
            rules = JObject.Parse(File.ReadAllText("Assets/PUtown/Resources/Campus/campus.json"));
            units = (float)rules["coordinates"]["serverUnitsPerUnityUnit"]; zSign = (float)rules["coordinates"]["unityZSign"];
            foreach (var shaderName in new[] { "PUtown/Campus Garden Ground", "PUtown/Campus Garden Water", "PUtown/Quaternius Foliage" })
            {
                var shader = Shader.Find(shaderName);
                if (shader == null || ShaderUtil.ShaderHasError(shader)) throw new InvalidOperationException("Garden shader must compile: " + shaderName);
            }
            ImportPack("Nature"); ImportPack("City"); ImportPack("Props");
            PrepareGround();
            var root = new GameObject("Quaternius campus garden");
            try
            {
                BuildRoutes(root.transform);
                BuildBuildings(root.transform);
                BuildFurniture(root.transform);
                BuildSeats(root.transform);
                BuildLandscape(root.transform);
                BuildLandmarks(root.transform);
                PrefabUtility.SaveAsPrefabAsset(root, PrefabPath);
                var filters = root.GetComponentsInChildren<MeshFilter>(true); var renderers = root.GetComponentsInChildren<Renderer>(true);
                var report = new
                {
                    unityVersion = Application.unityVersion, sources = new[] { "Stylized Nature MegaKit Standard", "Downtown City MegaKit Standard", "Fantasy Props MegaKit Standard (neutral props only)" },
                    placements, meshRendererCount = renderers.Length, triangleCount = filters.Sum(filter => filter.sharedMesh == null ? 0 : filter.sharedMesh.triangles.Length / 3),
                    materialCount = renderers.SelectMany(renderer => renderer.sharedMaterials).Distinct().Count(),
                    geometryAuthority = "Canonical campus.json is unchanged. All pack art has no Colliders; visibility names preserve Exterior/Furniture/Seat IDs.",
                    textureHandling = "Original albedo and normal textures; derived Standard metallic/smoothness uses ORM B for metallic and 1-G for smoothness; occlusion is original R copied to grayscale.",
                    previewMeaning = "Authored compressed campus interpretation; runtime and target-platform performance require separate verification."
                };
                Directory.CreateDirectory(Evidence); File.WriteAllText(Path.Combine(Evidence, "unity-garden-costs.json"), JsonConvert.SerializeObject(report, Formatting.Indented) + "\n");
                AssetDatabase.SaveAssets();
            }
            finally { Object.DestroyImmediate(root); }
        }

        private static void ImportPack(string pack)
        {
            var selection = JObject.Parse(File.ReadAllText(Path.Combine(Evidence, pack + "-selection.json")));
            foreach (JObject texture in (JArray)selection["textures"])
            {
                var path = Art + pack + "/Textures/" + Path.GetFileName((string)texture["importPath"]);
                var importer = AssetImporter.GetAtPath(path) as TextureImporter;
                if (importer == null) throw new InvalidOperationException("Missing Standard texture: " + path);
                var normal = path.EndsWith("_Normal.png", StringComparison.Ordinal);
                importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
                importer.sRGBTexture = !normal && !path.EndsWith("_ORM.png", StringComparison.Ordinal);
                importer.alphaIsTransparency = pack == "Nature" && !normal;
                importer.mipmapEnabled = true; importer.maxTextureSize = pack == "Nature" ? 1024 : 2048; importer.SaveAndReimport();
            }
            foreach (JObject model in (JArray)selection["models"])
            {
                var name = (string)model["name"]; var importer = AssetImporter.GetAtPath(Art + pack + "/Models/" + name + ".fbx") as ModelImporter;
                if (importer == null) throw new InvalidOperationException("Missing Standard model: " + name);
                importer.importAnimation = false; importer.isReadable = false;
                importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard; importer.SaveAndReimport();
                foreach (JObject description in (JArray)model["materials"]) materialDescriptions[pack + "/" + (string)description["name"]] = description;
            }
        }

        private static Material PackMaterial(string pack, string importedName)
        {
            var name = importedName.Replace(" (Instance)", "");
            var key = pack + "/" + name;
            if (materials.TryGetValue(key, out var previous)) return previous;
            if (!materialDescriptions.TryGetValue(key, out var description)) throw new InvalidOperationException("No exact material mapping for " + key);
            var foliage = pack == "Nature" && (string)description["baseColorTexture"] != null;
            var shader = Shader.Find(foliage ? "PUtown/Quaternius Foliage" : "Standard");
            if (shader == null) throw new InvalidOperationException("Missing campus material shader.");
            var path = Art + "Materials/" + pack + "-" + name + ".mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(shader); AssetDatabase.CreateAsset(material, path); }
            material.shader = shader; material.enableInstancing = true;
            var factor = (JArray)description["baseColorFactor"];
            material.color = new Color((float)factor[0], (float)factor[1], (float)factor[2], (float)factor[3]);
            if (pack == "Nature") material.color *= new Color(.86f, .91f, .80f, 1);
            material.SetFloat("_Glossiness", .10f); material.SetFloat("_Metallic", (float)description["metallicFactor"]);
            material.mainTexture = Texture(pack, (string)description["baseColorTexture"]);
            // Keep the supplied leaf detail and cutout while fitting autumn bushes to the garden palette.
            if (foliage) { material.SetFloat("_GreenTint", name == "Leaves_TwistedTree" ? 1 : 0); material.SetColor("_LeafGreen", Html("#6b944c")); }
            var normal = Texture(pack, (string)description["normalTexture"]);
            material.SetTexture("_BumpMap", normal);
            if (normal != null) { material.EnableKeyword("_NORMALMAP"); material.SetFloat("_BumpScale", .55f); } else material.DisableKeyword("_NORMALMAP");
            if (foliage) material.SetFloat("_Cutoff", (float)description["alphaCutoff"]);
            var orm = (string)description["metallicRoughnessTexture"];
            if (orm != null)
            {
                RepackOrm(pack, orm, out var metallic, out var occlusion);
                material.SetTexture("_MetallicGlossMap", metallic); material.SetTexture("_OcclusionMap", occlusion);
                material.EnableKeyword("_METALLICGLOSSMAP"); material.SetFloat("_GlossMapScale", .35f); material.SetFloat("_OcclusionStrength", .65f);
            }
            if (!foliage && (string)description["alphaMode"] == "BLEND")
            {
                // Standard contains no paid fake-interior shader. Glass remains a simple muted transparent surface.
                material.SetFloat("_Mode", 3); material.SetInt("_SrcBlend", (int)BlendMode.One); material.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
                material.SetInt("_ZWrite", 0); material.DisableKeyword("_ALPHATEST_ON"); material.DisableKeyword("_ALPHABLEND_ON"); material.EnableKeyword("_ALPHAPREMULTIPLY_ON");
                material.renderQueue = (int)RenderQueue.Transparent; material.color = new Color(.25f, .43f, .43f, .72f);
            }
            if (name == "MI_FakeInterior") material.color = new Color(.18f, .28f, .25f);
            EditorUtility.SetDirty(material); materials[key] = material; return material;
        }

        private static Texture2D Texture(string pack, string name) => name == null ? null : AssetDatabase.LoadAssetAtPath<Texture2D>(Art + pack + "/Textures/" + name);
        private static Material PrepareGround()
        {
            const string path = "Assets/PUtown/Resources/Campus/GardenGround.mat";
            var shader = Shader.Find("PUtown/Campus Garden Ground");
            if (shader == null) throw new InvalidOperationException("Missing garden ground shader.");
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(shader); AssetDatabase.CreateAsset(material, path); }
            material.shader = shader; material.enableInstancing = true;
            material.SetTexture("_SoilTex", Texture("City", "T_Dirt_BaseColor.png"));
            EditorUtility.SetDirty(material); return material;
        }
        private static void RepackOrm(string pack, string name, out Texture2D metallic, out Texture2D occlusion)
        {
            var stem = pack + "-" + Path.GetFileNameWithoutExtension(name);
            if (repackedTextures.TryGetValue(stem, out var previous)) { metallic = previous[0]; occlusion = previous[1]; return; }
            var metallicPath = Art + "DerivedTextures/" + stem + "-MetallicSmoothness.png";
            var occlusionPath = Art + "DerivedTextures/" + stem + "-Occlusion.png";
            if (!File.Exists(metallicPath) || !File.Exists(occlusionPath))
            {
                var source = new Texture2D(2, 2, TextureFormat.RGBA32, false, true);
                try
                {
                    if (!source.LoadImage(File.ReadAllBytes(Art + pack + "/Textures/" + name))) throw new InvalidOperationException("Cannot read Standard ORM texture.");
                    var pixels = source.GetPixels32(); var metals = new Color32[pixels.Length]; var shadows = new Color32[pixels.Length];
                    for (var i = 0; i < pixels.Length; i++) { metals[i] = new Color32(pixels[i].b, 0, 0, (byte)(255 - pixels[i].g)); shadows[i] = new Color32(pixels[i].r, pixels[i].r, pixels[i].r, 255); }
                    WriteTexture(source.width, source.height, metals, metallicPath); WriteTexture(source.width, source.height, shadows, occlusionPath);
                }
                finally { Object.DestroyImmediate(source); }
            }
            AssetDatabase.ImportAsset(metallicPath); AssetDatabase.ImportAsset(occlusionPath);
            foreach (var path in new[] { metallicPath, occlusionPath })
            {
                var importer = (TextureImporter)AssetImporter.GetAtPath(path); importer.sRGBTexture = false; importer.mipmapEnabled = true; importer.maxTextureSize = 2048; importer.SaveAndReimport();
            }
            metallic = AssetDatabase.LoadAssetAtPath<Texture2D>(metallicPath); occlusion = AssetDatabase.LoadAssetAtPath<Texture2D>(occlusionPath);
            repackedTextures[stem] = new[] { metallic, occlusion };
        }
        private static void WriteTexture(int width, int height, Color32[] pixels, string path)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false, true);
            try { texture.SetPixels32(pixels); texture.Apply(); File.WriteAllBytes(path, texture.EncodeToPNG()); }
            finally { Object.DestroyImmediate(texture); }
        }

        private static Vector3 World(float x, float y, float height = 0) => new Vector3(x / units, height, y / units * zSign);
        private static GameObject Place(string pack, string model, Transform parent, string name, Vector3 centre, Vector3 available, Quaternion rotation, bool uniform)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Art + pack + "/Models/" + model + ".fbx");
            if (prefab == null) throw new InvalidOperationException("Missing selected Standard model " + pack + "/" + model);
            var container = new GameObject(name); container.transform.SetParent(parent);
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab); instance.transform.SetParent(container.transform, false);
            var renderers = instance.GetComponentsInChildren<Renderer>(true); if (renderers.Length == 0) throw new InvalidOperationException("Pack model has no renderers.");
            var bounds = renderers[0].bounds; foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds);
            var size = bounds.size;
            var scale = new Vector3(size.x > .0001f ? available.x / size.x : 1, size.y > .0001f ? available.y / size.y : 1, size.z > .0001f ? available.z / size.z : 1);
            if (uniform) { var factor = Mathf.Min(scale.x, Mathf.Min(scale.y, scale.z)); scale = Vector3.one * factor; }
            instance.transform.localPosition = -bounds.center;
            container.transform.localScale = scale; container.transform.position = centre; container.transform.rotation = rotation;
            foreach (var renderer in renderers) renderer.sharedMaterials = renderer.sharedMaterials.Select(material => PackMaterial(pack, material.name)).ToArray();
            foreach (var collider in instance.GetComponentsInChildren<Collider>(true)) Object.DestroyImmediate(collider);
            placements.Add(new { pack, model, name, x = centre.x, y = centre.y, z = centre.z, scale = new[] { scale.x, scale.y, scale.z }, uniform });
            return container;
        }

        private static void BuildRoutes(Transform parent)
        {
            var group = new GameObject("Textured campus paths"); group.transform.SetParent(parent);
            foreach (JObject route in (JArray)rules["routes"])
            {
                var points = (JArray)route["points"]; var width = (float)route["width"] / units;
                for (var i = 1; i < points.Count; i++)
                {
                    var from = World((float)points[i - 1]["x"], (float)points[i - 1]["y"]); var to = World((float)points[i]["x"], (float)points[i]["y"]); var vector = to - from;
                    var count = Mathf.CeilToInt(vector.magnitude / width); var length = vector.magnitude / count;
                    for (var tile = 0; tile < count; tile++) Place("City", "Sidewalk_NoCurb_3m", group.transform, "Paving " + route["id"] + " " + tile,
                        Vector3.Lerp(from, to, (tile + .5f) / count) + Vector3.up * -.007f, new Vector3(width, .05f, length), Quaternion.LookRotation(vector), false);
                }
            }
        }

        private static void BuildBuildings(Transform parent)
        {
            foreach (JObject building in (JArray)rules["buildings"])
            {
                var id = (string)building["interiorId"]; var height = (float)building["heightUnits"] / units;
                var exterior = new GameObject("Exterior:" + id); exterior.transform.SetParent(parent);
                var centreX = (float)building["x"] + (float)building["width"] / 2; var centreY = (float)building["y"] + (float)building["height"] / 2;
                Place("City", "Floor_4x4", parent, "Floor:" + id, World(centreX, centreY, -.018f), new Vector3((float)building["width"] / units, .05f, (float)building["height"] / units), Quaternion.identity, false);
                foreach (JObject wall in ((JArray)rules["obstacles"]).Where(value => (string)value["kind"] == "wall" && ((string)value["id"]).StartsWith(id + "-", StringComparison.Ordinal)))
                {
                    var horizontal = (float)wall["width"] > (float)wall["height"];
                    var length = (float)wall[horizontal ? "width" : "height"] / units; var depth = (float)wall[horizontal ? "height" : "width"] / units;
                    var count = Mathf.Max(1, Mathf.CeilToInt(length / 2f)); var tileLength = length / count;
                    var northOrWest = horizontal ? (float)wall["y"] < centreY : (float)wall["x"] < centreX;
                    var rotation = Quaternion.Euler(0, horizontal ? northOrWest ? 180 : 0 : northOrWest ? -90 : 90, 0);
                    for (var tile = 0; tile < count; tile++)
                    {
                        var x = (float)wall["x"] + (horizontal ? (tile + .5f) * (float)wall["width"] / count : (float)wall["width"] / 2);
                        var y = (float)wall["y"] + (horizontal ? (float)wall["height"] / 2 : (tile + .5f) * (float)wall["height"] / count);
                        var model = tileLength < .8f ? "Trim_Plain_3" : id == "green-energy" || id.StartsWith("jubilee", StringComparison.Ordinal) ? "Metal_Window" : "Trim_Window";
                        Place("City", model, exterior.transform, "Canonical wall " + wall["id"] + " " + tile, World(x, y, height / 2), new Vector3(tileLength, height, depth), rotation, false);
                    }
                }
                Place("City", "Roof_4x4", exterior.transform, "Flat campus roof " + id, World(centreX, centreY, height + .045f), new Vector3((float)building["width"] / units, .1f, (float)building["height"] / units), Quaternion.identity, false);
                if (id == "library") OriginalLandmark("LibraryLantern", exterior.transform, "Library clerestory", World(centreX, centreY, height + .42f), new Vector3(2.45f, .75f, 2.45f));
                if (id == "green-energy") for (var i = 0; i < 3; i++) OriginalLandmark("SolarModule", exterior.transform, "Solar canopy " + i, World(centreX + (i - 1) * 135, centreY, height + .15f), new Vector3(1.2f, .22f, .95f));
            }
        }

        private static void BuildFurniture(Transform parent)
        {
            foreach (JObject furniture in (JArray)rules["furnishings"])
            {
                var kind = (string)furniture["kind"]; var group = new GameObject("Furniture:" + furniture["id"]); group.transform.SetParent(parent);
                var x = (float)furniture["x"] + (float)furniture["width"] / 2; var y = (float)furniture["y"] + (float)furniture["height"] / 2;
                var height = (float)furniture["heightUnits"] / units; var width = (float)furniture["width"] / units; var depth = (float)furniture["height"] / units;
                var model = kind == "table" ? "Table_Large" : kind == "shelf" ? "Bookcase_2" : "Bench";
                var rotation = kind == "shelf" ? Quaternion.Euler(0, 90, 0) : Quaternion.identity;
                var available = kind == "shelf" ? new Vector3(depth, height, width) : new Vector3(width, height, depth);
                var item = Place("Props", model, group.transform, "Campus " + kind, World(x, y, height / 2), available, rotation, true);
                var bounds = BoundsOf(item); item.transform.position += Vector3.up * -bounds.min.y;
                if (kind == "table") Place("Props", "Book_Stack_1", group.transform, "Study books", World(x + 8, y, BoundsOf(item).max.y + .045f), new Vector3(.25f, .09f, .20f), Quaternion.Euler(0, 15, 0), true);
            }
        }

        private static void BuildSeats(Transform parent)
        {
            foreach (JObject seat in (JArray)rules["meeting"]["seats"])
            {
                var facing = (string)seat["facing"]; var angle = facing == "up" ? 180 : facing == "down" ? 0 : facing == "left" ? -90 : 90;
                var chair = Place("Props", "Chair_1", parent, "Seat:" + seat["seat"], World((float)seat["x"], (float)seat["y"], .48f), new Vector3(.54f, .98f, .54f), Quaternion.Euler(0, angle, 0), true);
                var bounds = BoundsOf(chair); chair.transform.position -= Vector3.up * bounds.min.y;
            }
        }

        private static void BuildLandscape(Transform parent)
        {
            var random = new System.Random(619990);
            foreach (JObject patch in (JArray)rules["landscapeObstacles"])
            {
                var landscape = new GameObject("Landscape:" + patch["id"]); landscape.transform.SetParent(parent);
                if ((string)patch["kind"] == "water")
                {
                    var water = GameObject.CreatePrimitive(PrimitiveType.Plane); water.name = "Water:" + patch["id"]; water.transform.SetParent(landscape.transform);
                    water.transform.position = World((float)patch["x"] + (float)patch["width"] / 2, (float)patch["y"] + (float)patch["height"] / 2, -.014f);
                    water.transform.localScale = new Vector3((float)patch["width"] / units / 10, 1, (float)patch["height"] / units / 10);
                    Object.DestroyImmediate(water.GetComponent<Collider>());
                    var waterPath = Art + "Materials/Campus-water.mat"; var waterMaterial = AssetDatabase.LoadAssetAtPath<Material>(waterPath);
                    var waterShader = Shader.Find("PUtown/Campus Garden Water");
                    if (waterShader == null) throw new InvalidOperationException("Missing garden water shader.");
                    if (waterMaterial == null) { waterMaterial = new Material(waterShader); AssetDatabase.CreateAsset(waterMaterial, waterPath); }
                    waterMaterial.shader = waterShader; waterMaterial.color = Html("#56bfb6"); waterMaterial.SetFloat("_Glossiness", .48f); waterMaterial.enableInstancing = true;
                    waterMaterial.SetTexture("_SoilTex", Texture("City", "T_Dirt_BaseColor.png"));
                    var first = World((float)patch["x"], (float)patch["y"]); var last = World((float)patch["x"] + (float)patch["width"], (float)patch["y"] + (float)patch["height"]);
                    waterMaterial.SetVector("_Bounds", new Vector4(Mathf.Min(first.x, last.x), Mathf.Min(first.z, last.z), Mathf.Max(first.x, last.x), Mathf.Max(first.z, last.z)));
                    EditorUtility.SetDirty(waterMaterial); water.GetComponent<Renderer>().sharedMaterial = waterMaterial;
                    for (var i = 0; i < 10; i++)
                    {
                        var x = (float)patch["x"] + 22 + i * ((float)patch["width"] - 44) / 9; var y = (float)patch["y"] + 18 + (float)random.NextDouble() * 36;
                        GroundNature("Rock_Medium_" + (i % 3 + 1), landscape.transform, "Water shore rock", x, y, new Vector3(.65f, .5f, .55f), random);
                        if (i % 2 == 0) GroundNature("Fern_1", landscape.transform, "Shore fern", x + 26, y + 35, new Vector3(.7f, .6f, .7f), random);
                    }
                    continue;
                }
                var grove = new GameObject("Foliage:" + patch["id"]); grove.transform.SetParent(landscape.transform);
                var trees = new List<Renderer>(); var undergrowth = new List<Renderer>();
                var treeCount = Mathf.Max(3, Mathf.RoundToInt((float)patch["width"] * (float)patch["height"] / 27000));
                for (var i = 0; i < treeCount; i++)
                {
                    var x = (float)patch["x"] + 36 + (float)random.NextDouble() * ((float)patch["width"] - 72);
                    var y = (float)patch["y"] + 36 + (float)random.NextDouble() * ((float)patch["height"] - 72);
                    var tree = GroundNature(i % 2 == 0 ? "CommonTree_1" : "CommonTree_4", grove.transform, "Textured broadleaf canopy", x, y, new Vector3(1.7f, 3.2f, 1.7f), random); trees.AddRange(tree.GetComponentsInChildren<Renderer>());
                }
                for (var i = 0; i < treeCount * 5; i++)
                {
                    var x = (float)patch["x"] + 16 + (float)random.NextDouble() * ((float)patch["width"] - 32);
                    var y = (float)patch["y"] + 16 + (float)random.NextDouble() * ((float)patch["height"] - 32);
                    var models = new[] { "Bush_Common", "Fern_1", "Grass_Common_Short", "Flower_3_Group", "Rock_Medium_2" };
                    var plant = GroundNature(models[i % models.Length], grove.transform, "Layered grove undergrowth", x, y, new Vector3(.65f, .65f, .65f), random); undergrowth.AddRange(plant.GetComponentsInChildren<Renderer>());
                }
                var lod = grove.AddComponent<LODGroup>(); lod.SetLODs(new[] { new LOD(.06f, trees.Concat(undergrowth).ToArray()), new LOD(.025f, trees.ToArray()) }); lod.RecalculateBounds();
            }
            foreach (JObject building in (JArray)rules["buildings"])
            {
                // Plant only beyond the back wall, within the checked world, away from door and Task routes.
                var x = (float)building["x"]; var y = (float)building["y"] + (float)building["height"] + 45;
                for (var i = 0; i < 5; i++)
                {
                    var px = x + 30 + i * ((float)building["width"] - 60) / 4;
                    if (!SafeDecoration(px, y, 28)) continue;
                    GroundNature(i % 3 == 0 ? "Bush_Common_Flowers" : i % 3 == 1 ? "Grass_Common_Short" : "Flower_4_Group", parent, "Campus garden border", px, y, new Vector3(.65f, .45f, .65f), random);
                }
            }
            foreach (JObject route in (JArray)rules["routes"])
            {
                var points = (JArray)route["points"];
                for (var i = 1; i < points.Count; i++)
                {
                    var a = new Vector2((float)points[i - 1]["x"], (float)points[i - 1]["y"]); var b = new Vector2((float)points[i]["x"], (float)points[i]["y"]); var direction = (b - a).normalized; var normal = new Vector2(-direction.y, direction.x);
                    var count = Mathf.FloorToInt(Vector2.Distance(a, b) / 110);
                    for (var plant = 0; plant < count; plant++)
                    {
                        var point = Vector2.Lerp(a, b, (plant + .5f) / count) + normal * ((float)route["width"] / 2 + 44) * (plant % 2 == 0 ? 1 : -1);
                        if (!SafeDecoration(point.x, point.y, 30)) continue;
                        GroundNature(plant % 4 == 0 ? "Bush_Common" : plant % 4 == 1 ? "Flower_3_Group" : "Grass_Common_Short", parent, "Path edge planting", point.x, point.y, new Vector3(.55f, .5f, .55f), random);
                        var cluster = point + normal * (plant % 2 == 0 ? 24 : -24) + direction * 21;
                        if (SafeDecoration(cluster.x, cluster.y, 20)) GroundNature(plant % 2 == 0 ? "Clover_1" : "Grass_Wispy_Short", parent, "Low path edge detail", cluster.x, cluster.y, new Vector3(.4f, .25f, .4f), random);
                    }
                }
            }
        }
        private static GameObject GroundNature(string model, Transform parent, string name, float x, float y, Vector3 size, System.Random random)
        {
            var item = Place("Nature", model, parent, name, World(x, y, size.y / 2), size, Quaternion.Euler(0, (float)random.NextDouble() * 360, 0), true);
            item.transform.position -= Vector3.up * BoundsOf(item).min.y; return item;
        }
        private static bool SafeDecoration(float x, float y, float margin)
        {
            if (x < margin || y < margin || x > (float)rules["width"] - margin || y > (float)rules["height"] - margin) return false;
            if (((JArray)rules["buildings"]).Any(rect => Inside(rect, x, y, margin + 30))) return false;
            if (((JArray)rules["tasks"]).Any(task => Vector2.Distance(new Vector2(x, y), new Vector2((float)task["x"], (float)task["y"])) < margin + 70)) return false;
            if (Vector2.Distance(new Vector2(x, y), new Vector2((float)rules["meeting"]["x"], (float)rules["meeting"]["y"])) < 230) return false;
            return !((JArray)rules["obstacles"]).Any(rect => Inside(rect, x, y, margin));
        }
        private static bool Inside(JToken rect, float x, float y, float margin) => x > (float)rect["x"] - margin && y > (float)rect["y"] - margin && x < (float)rect["x"] + (float)rect["width"] + margin && y < (float)rect["y"] + (float)rect["height"] + margin;
        private static Bounds BoundsOf(GameObject item) { var renderers = item.GetComponentsInChildren<Renderer>(true); var bounds = renderers[0].bounds; foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds); return bounds; }

        private static void BuildLandmarks(Transform parent)
        {
            foreach (JObject landmark in (JArray)rules["landmarks"])
            {
                var x = (float)landmark["x"] + (float)landmark["width"] / 2; var y = (float)landmark["y"] + (float)landmark["height"] / 2;
                if ((string)landmark["kind"] == "gate") OriginalLandmark("GateCrown", parent, "Pondicherry University gate identity", World(x, y, 3.1f), new Vector3((float)landmark["width"] / units, .42f, .3f));
                if ((string)landmark["kind"] == "sports" || (string)landmark["id"] == "jubilee-circle") for (var i = 0; i < 2; i++) OriginalLandmark("GroundRing", parent, "Campus court marking", World(x, y, .024f + i * .001f), new Vector3((float)landmark["width"] / units - i * .22f, .005f, (float)landmark["height"] / units - i * .22f));
            }
        }
        private static void OriginalLandmark(string name, Transform parent, string label, Vector3 centre, Vector3 size)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Art/Landmarks/" + name + ".fbx"); if (prefab == null) return;
            var root = new GameObject(label); root.transform.SetParent(parent); var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab); instance.transform.SetParent(root.transform, false);
            var bounds = BoundsOf(instance); instance.transform.localPosition = -bounds.center;
            root.transform.localScale = new Vector3(size.x / Mathf.Max(.0001f, bounds.size.x), size.y / Mathf.Max(.0001f, bounds.size.y), size.z / Mathf.Max(.0001f, bounds.size.z)); root.transform.position = centre;
            foreach (var renderer in instance.GetComponentsInChildren<Renderer>(true))
            {
                var shared = renderer.sharedMaterials;
                for (var i = 0; i < shared.Length; i++)
                {
                    var path = "Assets/Art/Landmarks/Materials/" + name + "-" + shared[i].name.Replace(" ", "-") + ".mat";
                    var material = AssetDatabase.LoadAssetAtPath<Material>(path); if (material != null) shared[i] = material;
                }
                renderer.sharedMaterials = shared;
            }
            foreach (var collider in instance.GetComponentsInChildren<Collider>(true)) Object.DestroyImmediate(collider);
        }

        [MenuItem("PU Town/Campus/Render close Quaternius camera evidence")]
        public static void RenderEvidence()
        {
            var scene = EditorSceneManager.NewPreviewScene(); var target = new RenderTexture(1920, 1080, 24);
            var owned = new List<Object>();
            try
            {
                var art = Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(PrefabPath)); SceneManager.MoveGameObjectToScene(art, scene);
                var ground = GameObject.CreatePrimitive(PrimitiveType.Plane); ground.transform.position = new Vector3(24, -.035f, 18); ground.transform.localScale = new Vector3(4.8f, 1, 3.6f);
                ground.GetComponent<Renderer>().sharedMaterial = PrepareGround(); SceneManager.MoveGameObjectToScene(ground, scene);
                var camera = new GameObject("Close player follow review camera").AddComponent<Camera>(); camera.fieldOfView = 45; camera.nearClipPlane = .1f; camera.farClipPlane = 100; camera.targetTexture = target; camera.clearFlags = CameraClearFlags.SolidColor; camera.scene = scene;
                camera.transform.rotation = Quaternion.Euler(48, 35, 0); SceneManager.MoveGameObjectToScene(camera.gameObject, scene);
                var light = new GameObject("Soft tropical review light").AddComponent<Light>(); light.type = LightType.Directional; light.shadows = LightShadows.Soft; light.shadowStrength = .55f; light.transform.rotation = Quaternion.Euler(50, -25, 0); SceneManager.MoveGameObjectToScene(light.gameObject, scene);
                var avatarPath = "Assets/Art/Avatars/campus-ash/avatar.prefab"; var avatarPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(avatarPath);
                if (avatarPrefab == null) { avatarPath = "Assets/Art/Avatars/campus-rowan/avatar.prefab"; avatarPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(avatarPath); }
                var avatar = avatarPrefab == null ? null : Object.Instantiate(avatarPrefab);
                if (avatar != null) { SceneManager.MoveGameObjectToScene(avatar, scene); var animator = avatar.GetComponentInChildren<Animator>(); if (animator != null) { animator.Rebind(); animator.Update(0); } }
                rules = JObject.Parse(File.ReadAllText("Assets/PUtown/Resources/Campus/campus.json")); units = (float)rules["coordinates"]["serverUnitsPerUnityUnit"]; zSign = (float)rules["coordinates"]["unityZSign"];
                var previousAmbient = RenderSettings.ambientLight; var previousShadows = QualitySettings.shadows; var previousDistance = QualitySettings.shadowDistance;
                var sites = new[] { new { name = "townhall", x = 2400f, y = 1800f }, new { name = "library", x = 2992f, y = 2130f }, new { name = "western-water", x = 1120f, y = 2400f }, new { name = "south-grove", x = 1390f, y = 3150f } };
                var folder = Path.Combine(Evidence, "previews"); Directory.CreateDirectory(folder);
                try
                {
                    QualitySettings.shadows = ShadowQuality.All; QualitySettings.shadowDistance = 30;
                    foreach (var site in sites) foreach (var night in new[] { false, true })
                    {
                        var focus = World(site.x, site.y, .85f); if (avatar != null) avatar.transform.position = World(site.x, site.y);
                        camera.transform.position = focus - camera.transform.forward * 8.5f;
                        light.color = night ? new Color(.38f, .54f, 1) : new Color(1, .96f, .87f); light.intensity = night ? .3f : .95f;
                        RenderSettings.ambientLight = night ? new Color(.17f, .24f, .42f) : new Color(.48f, .55f, .52f); camera.backgroundColor = night ? new Color(.05f, .10f, .19f) : new Color(.69f, .79f, .77f);
                        camera.Render(); RenderTexture.active = target; var image = new Texture2D(1920, 1080, TextureFormat.RGB24, false);
                        try { image.ReadPixels(new Rect(0, 0, 1920, 1080), 0, 0); image.Apply(); File.WriteAllBytes(Path.Combine(folder, site.name + "-" + (night ? "night" : "day") + ".png"), image.EncodeToPNG()); }
                        finally { Object.DestroyImmediate(image); }
                    }
                }
                finally { RenderSettings.ambientLight = previousAmbient; QualitySettings.shadows = previousShadows; QualitySettings.shadowDistance = previousDistance; }
                File.WriteAllText(Path.Combine(folder, "render-context.json"), JsonConvert.SerializeObject(new { camera = new { pitch = 48, yaw = 35, distance = 8.5, focusHeight = .85, fieldOfView = 45, width = 1920, height = 1080 }, previewAvatar = avatarPath, actualPreviewScene = true, limitation = "Editor render preview; does not verify packaged gameplay or frame rate." }, Formatting.Indented) + "\n");
            }
            finally { RenderTexture.active = null; Object.DestroyImmediate(target); foreach (var item in owned) Object.DestroyImmediate(item); EditorSceneManager.ClosePreviewScene(scene); }
        }
        private static Color Html(string value) { ColorUtility.TryParseHtmlString(value, out var colour); return colour; }
        public static void BuildAndReview() { Prepare(); RenderEvidence(); }
    }
}
