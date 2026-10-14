using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace PUtown.Runtime
{
    public static class NativeTownMaps
    {
        public const string Default = "woodland";
        public static readonly IReadOnlyList<string> Ids = Array.AsReadOnly(new[] { "woodland", "market" });
        public static bool Supports(string mapId) { return Ids.Contains(mapId); }
        public static string Name(string mapId) { return mapId == "woodland" ? "Woodland Village" : mapId == "market" ? "Market Town" : "Unsupported town"; }
        public static TownRules Load(string mapId)
        {
            if (!Supports(mapId)) throw new FormatException("This Room needs a supported native Town Map.");
            var source = Resources.Load<TextAsset>("Towns/" + mapId);
            if (source == null) throw new InvalidOperationException("The build is missing the canonical rules for " + Name(mapId) + ".");
            var rules = new TownRules(source.text);
            if (rules.MapId != mapId) throw new FormatException("The packaged town does not match the Room's selected map.");
            return rules;
        }
    }

    public sealed class TownRules
    {
        public readonly JObject Data;
        public string MapId { get { return (string)Data["mapId"]; } }
        public bool TasksEnabled { get { return (bool)Data["tasksEnabled"]; } }
        public readonly float Units, ZSign, Width, Height, FootRadius, WalkSpeed;
        public JArray Obstacles { get { return (JArray)Data["obstacles"]; } }
        public JArray Interiors { get { return (JArray)Data["interiors"]; } }
        public JArray Seats { get { return (JArray)Data["meeting"]["seats"]; } }
        public TownRules(string json)
        {
            Data = StrictProtocol.ParseObject(json);
            if (StrictProtocol.Integer(Data["schemaVersion"]) != 1 || !NativeTownMaps.Supports(MapId)) throw new FormatException("Unsupported town publication.");
            if (StrictProtocol.Bool(Data["tasksEnabled"]) || StrictProtocol.Array(Data["tasks"]).Count != 0 || StrictProtocol.Array(Data["interiors"]).Count != 0)
                throw new FormatException("The native towns currently have no Tasks or enterable buildings.");
            Units = (float)StrictProtocol.Number(Data["coordinates"]?["serverUnitsPerUnityUnit"]);
            ZSign = (float)StrictProtocol.Number(Data["coordinates"]?["unityZSign"]);
            Width = (float)StrictProtocol.Number(Data["width"]); Height = (float)StrictProtocol.Number(Data["height"]);
            FootRadius = (float)StrictProtocol.Number(Data["movement"]?["footRadius"]); WalkSpeed = (float)StrictProtocol.Number(Data["movement"]?["predictedSpeed"]);
            if (Units <= 0 || Mathf.Abs(ZSign) != 1 || Width <= 0 || Height <= 0 || FootRadius < 0 || WalkSpeed <= 0) throw new FormatException("Invalid town coordinate or movement mapping.");
            StrictProtocol.Array(Data["obstacles"]); StrictProtocol.Array(Data["interiors"]);
            if (Seats.Count != 10 || !Seats.Select(s => (int)s["seat"]).OrderBy(s => s).SequenceEqual(Enumerable.Range(0, 10))) throw new FormatException("A town needs ten distinct retained Seats.");
            foreach (var token in Obstacles.Concat(Interiors))
            {
                var r = StrictProtocol.Obj(token); StrictProtocol.Text(r["id"]); StrictProtocol.Number(r["x"]); StrictProtocol.Number(r["y"]);
                if (StrictProtocol.Number(r["width"]) <= 0 || StrictProtocol.Number(r["height"]) <= 0) throw new FormatException("Invalid town rectangle.");
            }
        }
        public Vector3 ToWorld(float x, float y, float elevation = 0) { return new Vector3(x / Units, elevation, y / Units * ZSign); }
        public Vector2 ToServer(Vector3 position) { return new Vector2(position.x * Units, position.z * Units / ZSign); }
        public Quaternion Facing(string facing)
        {
            var direction = facing == "up" ? new Vector3(0, 0, -ZSign) : facing == "down" ? new Vector3(0, 0, ZSign) : facing == "left" ? Vector3.left : Vector3.right;
            return Quaternion.LookRotation(direction);
        }
        public string Area(float x, float y)
        {
            var interior = Interiors.FirstOrDefault(r => x >= (float)r["x"] && y >= (float)r["y"] && x < (float)r["x"] + (float)r["width"] && y < (float)r["y"] + (float)r["height"]);
            return (string)interior?["id"] ?? "outdoors";
        }
        public bool Walkable(float x, float y)
        {
            if (x < FootRadius || y < FootRadius || x > Width - FootRadius || y > Height - FootRadius) return false;
            return !Obstacles.Any(r => x > (float)r["x"] - FootRadius && y > (float)r["y"] - FootRadius && x < (float)r["x"] + (float)r["width"] + FootRadius && y < (float)r["y"] + (float)r["height"] + FootRadius);
        }
        public bool Step(Vector2 from, Vector2 to) { return Walkable(to.x, to.y) && Walkable((from.x + to.x) / 2, (from.y + to.y) / 2); }
    }
    public sealed class LocalPrediction
    {
        private int round = -1;
        private long correction = -1;
        private double lastSentAt = double.NegativeInfinity;
        private Vector2 sent;
        private string sentFacing;
        public bool Active { get; private set; }
        public Vector2 Position { get; private set; }
        public string Facing { get; private set; } = "down";
        public bool Moving { get; private set; }
        public void Reset()
        {
            Active = Moving = false; round = -1; correction = -1;
            lastSentAt = double.NegativeInfinity; sent = Position = Vector2.zero; sentFacing = null; Facing = "down";
        }
        public void Update(NativeWorld world, TownRules rules, Vector2 direction, float deltaSeconds, double now, bool controls, Action<float, float, string> send)
        {
            if (world.Field == null || world.Phase != "day" && world.Phase != "night") { Active = Moving = false; round = -1; return; }
            var self = world.Field["self"]; var authoritative = new Vector2((float)self["x"], (float)self["y"]); var count = (long)self["correction"];
            if (!Active || world.Round != round || count != correction)
            { Position = authoritative; Facing = (string)self["facing"]; round = world.Round; correction = count; Active = true; sent = Position; sentFacing = Facing; }
            if (world.Paused || world.Phase == "night" && !((bool?)world.Developer?["nightMovement"] ?? false) || !controls)
            { Position = authoritative; Facing = (string)self["facing"]; Moving = false; return; }
            Moving = direction.sqrMagnitude > 0.001f;
            if (Moving)
            {
                var step = direction.normalized * rules.WalkSpeed * Mathf.Min(deltaSeconds, .1f);
                var next = new Vector2(Position.x + step.x, Position.y); if (rules.Step(Position, next)) Position = next;
                next = new Vector2(Position.x, Position.y + step.y); if (rules.Step(Position, next)) Position = next;
                Facing = Mathf.Abs(step.x) > Mathf.Abs(step.y) ? (step.x < 0 ? "left" : "right") : (step.y < 0 ? "up" : "down");
            }
            if ((sent != Position || sentFacing != Facing) && now - lastSentAt >= 66)
            { send((float)Math.Round(Position.x, 1), (float)Math.Round(Position.y, 1), Facing); sent = Position; sentFacing = Facing; lastSentAt = now; }
        }
    }
}
