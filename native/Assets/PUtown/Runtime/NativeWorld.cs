using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace PUtown.Runtime
{
    /// <summary>Only GameSession.ApplyFrame mutates this recipient's state.</summary>
    public sealed class NativeWorld
    {
        public string RoomId { get; private set; }
        public string SelfPlayerId { get; private set; }
        public string MapId { get; private set; }
        public string RoomPhase { get; private set; }
        public string HostPlayerId { get; private set; }
        public JObject RoleSetup { get; private set; }
        public IReadOnlyDictionary<string, JObject> Players { get { return players; } }
        public JObject Game { get; private set; }
        public JObject Field { get; private set; }
        public JObject Tasks { get; private set; }
        public JObject Developer { get; private set; }
        public JObject Inspector { get; private set; }
        public JObject Voice { get; private set; }
        public JArray VoicePeers { get; private set; } = new JArray();
        public JArray PracticeTargets { get; private set; } = new JArray();
        public IReadOnlyList<JObject> Chat { get { return chat; } }
        public IReadOnlyList<JObject> Sounds { get { return sounds; } }
        public double? PhaseEndsAt { get; private set; }
        public double? TaskEndsAt { get; private set; }
        public string Error { get; private set; }
        public long Revision { get; private set; }
        public long SnapshotSerial { get; private set; }
        private readonly Dictionary<string, JObject> players = new Dictionary<string, JObject>();
        private readonly List<JObject> chat = new List<JObject>();
        private readonly List<JObject> sounds = new List<JObject>();
        public string Phase { get { return (string)Game?["phase"]; } }
        public int Round { get { return (int?)Game?["round"] ?? 0; } }
        public JObject Self { get { return Game?["self"] as JObject; } }
        public bool Paused { get { return (bool?)Developer?["paused"] ?? false; } }

        public void Clear()
        {
            RoomId = SelfPlayerId = MapId = RoomPhase = HostPlayerId = Error = null;
            RoleSetup = Game = Field = Tasks = Developer = Inspector = Voice = null;
            VoicePeers = new JArray(); PracticeTargets = new JArray(); PhaseEndsAt = TaskEndsAt = null;
            players.Clear(); chat.Clear(); sounds.Clear(); ++Revision;
        }

        public void Apply(ProtocolEvent message, double arrivedAt)
        {
            var d = message.Data;
            switch (message.Type)
            {
                case "room_snapshot":
                    var sameRoom = RoomId == (string)d["roomId"];
                    if (!sameRoom) Clear();
                    RoomId = (string)d["roomId"]; SelfPlayerId = (string)d["selfPlayerId"]; ++SnapshotSerial;
                    // Follow-up authorized Game, Task and history messages replace their respective views.
                    Developer = Inspector = Voice = Tasks = Field = null; VoicePeers = new JArray(); TaskEndsAt = null; sounds.Clear();
                    ApplyRoom(d); break;
                case "room_state": ApplyRoom(d); break;
                case "player_joined": var p = (JObject)d["player"]; players[(string)p["playerId"]] = p; break;
                case "player_left": players.Remove((string)d["playerId"]); break;
                case "room_left": Clear(); break;
                case "game_state":
                    // Ordered transport generations reject stale sockets. An authorized Developer reset can lower the round.
                    Game = d; PhaseEndsAt = StrictProtocol.IsNull(d["remainingMs"]) ? (double?)null : arrivedAt + (double)d["remainingMs"];
                    if ((Phase != "day" && Phase != "night") || (int?)Field?["round"] != Round) Field = null;
                    break;
                case "field_state":
                    if ((Phase != "day" && Phase != "night") || (int)d["round"] != Round) return;
                    Field = d; break;
                case "task_state": Tasks = d; TaskEndsAt = StrictProtocol.IsNull(d["remainingMs"]) ? (double?)null : arrivedAt + (double)d["remainingMs"]; break;
                case "chat_history": chat.Clear(); chat.AddRange(((JArray)d["messages"]).Cast<JObject>()); break;
                case "chat_message": chat.Add(d); break;
                case "practice_state": PracticeTargets = (JArray)d["targets"]; break;
                case "developer_status": Developer = d; if ((string)d["controllerId"] != SelfPlayerId) Inspector = null; break;
                case "developer_state": if ((string)Developer?["controllerId"] != SelfPlayerId) return; Inspector = d; break;
                case "voice_state": Voice = StrictProtocol.IsNull(d["token"]) ? null : d; if (Voice == null) VoicePeers = new JArray(); break;
                case "voice_peers": VoicePeers = (JArray)d["peers"]; break;
                case "sound_event":
                    if (Phase != "day" || (int)d["round"] != Round) return;
                    sounds.Add(d); if (sounds.Count > 64) sounds.RemoveAt(0); break;
                case "error": Error = (string)d["message"]; break;
                default: return;
            }
            ++Revision;
        }
        private void ApplyRoom(JObject d)
        {
            RoomPhase = (string)d["phase"]; HostPlayerId = (string)d["hostPlayerId"]; MapId = (string)d["mapId"]; RoleSetup = (JObject)d["roleSetup"];
            players.Clear(); foreach (var t in (JArray)d["players"]) { var p = (JObject)t; players[(string)p["playerId"]] = p; }
            Error = null;
            if (RoomPhase == "lobby") { Game = Field = Tasks = null; PhaseEndsAt = TaskEndsAt = null; chat.Clear(); PracticeTargets.Clear(); }
        }
        public double Remaining(double now) { return Paused ? (double?)Game?["remainingMs"] ?? 0 : System.Math.Max(0, (PhaseEndsAt ?? now) - now); }
        public double TaskRemaining(double now) { return Paused ? (double?)Tasks?["remainingMs"] ?? 0 : System.Math.Max(0, (TaskEndsAt ?? now) - now); }
        public string Name(string id)
        {
            if (id == null) return "Skip";
            if (players.TryGetValue(id, out var p)) return (string)p["displayName"];
            var practice = PracticeTargets.FirstOrDefault(target => (string)target["targetId"] == id); if (practice != null) return (string)practice["displayName"];
            var roster = Game?["players"] as JArray; var entry = roster?.FirstOrDefault(t => (string)t["playerId"] == id);
            return (string)entry?["displayName"] ?? id;
        }
    }
}
