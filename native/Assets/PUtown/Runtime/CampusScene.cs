using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace PUtown.Runtime
{
    /// <summary>All traversable walls, door gaps and furnishings come from the Room's canonical rules.</summary>
    public sealed class CampusScene : IDisposable
    {
        public readonly GameObject Root;
        public readonly CampusRules Rules;
        private readonly Dictionary<string, List<Renderer>> interiorWalls = new Dictionary<string, List<Renderer>>();
        private readonly Dictionary<string, List<GameObject>> authoredExteriors = new Dictionary<string, List<GameObject>>();
        private readonly HashSet<string> authoredShells = new HashSet<string>();
        private readonly List<Material> materials = new List<Material>();
        private string appliedArea;
        private bool areaApplied;
        public CampusScene(CampusRules rules, Font font)
        {
            Rules = rules; Root = new GameObject("Kalapet campus"); Root.AddComponent<NativeSceneQuality>();
            var authoredFurniture = new HashSet<string>();
            var authoredSeats = new HashSet<string>();
            var authoredLandscape = new HashSet<string>();
            foreach (var resource in new[] { "Campus/CampusGarden" })
            {
                var authored = Resources.Load<GameObject>(resource); if (authored == null) continue;
                var art = UnityEngine.Object.Instantiate(authored, Root.transform);
                foreach (var transform in art.GetComponentsInChildren<Transform>(true))
                {
                    if (transform.name.StartsWith("Exterior:", StringComparison.Ordinal))
                    {
                        var id = transform.name.Substring(9); if (!authoredExteriors.TryGetValue(id, out var shells)) { shells = new List<GameObject>(); authoredExteriors[id] = shells; } shells.Add(transform.gameObject);
                        authoredShells.Add(id);
                    }
                    if (transform.name.StartsWith("Furniture:", StringComparison.Ordinal)) authoredFurniture.Add(transform.name.Substring(10));
                    if (transform.name.StartsWith("Seat:", StringComparison.Ordinal)) authoredSeats.Add(transform.name.Substring(5));
                    if (transform.name.StartsWith("Landscape:", StringComparison.Ordinal)) authoredLandscape.Add(transform.name.Substring(10));
                }
            }
            var groundMaterial = Resources.Load<Material>("Campus/GardenGround");
            var grass = groundMaterial != null ? groundMaterial : Material(new Color(.41f, .55f, .29f)); var cream = Material(new Color(.89f, .84f, .71f));
            var path = Material(new Color(.77f, .72f, .59f)); var clay = Material(new Color(.57f, .44f, .35f)); var wood = Material(new Color(.47f, .39f, .33f));
            Box("Campus ground", new Vector3(rules.Width / rules.Units / 2, -.08f, rules.Height / rules.Units / 2 * rules.ZSign), new Vector3(rules.Width / rules.Units, .1f, rules.Height / rules.Units), grass);
            foreach (var route in (JArray)rules.Data["routes"])
            {
                var points = (JArray)route["points"];
                for (var i = 1; i < points.Count; ++i)
                {
                    var a = rules.ToWorld((float)points[i - 1]["x"], (float)points[i - 1]["y"]); var b = rules.ToWorld((float)points[i]["x"], (float)points[i]["y"]); var vector = b - a;
                    var road = Box((string)route["name"], (a + b) / 2 + Vector3.up * -.015f, new Vector3((float)route["width"] / rules.Units, .035f, vector.magnitude), path);
                    road.transform.rotation = Quaternion.LookRotation(vector);
                }
            }
            foreach (var building in (JArray)rules.Data["buildings"])
            {
                var id = (string)building["interiorId"]; interiorWalls[id] = new List<Renderer>();
                Rectangle(building, .025f, .035f, cream);
                Label((string)building["name"], rules.ToWorld((float)building["x"] + (float)building["width"] / 2, (float)building["y"] - 48, .05f), font, .07f);
            }
            foreach (var obstacle in rules.Obstacles)
            {
                var kind = (string)obstacle["kind"]; if (kind == "furniture") continue;
                if (authoredLandscape.Contains((string)obstacle["id"])) continue;
                var area = rules.Area((float)obstacle["x"] + (float)obstacle["width"] / 2, (float)obstacle["y"] + (float)obstacle["height"] / 2);
                if (kind == "wall" && authoredShells.Contains(area)) continue;
                var height = kind == "wall" ? 1.5f : kind == "boundary" ? .35f : kind == "water" ? .04f : .7f;
                var material = kind == "water" ? Material(new Color(.15f, .57f, .67f)) : kind == "wall" ? cream : clay;
                var box = Rectangle(obstacle, height / 2, height, material);
                if (kind == "water") box.name = "Water:" + obstacle["id"];
                if (interiorWalls.TryGetValue(area, out var list)) list.Add(box.GetComponent<Renderer>());
            }
            foreach (var furniture in (JArray)rules.Data["furnishings"])
            {
                if (authoredFurniture.Contains((string)furniture["id"])) continue;
                var height = (float)furniture["heightUnits"] / rules.Units;
                Rectangle(furniture, height / 2, height, wood);
            }
            foreach (var seat in rules.Seats)
            {
                if (authoredSeats.Contains((string)seat["seat"])) continue;
                var location = rules.ToWorld((float)seat["x"], (float)seat["y"]);
                var chair = new GameObject("Retained Seat " + seat["seat"]); chair.transform.SetParent(Root.transform); chair.transform.position = location; chair.transform.rotation = rules.Facing((string)seat["facing"]);
                var basePart = Box("Chair seat", location + Vector3.up * .42f, new Vector3(.55f, .1f, .5f), wood); basePart.transform.SetParent(chair.transform, true);
                var back = Box("Chair back", location - chair.transform.forward * .25f + Vector3.up * .7f, new Vector3(.55f, .6f, .08f), wood); back.transform.rotation = chair.transform.rotation; back.transform.SetParent(chair.transform, true);
            }
        }
        private Material Material(Color colour)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard"); var m = new Material(shader); m.color = colour; materials.Add(m); return m;
        }
        private GameObject Rectangle(JToken r, float centreHeight, float height, Material material)
        {
            return Box((string)r["id"], Rules.ToWorld((float)r["x"] + (float)r["width"] / 2, (float)r["y"] + (float)r["height"] / 2, centreHeight), new Vector3((float)r["width"] / Rules.Units, height, (float)r["height"] / Rules.Units), material);
        }
        private GameObject Box(string name, Vector3 position, Vector3 scale, Material material)
        {
            var obj = GameObject.CreatePrimitive(PrimitiveType.Cube); obj.name = name; obj.transform.SetParent(Root.transform); obj.transform.position = position; obj.transform.localScale = scale;
            UnityEngine.Object.Destroy(obj.GetComponent<Collider>()); obj.GetComponent<Renderer>().sharedMaterial = material; return obj;
        }
        private void Label(string text, Vector3 position, Font font, float size)
        {
            var obj = new GameObject(text); obj.transform.SetParent(Root.transform); obj.transform.position = position; obj.transform.rotation = Quaternion.Euler(90, 0, 0);
            var label = obj.AddComponent<TextMesh>(); label.text = text; label.anchor = TextAnchor.MiddleCenter; label.alignment = TextAlignment.Center; label.fontSize = 48; label.characterSize = size; label.color = new Color(.16f, .22f, .17f);
            if (font != null) { label.font = font; obj.GetComponent<MeshRenderer>().sharedMaterial = font.material; }
        }
        public void ApplyArea(string area)
        {
            if (areaApplied && appliedArea == area) return;
            foreach (var pair in interiorWalls) foreach (var wall in pair.Value) if (wall != null) wall.enabled = pair.Key != area;
            foreach (var pair in authoredExteriors) foreach (var shell in pair.Value) shell.SetActive(pair.Key != area);
            appliedArea = area; areaApplied = true;
        }
        public void Dispose() { UnityEngine.Object.Destroy(Root); foreach (var m in materials) UnityEngine.Object.Destroy(m); }
    }
}
