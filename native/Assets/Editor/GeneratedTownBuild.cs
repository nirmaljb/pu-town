using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

namespace PUtown.Editor
{
    /// <summary>Dress the two canonical exterior towns with retained free source models.</summary>
    public static class GeneratedTownBuild
    {
        private const string Art = "Assets/Art/Quaternius/";
        private const string ResourcesPath = "Assets/PUtown/Resources/Towns/";
        private static readonly string[] Maps = { "woodland", "market" };
        private static readonly Dictionary<string, JObject> Descriptions = new Dictionary<string, JObject>();
        private static readonly Dictionary<string, Material> Materials = new Dictionary<string, Material>();
        private static readonly List<object> Placements = new List<object>();
        private static JObject rules;
        private static float units, zSign;
        private static string mapId;
        private static string Repository => Environment.GetEnvironmentVariable("PU_TOWN_REPOSITORY") ?? Path.GetFullPath(Path.Combine(Application.dataPath, "../.."));
        private static string Evidence => Path.Combine(Repository, "towns/assets/sources");

        [MenuItem("PU Town/Towns/Prepare generated towns")]
        public static void Prepare()
        {
            AssetDatabase.Refresh(); Descriptions.Clear(); Materials.Clear();
            Directory.CreateDirectory(Art + "TownMaterials"); Directory.CreateDirectory(Art + "TownDerivedTextures");
            Directory.CreateDirectory(ResourcesPath);
            foreach (var name in new[] { "PUtown/Town Ground", "PUtown/Quaternius Foliage", "Standard" })
            {
                var shader = Shader.Find(name);
                if (shader == null || ShaderUtil.ShaderHasError(shader)) throw new InvalidOperationException("Town shader must compile: " + name);
            }
            foreach (var pack in new[] { "Nature", "Village", "Props" }) ImportPack(pack);
            foreach (var id in Maps) PrepareTown(id);
            AssetDatabase.SaveAssets();
        }

        private static void ImportPack(string pack)
        {
            var selection = JObject.Parse(File.ReadAllText(Path.Combine(Evidence, "quaternius", pack + "-selection.json")));
            foreach (JObject texture in (JArray)selection["textures"])
            {
                var path = Art + pack + "/Textures/" + Path.GetFileName((string)texture["importPath"]);
                var importer = AssetImporter.GetAtPath(path) as TextureImporter ?? throw new InvalidOperationException("Missing exact free source texture: " + path);
                var normal = path.EndsWith("_Normal.png", StringComparison.Ordinal);
                importer.textureType = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
                importer.sRGBTexture = !normal && !path.EndsWith("_ORM.png") && !path.EndsWith("_Roughness.png");
                importer.alphaIsTransparency = pack == "Nature" && !normal;
                importer.mipmapEnabled = true; importer.maxTextureSize = pack == "Nature" ? 1024 : 2048;
                importer.SaveAndReimport();
            }
            foreach (JObject model in (JArray)selection["models"])
            {
                var path = Art + pack + "/Models/" + (string)model["name"] + ".fbx";
                var importer = AssetImporter.GetAtPath(path) as ModelImporter ?? throw new InvalidOperationException("Missing exact free source mesh: " + path);
                importer.importAnimation = false; importer.isReadable = false; importer.addCollider = false;
                importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard; importer.SaveAndReimport();
                foreach (JObject description in (JArray)model["materials"]) Descriptions[pack + "/" + (string)description["name"]] = description;
            }
        }

