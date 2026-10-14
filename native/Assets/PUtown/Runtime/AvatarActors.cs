using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace PUtown.Runtime
{
    public sealed class AvatarActors : IDisposable
    {
        private sealed class Actor
        {
            public GameObject Root;
            public Animator Animator;
            public AvatarSleepPose Sleep;
            public TextMesh Name;
            public Material Ring;
            public Renderer[] ModelRenderers;
            public bool Connected = true;
            public string Preset, Animation;
            public string DisplayName;
            public bool LabelInitialized, LabelGhost, LabelConnected, LabelRotationInitialized;
            public Quaternion LabelRotation, LabelParentRotation;
            public Vector3 LastPosition;
            public float WalkingUntil;
        }
        private sealed class LeftSeat
        {
            public TextMesh Name;
            public string DisplayName;
            public Quaternion LabelRotation;
            public bool LabelRotationInitialized;
        }
        private readonly Dictionary<string, Actor> actors = new Dictionary<string, Actor>();
        private readonly Dictionary<string, LeftSeat> leftSeats = new Dictionary<string, LeftSeat>();
        private readonly TownRules rules;
        private readonly Font font;
        public AvatarActors(TownRules rules, Font font) { this.rules = rules; this.font = font; }
        public void Render(NativeWorld world, NativeAvatarCollection collection, LocalPrediction local, Camera camera, float delta)
        {
            var visible = new HashSet<string>();
            if (world.RoomId == null || !collection.Covers(world)) { Clear(); return; }
            if (world.Phase == "day" || world.Phase == "night")
            {
                if (world.Field == null) { Clear(); return; }
                foreach (var p in (JArray)world.Field["players"])
                {
                    var id = (string)p["playerId"]; var identity = Identity(world, id); if (identity == null) continue;
                    var own = id == world.SelfPlayerId && local.Active;
                    var x = own ? local.Position.x : (float)p["x"]; var y = own ? local.Position.y : (float)p["y"]; var facing = own ? local.Facing : (string)p["facing"];
                    Draw(id, identity, x, y, facing, (bool)p["ghost"], false, own && local.Moving, world, collection, camera, delta); visible.Add(id);
                }
            }
            else
            {
                foreach (var p in world.Players.Values)
                {
                    var id = (string)p["playerId"]; var ghost = (string)Identity(world, id)?["status"] == "eliminated";
                    Draw(id, p, (float)p["x"], (float)p["y"], (string)p["facing"], ghost, true, false, world, collection, camera, delta); visible.Add(id);
                }
            }
            foreach (var id in actors.Keys.Where(id => !visible.Contains(id)).ToArray()) Remove(id);
            RenderLeftSeats(world, camera);
        }
        private static JObject Identity(NativeWorld world, string id)
        {
            var roster = world.Game?["players"] as JArray;
            var entry = roster?.FirstOrDefault(p => (string)p["playerId"] == id) as JObject;
            if (entry != null) return entry;
            return world.Players.TryGetValue(id, out var identity) ? identity : null;
        }
        private void Draw(string id, JObject identity, float x, float y, string facing, bool ghost, bool seated, bool localMoving, NativeWorld world, NativeAvatarCollection collection, Camera camera, float delta)
        {
            var preset = collection.Presets[(string)identity["avatarPreset"]];
            if (!actors.TryGetValue(id, out var actor) || actor.Preset != preset.Id)
            {
                if (actor != null) Remove(id);
                var root = new GameObject("Avatar " + id); var model = UnityEngine.Object.Instantiate(preset.Prefab, root.transform); model.name = "Published model";
                var animator = model.GetComponentInChildren<Animator>(); animator.applyRootMotion = false; animator.cullingMode = AnimatorCullingMode.AlwaysAnimate;
                if (animator.GetBoneTransform(HumanBodyBones.Hips)?.name != (string)preset.Manifest["rig"]["hipsBone"]) throw new FormatException("Published Avatar hips do not match the Humanoid mapping.");
                foreach (var collider in model.GetComponentsInChildren<Collider>(true)) UnityEngine.Object.Destroy(collider);
                var nameObject = new GameObject("Display Name"); nameObject.transform.SetParent(root.transform); nameObject.transform.localPosition = new Vector3(0, 2.05f, 0);
                var label = nameObject.AddComponent<TextMesh>(); label.text = (string)identity["displayName"]; label.fontSize = 48; label.characterSize = .035f; label.anchor = TextAnchor.LowerCenter;
                if (font != null) { label.font = font; nameObject.GetComponent<MeshRenderer>().sharedMaterial = font.material; }
                var marker = GameObject.CreatePrimitive(PrimitiveType.Cylinder); marker.name = "Player Colour"; marker.transform.SetParent(root.transform); marker.transform.localPosition = new Vector3(0, .025f, 0); marker.transform.localScale = new Vector3(.7f, .02f, .7f); UnityEngine.Object.Destroy(marker.GetComponent<Collider>());
                var material = new Material(Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard")); ColorUtility.TryParseHtmlString((string)identity["colour"], out var colour); material.color = colour; marker.GetComponent<Renderer>().sharedMaterial = material;
                var sleep = model.AddComponent<AvatarSleepPose>(); sleep.Rig = animator;
                actor = new Actor { Root = root, Animator = animator, Sleep = sleep, Name = label, Ring = material, ModelRenderers = model.GetComponentsInChildren<Renderer>(true), Preset = preset.Id, LastPosition = rules.ToWorld(x, y) }; actors[id] = actor;
                root.transform.position = actor.LastPosition;
            }
            var target = rules.ToWorld(x, y);
            if (Vector3.Distance(actor.LastPosition, target) > .005f) actor.WalkingUntil = Time.unscaledTime + .15f;
            var moving = localMoving || id != world.SelfPlayerId && Time.unscaledTime < actor.WalkingUntil;
            actor.Root.transform.position = id == world.SelfPlayerId ? target : Vector3.Lerp(actor.Root.transform.position, target, 1 - Mathf.Exp(-14 * delta));
            var rootRotation = Quaternion.Slerp(actor.Root.transform.rotation, rules.Facing(facing), 1 - Mathf.Exp(-15 * delta));
            actor.Root.transform.rotation = rootRotation; actor.LastPosition = target;
            var connected = !world.Players.TryGetValue(id, out var membership) || (bool)membership["connected"];
            if (actor.Connected != connected)
            {
                var appearance = new MaterialPropertyBlock();
                foreach (var renderer in actor.ModelRenderers)
                {
                    var materials = renderer.sharedMaterials;
                    for (var i = 0; i < materials.Length; i++)
                    {
                        appearance.Clear();
                        if (!connected)
                        {
                            var colour = materials[i].color * .45f; colour.a = materials[i].color.a;
                            appearance.SetColor("_Color", colour); appearance.SetColor("_BaseColor", colour);
                        }
                        renderer.SetPropertyBlock(appearance, i);
                    }
                }
                actor.Connected = connected;
            }
            var displayName = (string)identity["displayName"];
            if (!actor.LabelInitialized || actor.DisplayName != displayName || actor.LabelGhost != ghost || actor.LabelConnected != connected)
            {
                actor.Name.text = displayName + (ghost ? " (Ghost)" : "") + (connected ? "" : " · Reconnecting…");
                actor.Name.color = !connected ? new Color(.65f, .67f, .68f) : ghost ? new Color(.73f, .87f, 1) : Color.white;
                actor.DisplayName = displayName; actor.LabelGhost = ghost; actor.LabelConnected = connected; actor.LabelInitialized = true;
            }
            var labelRotation = camera.transform.rotation;
            if (!actor.LabelRotationInitialized || !actor.LabelRotation.Equals(labelRotation) || !actor.LabelParentRotation.Equals(rootRotation))
            { actor.Name.transform.rotation = labelRotation; actor.LabelRotation = labelRotation; actor.LabelParentRotation = rootRotation; actor.LabelRotationInitialized = true; }
            actor.Sleep.Sleeping = world.Phase == "night";
            var animation = seated ? "seated" : moving && world.Phase == "day" ? "walking" : "standing";
            if (actor.Animation != animation)
            {
                var clipName = (string)preset.Manifest["animations"][animation]["clipName"]; actor.Animator.CrossFade(clipName, .12f); actor.Animation = animation;
            }
        }
        private void RenderLeftSeats(NativeWorld world, Camera camera)
        {
            var departed = world.Phase == "day" || world.Phase == "night" ? new JArray() : (JArray)world.Game?["players"] ?? new JArray();
            var ids = new HashSet<string>();
            foreach (var player in departed.Where(p => !world.Players.ContainsKey((string)p["playerId"])))
            {
                var id = (string)player["playerId"]; ids.Add(id);
                if (!leftSeats.TryGetValue(id, out var seatLabel))
                {
                    var obj = new GameObject("Empty Seat " + id); var label = obj.AddComponent<TextMesh>();
                    label.anchor = TextAnchor.MiddleCenter; label.fontSize = 48; label.characterSize = .035f; label.color = new Color(.8f, .81f, .72f);
                    if (font != null) { label.font = font; obj.GetComponent<Renderer>().sharedMaterial = font.material; }
                    var seat = rules.Seats.First(s => (int)s["seat"] == (int)player["seat"]); obj.transform.position = rules.ToWorld((float)seat["x"], (float)seat["y"], .75f);
                    seatLabel = new LeftSeat { Name = label }; leftSeats[id] = seatLabel;
                }
                var displayName = (string)player["displayName"];
                if (seatLabel.DisplayName != displayName) { seatLabel.Name.text = displayName + " · Left"; seatLabel.DisplayName = displayName; }
                var labelRotation = camera.transform.rotation;
                if (!seatLabel.LabelRotationInitialized || !seatLabel.LabelRotation.Equals(labelRotation))
                { seatLabel.Name.transform.rotation = labelRotation; seatLabel.LabelRotation = labelRotation; seatLabel.LabelRotationInitialized = true; }
            }
            foreach (var id in leftSeats.Keys.Where(id => !ids.Contains(id)).ToArray()) { UnityEngine.Object.Destroy(leftSeats[id].Name.gameObject); leftSeats.Remove(id); }
        }
        private void Remove(string id) { var actor = actors[id]; UnityEngine.Object.Destroy(actor.Root); UnityEngine.Object.Destroy(actor.Ring); actors.Remove(id); }
        private void Clear() { foreach (var id in actors.Keys.ToArray()) Remove(id); foreach (var label in leftSeats.Values) UnityEngine.Object.Destroy(label.Name.gameObject); leftSeats.Clear(); }
        public void Dispose() { Clear(); }
    }
}
