using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace PUtown.Runtime
{
    public sealed class ProtocolEvent
    {
        public readonly string Type;
        public readonly JObject Data;
        public ProtocolEvent(JObject data) { Type = (string)data["type"]; Data = data; }
    }

    /// <summary>Wire validation precedes enqueueing. DTO deserialization alone silently accepts extra fields.</summary>
    public static class StrictProtocol
    {
        public const int Version = 1;
        public static readonly string[] Roles = { "mafia", "villager", "doctor", "sheriff" };
        public static readonly string[] Phases = { "role_reveal", "day", "night", "discussion", "voting", "voting_result", "finished" };
        public static readonly string[] Facings = { "up", "left", "down", "right" };
        public static readonly string[] Settings = { "automatic", "factionVictory", "taskVictory", "taskRange", "taskDuration", "nightMovement" };
        private static readonly string[] Statuses = { "living", "eliminated", "left" };

        public static JObject ParseObject(string json, int maximumLength = 4194304)
        {
            JsonSyntax.Require(json, maximumLength);
            using (var reader = new JsonTextReader(new StringReader(json)))
            {
                reader.DateParseHandling = DateParseHandling.None;
                reader.MaxDepth = 64;
                return JObject.Load(reader, new JsonLoadSettings { DuplicatePropertyNameHandling = DuplicatePropertyNameHandling.Error });
            }
        }

        public static ProtocolEvent Decode(string json)
        {
            var d = ParseObject(json);
            if (Integer(d["version"], "version") != Version) throw new FormatException("Only protocol version 1 is supported.");
            var type = Text(d["type"], "type");
            switch (type)
            {
                case "pong": Fields(d, "version", "type"); break;
                case "room_snapshot":
                    Fields(d, "version", "type", "selfPlayerId", "roomId", "recoveryToken", "phase", "hostPlayerId", "roleSetup", "mapId", "players");
                    Text(d["selfPlayerId"], "selfPlayerId"); Text(d["roomId"], "roomId"); RecoveryToken(d["recoveryToken"]); Room(d); break;
                case "room_state":
                    Fields(d, "version", "type", "phase", "hostPlayerId", "roleSetup", "mapId", "players"); Room(d); break;
                case "player_joined": Fields(d, "version", "type", "player"); Player(Obj(d["player"])); break;
                case "player_left": Fields(d, "version", "type", "playerId", "reason"); Text(d["playerId"]); Member(d["reason"], "left", "disconnected", "expired"); break;
                case "room_left": Fields(d, "version", "type", "roomId"); Text(d["roomId"]); break;
                case "error": Fields(d, "version", "type", "code", "message"); Text(d["code"]); Text(d["message"]); break;
                case "game_state": Game(d); break;
                case "field_state":
                    Fields(d, "version", "type", "round", "players", "self"); Round(d["round"]);
                    Unique(Array(d["players"]), "playerId");
                    foreach (var token in Array(d["players"]))
                    {
                        var p = Obj(token); Fields(p, "playerId", "x", "y", "facing", "ghost"); Text(p["playerId"]); Position(p); Bool(p["ghost"]);
                    }
                    var own = Obj(d["self"]); Fields(own, "x", "y", "facing", "correction"); Position(own); Integer(own["correction"]); break;
                case "task_state": Tasks(d); break;
                case "chat_message": Fields(d, "version", "type", "channel", "round", "senderPlayerId", "senderName", "text"); Chat(d, false); break;
                case "chat_history": Fields(d, "version", "type", "messages"); foreach (var t in Array(d["messages"])) Chat(Obj(t), true); break;
                case "practice_state":
                    Fields(d, "version", "type", "targets"); Unique(Array(d["targets"]), "targetId");
                    foreach (var t in Array(d["targets"])) { var p = Obj(t); Fields(p, "targetId", "displayName", "role"); Text(p["targetId"]); Text(p["displayName"]); Member(p["role"], Roles); } break;
                case "voice_state":
                    Fields(d, "version", "type", "url", "token", "canPublish"); var publish = Bool(d["canPublish"]);
                    if (IsNull(d["url"]) && IsNull(d["token"]) && !publish) break;
                    Member(d["url"], "/voice"); Text(d["token"]); break;
                case "voice_peers":
                    Fields(d, "version", "type", "peers"); var peers = Array(d["peers"]); if (peers.Count > 9) Bad("Too many voice peers."); Unique(peers, "playerId");
                    foreach (var t in peers) { var p = Obj(t); Fields(p, "playerId", "token", "gain"); Text(p["playerId"]); Text(p["token"]); Gain(p["gain"]); } break;
                case "sound_event":
                    Fields(d, "version", "type", "eventId", "round", "kind", "playerId", "gain"); Round(d["eventId"]); Round(d["round"]); Member(d["kind"], "footstep", "enter", "exit"); Text(d["playerId"]); Gain(d["gain"]); break;
                case "developer_status":
                    Fields(d, "version", "type", "controllerId", "paused", "nightMovement", "taskRange", "scenario", "revision", "simulatedPlayerIds");
                    OptionalText(d["controllerId"]); Bool(d["paused"]); Bool(d["nightMovement"]); Bool(d["taskRange"]); Text(d["scenario"]); Integer(d["revision"]);
                    foreach (var t in Array(d["simulatedPlayerIds"])) Text(t); break;
                case "developer_state": Developer(d); break;
                default: Bad("Unknown server message type: " + type); break;
            }
            return new ProtocolEvent(d);
        }

        private static void Room(JObject d)
        {
            Member(d["phase"], "lobby", "playing"); Text(d["hostPlayerId"]);
            // Legacy map IDs are decoded only while the migration retains its browser boundary.
            Member(d["mapId"], "woodland", "market", "village", "horror", "cyberpunk");
            var setup = Obj(d["roleSetup"]); Fields(setup, "mafia", "doctors", "sheriffs");
            Round(setup["mafia"]); Round(setup["doctors"]); Round(setup["sheriffs"]);
            var players = Array(d["players"]); if (players.Count > 10) Bad("Room capacity exceeded."); Unique(players, "playerId"); Unique(players, "seat");
            foreach (var p in players) Player(Obj(p));
        }
        private static void Player(JObject p)
        {
            Fields(p, "playerId", "displayName", "colour", "avatarPreset", "seat", "ready", "connected", "x", "y", "facing"); Identity(p); Bool(p["ready"]); Bool(p["connected"]); Position(p);
        }
        private static void Identity(JObject p)
        {
            Text(p["playerId"]); Text(p["displayName"]); var colour = Text(p["colour"]);
            if (!Regex.IsMatch(colour, "^#[0-9A-F]{6}$")) Bad("Invalid Player Colour.");
            var preset = Text(p["avatarPreset"]); if (!Regex.IsMatch(preset, "^[a-z0-9][a-z0-9-]{0,63}$")) Bad("Invalid Avatar Preset.");
            if (Integer(p["seat"]) >= 10) Bad("Invalid Seat.");
        }
        private static void Game(JObject d)
        {
            Fields(d, "version", "type", "mode", "phase", "round", "remainingMs", "players", "outcome", "ballots", "winner", "roles", "self");
            Member(d["mode"], "competitive", "practice"); var phase = Member(d["phase"], Phases); var round = Integer(d["round"]);
            if (phase == "role_reveal" && round != 0 || phase != "role_reveal" && phase != "finished" && round == 0) Bad("Invalid phase round."); OptionalInteger(d["remainingMs"]);
            var players = Array(d["players"]); Unique(players, "playerId"); Unique(players, "seat"); if (players.Count > 10) Bad("Game capacity exceeded.");
            foreach (var t in players) { var p = Obj(t); Fields(p, "playerId", "displayName", "colour", "avatarPreset", "seat", "status"); Identity(p); Member(p["status"], Statuses); }
            if (!IsNull(d["outcome"]))
            {
                var o = Obj(d["outcome"]); Fields(o, "kind", "callerPlayerId", "bodyPlayerId", "deaths", "eliminatedPlayerId", "eliminatedRole");
                Member(o["kind"], "night", "meeting"); if (!IsNull(o["callerPlayerId"]) || !IsNull(o["bodyPlayerId"])) Bad("Retired Meeting caller or Body.");
                foreach (var t in Array(o["deaths"])) Text(t); OptionalText(o["eliminatedPlayerId"]); if (!IsNull(o["eliminatedRole"])) Member(o["eliminatedRole"], Roles);
            }
            if (!IsNull(d["ballots"])) foreach (var t in Array(d["ballots"])) { var b = Obj(t); Fields(b, "voterPlayerId", "targetPlayerId"); Text(b["voterPlayerId"]); OptionalText(b["targetPlayerId"]); }
            if (!IsNull(d["winner"])) Member(d["winner"], "mafia", "village");
            if (!IsNull(d["roles"])) foreach (var t in Array(d["roles"])) { var r = Obj(t); Fields(r, "playerId", "role"); Text(r["playerId"]); Member(r["role"], Roles); }
            var self = Obj(d["self"]); Fields(self, "role", "faction", "status", "killedByMafia", "mafiaTeam", "investigations", "meetingVoted", "meetingVote", "nightChoice");
            var role = Member(self["role"], Roles); var faction = Member(self["faction"], "mafia", "village"); Member(self["status"], Statuses);
            if ((role == "mafia") != (faction == "mafia")) Bad("Role and Faction disagree.");
            Bool(self["killedByMafia"]); Bool(self["meetingVoted"]); OptionalText(self["meetingVote"]); OptionalText(self["nightChoice"]);
            if (role != "mafia" && !IsNull(self["mafiaTeam"])) Bad("Unauthorized Mafia team.");
            if (role == "mafia" && IsNull(self["mafiaTeam"])) Bad("Missing Mafia team.");
            if (!IsNull(self["mafiaTeam"])) foreach (var t in Array(self["mafiaTeam"])) Text(t);
            if (role != "sheriff" && !IsNull(self["investigations"])) Bad("Unauthorized investigations.");
            if (role == "sheriff" && IsNull(self["investigations"])) Bad("Missing Sheriff investigations.");
            if (!IsNull(self["investigations"])) foreach (var t in Array(self["investigations"])) { var i = Obj(t); Fields(i, "round", "targetPlayerId", "mafia"); Round(i["round"]); Text(i["targetPlayerId"]); Bool(i["mafia"]); }
            if (phase != "finished" && (!IsNull(d["winner"]) || !IsNull(d["roles"]))) Bad("Premature final disclosure.");
            if (phase != "voting_result" && phase != "finished" && !IsNull(d["ballots"])) Bad("Premature ballots.");
        }
        private static void Tasks(JObject d)
        {
            Fields(d, "version", "type", "tasks", "completed", "total", "activeTaskId", "remainingMs");
            if (Integer(d["completed"]) > Integer(d["total"])) Bad("Task progress exceeds total."); var tasks = Array(d["tasks"]); Unique(tasks, "taskId");
            foreach (var t in tasks)
            {
                var task = Obj(t); Fields(task, "taskId", "name", "kind", "x", "y", "step", "steps", "fake", "sequence"); Text(task["taskId"]); Text(task["name"]);
                Member(task["kind"], "repair", "sequence", "delivery"); Number(task["x"]); Number(task["y"]); var steps = Round(task["steps"]); if (Integer(task["step"]) > steps) Bad("Invalid Task step."); Bool(task["fake"]);
                foreach (var v in Array(task["sequence"])) Integer(v);
            }
            var active = OptionalText(d["activeTaskId"]); var remaining = OptionalInteger(d["remainingMs"]);
            if ((active == null) != (remaining == null) || active != null && !tasks.Any(t => (string)t["taskId"] == active && (long)t["step"] < (long)t["steps"])) Bad("Invalid active Task.");
        }
        private static void Chat(JObject d, bool nested)
        {
            if (nested) Fields(d, "channel", "round", "senderPlayerId", "senderName", "text"); Member(d["channel"], "public"); Round(d["round"]); Text(d["senderPlayerId"]); Text(d["senderName"]); Text(d["text"]);
        }
        private static void Developer(JObject d)
        {
            Fields(d, "version", "type", "settings", "players", "locations"); var settings = Obj(d["settings"]); Fields(settings, Settings); foreach (var s in Settings) Bool(settings[s]);
            var locations = Array(d["locations"]); foreach (var t in locations) { var l = Obj(t); Fields(l, "name", "x", "y"); Text(l["name"]); Number(l["x"]); Number(l["y"]); }
            var players = Array(d["players"]); Unique(players, "playerId"); if (players.Count > 10) Bad("Invalid Developer Players.");
            foreach (var t in players)
            {
                var p = Obj(t); Fields(p, "playerId", "displayName", "role", "status", "simulated", "x", "y", "nightChoice", "voted", "vote", "tasks"); Text(p["playerId"]); Text(p["displayName"]); Member(p["role"], Roles); Member(p["status"], Statuses); Bool(p["simulated"]); Number(p["x"]); Number(p["y"]); OptionalText(p["nightChoice"]); Bool(p["voted"]); OptionalText(p["vote"]);
                var tasks = Array(p["tasks"]); Unique(tasks, "taskId");
                foreach (var taskToken in tasks)
                {
                    var task = Obj(taskToken); Fields(task, "playerId", "taskId", "location", "kind", "steps", "durationMs", "step", "fake", "currentLocation");
                    if (Text(task["playerId"]) != (string)p["playerId"]) Bad("Invalid Task owner."); Text(task["taskId"]); Member(task["kind"], "repair", "sequence", "delivery"); Bool(task["fake"]);
                    var steps = Round(task["steps"]); if (steps > 100 || Integer(task["step"]) > steps || Integer(task["durationMs"]) > 3600000 || Integer(task["location"]) >= locations.Count || Integer(task["currentLocation"]) >= locations.Count) Bad("Invalid Developer Task.");
                }
            }
        }
        private static void Position(JObject p) { Number(p["x"]); Number(p["y"]); Member(p["facing"], Facings); }
        private static void Gain(JToken t) { var gain = Number(t); if (gain <= 0 || gain > 1) Bad("Invalid authorized gain."); }
        public static JObject Command(string type, params object[] pairs)
        {
            var result = new JObject { ["version"] = Version, ["type"] = type };
            if (pairs.Length % 2 != 0) throw new ArgumentException("Command fields require pairs.");
            for (var i = 0; i < pairs.Length; i += 2) result[(string)pairs[i]] = pairs[i + 1] == null ? JValue.CreateNull() : JToken.FromObject(pairs[i + 1]);
            return result;
        }
        public static string DisplayName(string value)
        {
            value = (value ?? "").Trim(); var count = CodePointCount(value);
            if (count < 1 || count > 24) throw new FormatException("Display Name must be 1–24 characters."); return value;
        }
        public static int CodePointCount(string value)
        {
            var count = 0;
            for (var i = 0; i < value.Length; ++i) { ++count; if (char.IsHighSurrogate(value[i]) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1])) ++i; }
            return count;
        }
        public static string RecoveryToken(JToken t) { var token = Text(t); if (!Regex.IsMatch(token, "^[a-f0-9]{64}$")) Bad("Invalid recovery credential."); return token; }
        public static bool IsNull(JToken t) { return t != null && t.Type == JTokenType.Null; }
        public static JObject Obj(JToken t) { if (!(t is JObject d)) throw new FormatException("Expected an object."); return d; }
        public static JArray Array(JToken t) { if (!(t is JArray d)) throw new FormatException("Expected an array."); return d; }
        public static void Fields(JObject d, params string[] expected)
        {
            if (d.Count != expected.Length || expected.Any(name => d.Property(name, StringComparison.Ordinal) == null)) Bad("Fields do not match the message type.");
        }
        public static string Text(JToken t, string name = "text") { if (t == null || t.Type != JTokenType.String || string.IsNullOrWhiteSpace((string)t)) throw new FormatException(name + " must be nonempty text."); return (string)t; }
        public static string OptionalText(JToken t) { return IsNull(t) ? null : Text(t); }
        public static bool Bool(JToken t) { if (t == null || t.Type != JTokenType.Boolean) throw new FormatException("Expected a boolean."); return (bool)t; }
        public static double Number(JToken t)
        {
            if (t == null || (t.Type != JTokenType.Integer && t.Type != JTokenType.Float)) throw new FormatException("Expected a number."); var n = (double)t; if (double.IsNaN(n) || double.IsInfinity(n)) Bad("Expected a finite number."); return n;
        }
        public static long Integer(JToken t, string name = "counter") { var n = Number(t); if (n < 0 || n > 9007199254740991d || Math.Floor(n) != n) throw new FormatException("Invalid " + name + "."); return (long)n; }
        public static long Round(JToken t) { var n = Integer(t); if (n < 1) Bad("Expected a positive round or count."); return n; }
        public static long? OptionalInteger(JToken t) { return IsNull(t) ? (long?)null : Integer(t); }
        public static string Member(JToken t, params string[] values) { var s = Text(t); if (!values.Contains(s)) Bad("Unknown value: " + s); return s; }
        private static void Unique(JArray a, string field) { var set = new HashSet<string>(); foreach (var t in a) if (!set.Add(Obj(t)[field]?.ToString(Formatting.None) ?? "")) Bad("Duplicate " + field + "."); }
        private static void Bad(string message) { throw new FormatException(message); }
    }
}