        private static void PrepareTown(string id)
        {
            mapId = id; Placements.Clear();
            rules = JObject.Parse(File.ReadAllText(ResourcesPath + id + ".json"));
            if ((string)rules["mapId"] != id || ((JArray)rules["meeting"]["seats"]).Count != 10 || ((JArray)rules["interiors"]).Count != 0)
                throw new InvalidOperationException("Town art requires the canonical exterior-only map and ten retained Seats.");
            units = (float)rules["coordinates"]["serverUnitsPerUnityUnit"]; zSign = (float)rules["coordinates"]["unityZSign"];
            var root = new GameObject(id == "woodland" ? "Woodland Village" : "Market Town");
            try
            {
                Ground(root.transform); Routes(root.transform); Buildings(root.transform);
                Meeting(root.transform); Vegetation(root.transform); Landmarks(root.transform); Furniture(root.transform);
                if (root.GetComponentsInChildren<Collider>(true).Length != 0) throw new InvalidOperationException("Town art must not become movement authority.");
                var prefab = PrefabUtility.SaveAsPrefabAsset(root, ResourcesPath + id + "Garden.prefab");
                if (prefab == null) throw new InvalidOperationException("Could not save the complete Town art prefab.");
                var meshes = root.GetComponentsInChildren<MeshFilter>(true);
                var renderers = root.GetComponentsInChildren<Renderer>(true);
                var report = new { mapId = id, unityVersion = Application.unityVersion, placements = Placements.ToArray(),
                    meshRenderers = renderers.Length, triangles = meshes.Sum(m => m.sharedMesh == null ? 0 : m.sharedMesh.triangles.Length / 3),
                    materials = renderers.SelectMany(r => r.sharedMaterials).Distinct().Count(),
                    source = "Exact free Medieval Village Standard, retained Stylized Nature Standard and three existing free Fantasy Props meshes.",
                    collision = "No art Colliders. Canonical building rectangles alone own accepted movement.",
                    buildings = ((JArray)rules["buildings"]).Count, seats = 10, interiors = 0,
                    reviewLimit = "Editor composition and render evidence do not establish packaged runtime or hardware performance." };
                Directory.CreateDirectory(Path.Combine(Repository, "towns", id, "previews"));
                File.WriteAllText(Path.Combine(Repository, "towns", id, "previews", "unity-art-report.json"), JsonConvert.SerializeObject(report, Formatting.Indented) + "\n");
            }
            finally { Object.DestroyImmediate(root); }
        }

        private static Texture2D Texture(string pack, string name) => name == null ? null : AssetDatabase.LoadAssetAtPath<Texture2D>(Art + pack + "/Textures/" + name);
        private static Color Html(string value) { ColorUtility.TryParseHtmlString(value, out var colour); return colour; }
        private static Material MaterialFor(string pack, string importedName, string palette = "")
        {
            var name = importedName.Replace(" (Instance)", ""); var key = pack + "/" + name + "/" + palette;
            if (Materials.TryGetValue(key, out var retained)) return retained;
            if (!Descriptions.TryGetValue(pack + "/" + name, out var description)) throw new InvalidOperationException("Missing exact source material mapping: " + key);
            var cutout = (string)description["alphaMode"] == "MASK";
            var foliage = pack == "Nature" && cutout;
            var path = Art + "TownMaterials/" + pack + "-" + name + (palette == "" ? "" : "-" + palette) + ".mat";
            var shader = Shader.Find(foliage ? "PUtown/Quaternius Foliage" : "Standard");
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(shader); AssetDatabase.CreateAsset(material, path); }
            material.shader = shader; material.enableInstancing = true;
            var factor = (JArray)description["baseColorFactor"];
            material.color = new Color((float)factor[0], (float)factor[1], (float)factor[2], (float)factor[3]);
            if (palette != "" && name == "MI_Plaster") material.color *= palette == "warm" ? Html("#f2dec3") : palette == "sage" ? Html("#c3d0b9") : Html("#ddd0bb");
            if (palette == "warm" && name == "MI_RoundTiles") material.color *= Html("#cc977d");
            material.mainTexture = Texture(pack, (string)description["baseColorTexture"]);
            material.SetFloat("_Glossiness", .12f); material.SetFloat("_Metallic", (float)description["metallicFactor"]);
            var normal = Texture(pack, (string)description["normalTexture"]);
            material.SetTexture("_BumpMap", normal);
            if (normal != null) { material.EnableKeyword("_NORMALMAP"); material.SetFloat("_BumpScale", .7f); }
            else material.DisableKeyword("_NORMALMAP");
            if (foliage) { material.SetFloat("_Cutoff", (float)description["alphaCutoff"]); material.SetFloat("_Visibility", 1); material.SetFloat("_WindStrength", .02f); }
            else if (cutout) { material.SetFloat("_Mode", 1); material.SetFloat("_Cutoff", (float)description["alphaCutoff"]); material.EnableKeyword("_ALPHATEST_ON"); material.renderQueue = (int)RenderQueue.AlphaTest; }
            var orm = (string)description["metallicRoughnessTexture"];
            if (orm != null) Repack(pack, orm, material);
            if ((string)description["alphaMode"] == "BLEND")
            {
                // Exterior windows remain an opaque muted pane: buildings cannot be entered.
                material.color = new Color(.22f, .33f, .31f, 1); material.SetFloat("_Glossiness", .45f);
            }
            EditorUtility.SetDirty(material); Materials[key] = material; return material;
        }

