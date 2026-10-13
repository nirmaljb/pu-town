using System;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace PUtown.Runtime
{
    public sealed class CampusRules
    {
        public readonly JObject Data;
        public readonly float Units, ZSign, Width, Height, FootRadius, WalkSpeed;
        public JArray Obstacles { get { return (JArray)Data["obstacles"]; } }
        public JArray Interiors { get { return (JArray)Data["interiors"]; } }
        public JArray Seats { get { return (JArray)Data["meeting"]["seats"]; } }
        public CampusRules(string json)
        {
            Data = StrictProtocol.ParseObject(json);
            if (StrictProtocol.Integer(Data["schemaVersion"]) != 1 || (string)Data["mapId"] != "campus") throw new FormatException("Unsupported campus publication.");
            Units = (float)StrictProtocol.Number(Data["coordinates"]?["serverUnitsPerUnityUnit"]);
            ZSign = (float)StrictProtocol.Number(Data["coordinates"]?["unityZSign"]);
            Width = (float)StrictProtocol.Number(Data["width"]); Height = (float)StrictProtocol.Number(Data["height"]);
            FootRadius = (float)StrictProtocol.Number(Data["movement"]?["footRadius"]); WalkSpeed = (float)StrictProtocol.Number(Data["movement"]?["predictedSpeed"]);
            if (Units <= 0 || Mathf.Abs(ZSign) != 1 || Width <= 0 || Height <= 0 || FootRadius < 0 || WalkSpeed <= 0) throw new FormatException("Invalid campus coordinate or movement mapping.");
            StrictProtocol.Array(Data["obstacles"]); StrictProtocol.Array(Data["interiors"]);
            if (Seats.Count != 10 || Seats.Select(s => (int)s["seat"]).Distinct().Count() != 10) throw new FormatException("Campus needs ten distinct retained Seats.");
            foreach (var token in Obstacles.Concat(Interiors))
            {
                var r = StrictProtocol.Obj(token); StrictProtocol.Text(r["id"]); StrictProtocol.Number(r["x"]); StrictProtocol.Number(r["y"]);
                if (StrictProtocol.Number(r["width"]) <= 0 || StrictProtocol.Number(r["height"]) <= 0) throw new FormatException("Invalid campus rectangle.");
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
        public void Update(NativeWorld world, CampusRules rules, Vector2 direction, float deltaSeconds, double now, bool controls, Action<float, float, string> send)
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