        private static void Repack(string pack, string name, Material material)
        {
            var stem = Art + "TownDerivedTextures/" + pack + "-" + Path.GetFileNameWithoutExtension(name);
            if (!File.Exists(stem + "-Metal.png") || !File.Exists(stem + "-Occlusion.png"))
            {
                var source = new Texture2D(2, 2, TextureFormat.RGBA32, false, true);
                try
                {
                    if (!source.LoadImage(File.ReadAllBytes(Art + pack + "/Textures/" + name))) throw new InvalidOperationException("Invalid original metallic/roughness map.");
                    var pixels = source.GetPixels32(); var metallic = new Color32[pixels.Length]; var occlusion = new Color32[pixels.Length];
                    for (var i = 0; i < pixels.Length; i++) { var p = pixels[i]; metallic[i] = new Color32(p.b, 0, 0, (byte)(255 - p.g)); occlusion[i] = new Color32(p.r, p.r, p.r, 255); }
                    WriteTexture(source.width, source.height, metallic, stem + "-Metal.png"); WriteTexture(source.width, source.height, occlusion, stem + "-Occlusion.png");
                }
                finally { Object.DestroyImmediate(source); }
            }
            foreach (var suffix in new[] { "-Metal.png", "-Occlusion.png" })
            {
                AssetDatabase.ImportAsset(stem + suffix); var importer = (TextureImporter)AssetImporter.GetAtPath(stem + suffix);
                importer.sRGBTexture = false; importer.mipmapEnabled = true; importer.maxTextureSize = 2048; importer.SaveAndReimport();
            }
            material.SetTexture("_MetallicGlossMap", AssetDatabase.LoadAssetAtPath<Texture2D>(stem + "-Metal.png")); material.EnableKeyword("_METALLICGLOSSMAP");
            material.SetFloat("_GlossMapScale", .45f); material.SetTexture("_OcclusionMap", AssetDatabase.LoadAssetAtPath<Texture2D>(stem + "-Occlusion.png"));
            material.SetFloat("_OcclusionStrength", .45f);
        }
        private static void WriteTexture(int width, int height, Color32[] pixels, string path)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGBA32, false, true);
            try { texture.SetPixels32(pixels); texture.Apply(); File.WriteAllBytes(path, texture.EncodeToPNG()); }
            finally { Object.DestroyImmediate(texture); }
        }

        private static Vector3 World(float x, float y, float elevation = 0) => new Vector3(x / units, elevation, y / units * zSign);
        private static GameObject Group(Transform parent, string name) { var group = new GameObject(name); group.transform.SetParent(parent, false); return group; }
        private static Bounds BoundsOf(GameObject root) { var renderers = root.GetComponentsInChildren<Renderer>(); var bounds = renderers[0].bounds; foreach (var renderer in renderers.Skip(1)) bounds.Encapsulate(renderer.bounds); return bounds; }
        private static GameObject Place(string pack, string model, Transform parent, string name, Vector3 centre, Vector3 dimensions, float yaw = 0, bool uniform = false, string palette = "")
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Art + pack + "/Models/" + model + ".fbx") ?? throw new InvalidOperationException("Required free pack mesh is absent: " + pack + "/" + model);
            var container = Group(parent, name); var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab); instance.transform.SetParent(container.transform, false);
            var bounds = BoundsOf(instance); var size = bounds.size;
            var scale = new Vector3(dimensions.x / Mathf.Max(.001f, size.x), dimensions.y / Mathf.Max(.001f, size.y), dimensions.z / Mathf.Max(.001f, size.z));
            if (uniform) scale = Vector3.one * Mathf.Min(scale.x, Mathf.Min(scale.y, scale.z));
            instance.transform.localPosition -= bounds.center; container.transform.localScale = scale; container.transform.position = centre; container.transform.rotation = Quaternion.Euler(0, yaw, 0);
            foreach (var renderer in instance.GetComponentsInChildren<Renderer>()) renderer.sharedMaterials = renderer.sharedMaterials.Select(m => MaterialFor(pack, m.name, palette)).ToArray();
            foreach (var collider in instance.GetComponentsInChildren<Collider>(true)) Object.DestroyImmediate(collider);
            Placements.Add(new { pack, model, group = parent.name, name, x = centre.x, y = centre.y, z = centre.z, dimensions = new[] { dimensions.x, dimensions.y, dimensions.z }, yaw, uniform });
            return container;
        }
        private static GameObject Grounded(string pack, string model, Transform parent, string name, float x, float y, Vector3 size, float yaw = 0)
        {
            var item = Place(pack, model, parent, name, World(x, y, size.y / 2), size, yaw, true);
            item.transform.position -= Vector3.up * BoundsOf(item).min.y; return item;
        }
        private static void Ground(Transform root)
        {
            var path = Art + "TownMaterials/" + mapId + "-Meadow.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (material == null) { material = new Material(Shader.Find("PUtown/Town Ground")); AssetDatabase.CreateAsset(material, path); }
            material.SetColor("_Color", Html(mapId == "woodland" ? "#719654" : "#929176"));
            material.SetColor("_ShadeColor", Html(mapId == "woodland" ? "#507249" : "#757e62")); material.SetColor("_DryColor", Html("#a59b73"));
            material.SetTexture("_SoilTex", Texture("Village", "T_UnevenBrick_BaseColor.png")); material.enableInstancing = true;
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane); ground.name = "Meadow"; ground.transform.SetParent(root, false);
            ground.transform.position = World((float)rules["width"] / 2, (float)rules["height"] / 2, -.025f);
            ground.transform.localScale = new Vector3((float)rules["width"] / units / 10, 1, (float)rules["height"] / units / 10);
            ground.GetComponent<Renderer>().sharedMaterial = material; Object.DestroyImmediate(ground.GetComponent<Collider>());
        }
        private static void Routes(Transform root)
        {
            var paths = Group(root, "Town streets").transform;
            foreach (JObject route in (JArray)rules["routes"])
            {
                var group = Group(paths, (string)route["name"]).transform; var points = (JArray)route["points"];
                for (var i = 1; i < points.Count; i++)
                {
                    var a = World((float)points[i - 1]["x"], (float)points[i - 1]["y"]); var b = World((float)points[i]["x"], (float)points[i]["y"]);
                    var vector = b - a; if (vector.magnitude < .01f) continue;
                    var count = Mathf.Max(1, Mathf.CeilToInt(vector.magnitude / 1.4f)); var length = vector.magnitude / count;
                    for (var tile = 0; tile < count; tile++) Place("Village", "Floor_UnevenBrick", group, "Street paving", Vector3.Lerp(a, b, (tile + .5f) / count) + Vector3.up * .012f,
                        new Vector3((float)route["width"] / units, .035f, length + .015f), Mathf.Atan2(vector.x, vector.z) * Mathf.Rad2Deg);
                }
            }
        }
        private static void Buildings(Transform root)
        {
            foreach (JObject building in (JArray)rules["buildings"])
            {
                var group = Group(root, "Building:" + (string)building["id"]).transform;
                var width = (float)building["width"] / units; var depth = (float)building["height"] / units;
                var centre = World((float)building["x"] + (float)building["width"] / 2, (float)building["y"] + (float)building["height"] / 2);
                var variant = (string)building["variant"]; var wallHeight = variant == "workshop" ? 2.65f : variant == "longhouse" ? 2.85f : 2.45f;
                var brick = variant == "workshop"; var palette = mapId == "woodland" ? "sage" : "warm";
                var prefix = brick ? "Wall_UnevenBrick" : "Wall_Plaster";
                var across = Mathf.Max(2, Mathf.RoundToInt(width / 1.8f)); var along = Mathf.Max(2, Mathf.RoundToInt(depth / 1.8f));
                var segment = width / across;
                for (var i = 0; i < across; i++)
                {
                    var localX = -width / 2 + (i + .5f) * segment;
                    var front = prefix + "_Straight";
                    Place("Village", front, group, "Front facade", centre + new Vector3(localX, wallHeight / 2, depth / 2 - .1f), new Vector3(segment + .02f, wallHeight, .2f), palette: palette);
                    Place("Village", prefix + "_Straight", group, "Back facade", centre + new Vector3(localX, wallHeight / 2, -depth / 2 + .1f), new Vector3(segment + .02f, wallHeight, .2f), 180, palette: palette);
                    if (i == across / 2) Place("Village", "Door_4_Flat", group, "Closed non-enterable door", centre + new Vector3(localX, .92f, depth / 2 - .025f), new Vector3(Mathf.Min(.95f, segment * .75f), 1.84f, .075f), palette: palette);
                    else if (i % 2 == 0) Place("Village", "WindowShutters_Wide_Flat_Closed", group, "Closed shutters", centre + new Vector3(localX, 1.2f, depth / 2 - .015f), new Vector3(Mathf.Min(1.05f, segment * .65f), .8f, .08f), palette: palette);
                }
                segment = depth / along;
                for (var i = 0; i < along; i++) for (var side = -1; side <= 1; side += 2)
                {
                    Place("Village", prefix + "_Straight", group, "Side facade", centre + new Vector3(side * (width / 2 - .1f), wallHeight / 2, -depth / 2 + (i + .5f) * segment),
                        new Vector3(segment + .02f, wallHeight, .2f), side * 90, palette: palette);
                    if (i % 2 == 0) Place("Village", "WindowShutters_Wide_Flat_Closed", group, "Closed side shutters", centre + new Vector3(side * (width / 2 + .015f), 1.2f, -depth / 2 + (i + .5f) * segment),
                        new Vector3(Mathf.Min(1.05f, segment * .65f), .8f, .08f), side * 90, palette: palette);
                }
                var roof = depth > width * 1.5f ? "Roof_RoundTiles_4x8" : depth > width * 1.1f ? "Roof_RoundTiles_4x6" : "Roof_RoundTiles_4x4";
                var roofHeight = Mathf.Clamp(width * .35f, 1.0f, 2.0f);
                Place("Village", roof, group, "Tiled roof", centre + Vector3.up * (wallHeight + roofHeight / 2 - .02f), new Vector3(width, roofHeight, depth), palette: palette);
                foreach (var side in new[] { -1, 1 }) Place("Village", "Roof_Front_Brick4", group, "Closed gable", centre + new Vector3(0, wallHeight + roofHeight * .43f, side * (depth / 2 - .1f)), new Vector3(width * .9f, roofHeight * .8f, .17f), side < 0 ? 180 : 0, palette: palette);
                Place("Village", brick ? "Prop_Chimney2" : "Prop_Chimney", group, "Chimney", centre + new Vector3(width * .22f, wallHeight + roofHeight * .7f, -depth * .18f), new Vector3(.4f, 1.25f, .4f), palette: palette);
            }
        }
        private static void Meeting(Transform root)
        {
            var group = Group(root, "Meeting Area").transform; var meeting = rules["meeting"];
            var radius = (float)meeting["radiusX"] / units + .65f;
            var shortRadius = (float)meeting["radiusY"] / units + .65f;
            var centre = World((float)meeting["x"], (float)meeting["y"]);
            for (var x = -radius; x < radius; x += .9f) for (var z = -radius; z < radius; z += .9f)
                if (Mathf.Pow((x + .45f) / radius, 2) + Mathf.Pow((z + .45f) / shortRadius, 2) < 1) Place("Village", "Floor_UnevenBrick", group, "Meeting paving", centre + new Vector3(x + .45f, .025f, z + .45f), new Vector3(.92f, .04f, .92f));
            foreach (JObject seat in (JArray)rules["meeting"]["seats"])
            {
                var x = (float)seat["x"]; var y = (float)seat["y"]; var position = World(x, y);
                var direction = centre - position; var yaw = Mathf.Atan2(direction.x, direction.z) * Mathf.Rad2Deg;
                // The actual free Chair mesh keeps a seat height suitable for KayKit's Chair_Idle.
                Grounded("Props", "Chair_1", group, "Seat:" + (int)seat["seat"], x, y, new Vector3(.82f, .94f, .82f), yaw);
            }
        }
        private static void Vegetation(Transform root)
        {
            var index = 0;
            foreach (JObject plant in (JArray)rules["vegetation"])
            {
                var group = Group(root, "Vegetation:" + (string)plant["id"]).transform; var kind = (string)plant["kind"];
                var scale = (float)(plant["scale"] ?? 1); var yaw = (float)(plant["rotation"] ?? 0); string model; Vector3 size;
                switch (kind)
                {
                    case "pine": model = "Pine_" + (index % 3 + 1); size = new Vector3(2.0f, 4.3f, 2.0f); break;
                    case "broadleaf": model = index % 2 == 0 ? "CommonTree_1" : "CommonTree_4"; size = new Vector3(2.65f, 3.7f, 2.65f); break;
                    case "shrub": model = index % 2 == 0 ? "Bush_Common" : "Bush_Common_Flowers"; size = new Vector3(.85f, .75f, .85f); break;
                    case "flowers": model = index % 2 == 0 ? "Flower_3_Group" : "Flower_4_Group"; size = new Vector3(.65f, .55f, .65f); break;
                    case "grass": model = "Grass_Common_Short"; size = new Vector3(.65f, .4f, .65f); break;
                    case "rock": model = "Rock_Medium_" + (index % 3 + 1); size = new Vector3(.9f, .65f, .85f); break;
                    default: throw new InvalidOperationException("Unmapped canonical vegetation kind: " + kind);
                }
                Grounded("Nature", model, group, kind, (float)plant["x"], (float)plant["y"], size * scale, yaw); index++;
            }
        }
        private static void Landmarks(Transform root)
        {
            foreach (JObject landmark in (JArray)rules["landmarks"])
            {
                var group = Group(root, "Landmark:" + (string)landmark["id"]).transform;
                var x = (float)landmark["x"] + (float)landmark["width"] / 2; var y = (float)landmark["y"] + (float)landmark["height"] / 2; var kind = (string)landmark["kind"];
                if (kind == "well")
                {
                    for (var i = 0; i < 9; i++) { var a = i * Mathf.PI * 2 / 9; Grounded("Nature", "Rock_Medium_1", group, "Well stone", x + Mathf.Cos(a) * 65, y + Mathf.Sin(a) * 65, new Vector3(.5f, .48f, .45f), i * 40); }
                    Place("Village", "Roof_Tower_RoundTiles", group, "Well canopy", World(x, y, 1.8f), new Vector3(1.6f, .65f, 1.6f));
                    foreach (var offset in new[] { -60, 60 }) Place("Village", "Prop_Support", group, "Well timber", World(x + offset, y, .75f), new Vector3(.15f, 1.5f, .15f));
                }
                else if (kind == "market")
                {
                    // Tables and their canopy roots use the matching canonical furnishing footprints.
                }
                else if (kind == "gate")
                {
                    foreach (var offset in new[] { -160, 160 }) Place("Village", "Prop_Support", group, "Gate timber", World(x + offset, y, 1.25f), new Vector3(.38f, 2.5f, .38f));
                    Place("Village", "Roof_Log", group, "Gate beam", World(x, y, 2.4f), new Vector3(3.6f, .35f, .45f));
                }
                else if (kind == "square")
                {
                    Grounded("Props", "Bench", group, "Square bench", x - 105, y + 105, new Vector3(1.4f, .72f, .65f), 90);
                    Grounded("Nature", "Bush_Common_Flowers", group, "Square flowers", x + 80, y + 95, new Vector3(1, .6f, 1));
                }
            }
        }
        private static void Furniture(Transform root)
        {
            foreach (JObject item in (JArray)rules["furnishings"])
            {
                var kind = (string)item["kind"]; var model = kind == "bench" ? "Bench" : "Table_Large";
                var x = (float)item["x"] + (float)item["width"] / 2; var y = (float)item["y"] + (float)item["height"] / 2;
                var width = (float)item["width"] / units; var depth = (float)item["height"] / units; var height = (float)item["heightUnits"] / units;
                Place("Props", model, root, "Furniture:" + (string)item["id"], World(x, y, height / 2), new Vector3(width, height, depth), (float)(item["rotation"] ?? 0));
                if (kind != "market-table") continue;
                var stand = Group(root, "Building:canopy-" + (string)item["id"]).transform;
                Place("Village", "Roof_Tower_RoundTiles", stand, "Market canopy", World(x, y, 2.05f), new Vector3(width + .4f, .5f, depth + .5f));
                foreach (var side in new[] { -1, 1 }) Place("Village", "Prop_Support", stand, "Stall timber", World(x + side * (width * units / 2 + 4), y, .9f), new Vector3(.1f, 1.8f, .1f));
                Place("Village", "Prop_Crate", stand, "Market display", World(x + 15, y, height + .16f), new Vector3(.4f, .32f, .35f));
            }
        }

        [MenuItem("PU Town/Towns/Build and render art review")]
        public static void BuildAndReview()
        {
            Prepare();
            foreach (var id in Maps)
            {
                rules = JObject.Parse(File.ReadAllText(ResourcesPath + id + ".json"));
                units = (float)rules["coordinates"]["serverUnitsPerUnityUnit"]; zSign = (float)rules["coordinates"]["unityZSign"];
                var preview = new PreviewRenderUtility();
                try
                {
                    var root = Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(ResourcesPath + id + "Garden.prefab")); preview.AddSingleGO(root);
                    preview.ambientColor = new Color(.62f, .65f, .59f); preview.lights[0].intensity = 1.2f; preview.lights[0].transform.rotation = Quaternion.Euler(45, -30, 0); preview.lights[1].intensity = .45f;
                    var camera = preview.camera; camera.fieldOfView = 45; camera.nearClipPlane = .1f; camera.farClipPlane = 200; camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = Html("#bdcdb5");
                    var views = new List<(string name, Vector3 target, float distance)> { ("meeting", World((float)rules["meeting"]["x"], (float)rules["meeting"]["y"], .85f), 10.5f),
                        ("overview", World((float)rules["width"] / 2, (float)rules["height"] / 2, 0), Mathf.Max((float)rules["width"], (float)rules["height"]) / units * 1.15f) };
                    foreach (JObject landmark in ((JArray)rules["landmarks"]).Take(2)) views.Add(((string)landmark["id"], World((float)landmark["x"], (float)landmark["y"], .85f), 8.5f));
                    foreach (var view in views)
                    {
                        camera.transform.rotation = Quaternion.Euler(48, 35, 0); camera.transform.position = view.target - camera.transform.forward * view.distance;
                        preview.BeginStaticPreview(new Rect(0, 0, 1600, 1000)); preview.Render(); var texture = preview.EndStaticPreview();
                        File.WriteAllBytes(Path.Combine(Repository, "towns", id, "previews", "unity-" + view.name + ".png"), texture.EncodeToPNG()); Object.DestroyImmediate(texture);
                    }
                }
                finally { preview.Cleanup(); }
            }
        }
    }
}
