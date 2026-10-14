using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace PUtown.Runtime
{
    public sealed class NativeOverlay : IDisposable
    {
        private readonly GameObject owner;
        private readonly PanelSettings settings;
        private readonly GameSession session;
        private TownRules rules;
        private readonly VisualElement root, entry, reconnect, sidebar, content;
        private readonly Label phase, countdown, status, error, assetStatus, taskTimer;
        private readonly TextField name, code, chatInput;
        private readonly ScrollView chatLog;
        private readonly Button sendChat;
        private readonly List<Action> perFrame = new List<Action>();
        private readonly NativeAvatarCollection collection;
        private readonly Func<INativeVoiceControls> voice;
        private readonly VisualElement settingsPanel;
        private Label microphoneStatus;
        private bool settingsOpen;
        private string signature = "", previousPhase;
        private string contentSignature = "", signatureCollectionId, signaturePreviewTarget;
        private long signatureRevision = -1;
        private bool signaturePreviewChosen;
        private int previousRound = -1, chatCount = -1;
        private string previewTarget;
        private bool previewChosen;
        private double now;
        private Color Ink { get { return new Color(.09f, .18f, .16f); } }
        private Color Paper { get { return new Color(.93f, .95f, .92f, .97f); } }
        public bool Typing
        {
            get
            {
                if (settingsOpen) return true;
                var focused = root.panel?.focusController?.focusedElement as VisualElement;
                while (focused != null) { if (focused is TextField || focused is IntegerField) return true; focused = focused.parent; }
                return false;
            }
        }
        public bool PointerOverInterface
        {
            get
            {
                if (root.panel == null) return false;
                var position = RuntimePanelUtils.ScreenToPanel(root.panel, new Vector2(Input.mousePosition.x, Screen.height - Input.mousePosition.y));
                var picked = root.panel.Pick(position); return picked != null && picked != root;
            }
        }
        public NativeOverlay(GameSession session, TownRules rules, NativeAvatarCollection collection, Font font, Action retryAssets = null, Func<INativeVoiceControls> voice = null)
        {
            this.session = session; this.rules = rules; this.collection = collection; this.voice = voice;
            owner = new GameObject("Native interface"); var document = owner.AddComponent<UIDocument>(); settings = ScriptableObject.CreateInstance<PanelSettings>();
            settings.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Interface/NativeTheme");
            settings.scaleMode = PanelScaleMode.ScaleWithScreenSize; settings.referenceResolution = new Vector2Int(1920, 1080); settings.match = .5f; document.panelSettings = settings;
            root = document.rootVisualElement; root.style.flexGrow = 1; root.style.fontSize = 20; root.style.color = Ink; if (font != null) root.style.unityFont = font; root.pickingMode = PickingMode.Ignore;
            var bar = new VisualElement(); bar.style.position = Position.Absolute; bar.style.left = 24; bar.style.top = 24; bar.style.flexDirection = FlexDirection.Row; bar.style.alignItems = Align.Center; bar.style.backgroundColor = Paper; Pad(bar, 16); root.Add(bar);
            phase = Label("PU Town", 30); countdown = Label("", 30); countdown.style.marginLeft = 24; bar.Add(phase); bar.Add(countdown);
            status = Label("", 16); status.style.position = Position.Absolute; status.style.left = 24; status.style.bottom = 20; status.style.backgroundColor = Paper; Pad(status, 12); root.Add(status);
            sidebar = new VisualElement(); sidebar.style.position = Position.Absolute; sidebar.style.right = 24; sidebar.style.top = 24; sidebar.style.bottom = 24; sidebar.style.width = 360; sidebar.style.backgroundColor = Paper; Pad(sidebar, 18); root.Add(sidebar);
            var scroll = new ScrollView(); scroll.style.flexGrow = 1; scroll.style.flexBasis = 0; scroll.style.minHeight = 0;
            scroll.contentContainer.style.flexGrow = 0; scroll.contentContainer.style.flexShrink = 0;
            sidebar.Add(scroll); content = new VisualElement(); content.style.flexShrink = 0; scroll.Add(content);
            error = Label("", 17); error.style.color = new Color(.67f, .12f, .07f); error.style.whiteSpace = WhiteSpace.Normal; sidebar.Add(error);
            assetStatus = Label("", 18); assetStatus.style.whiteSpace = WhiteSpace.Normal; sidebar.Add(assetStatus);
            taskTimer = Label("", 18); sidebar.Add(taskTimer);
            chatLog = new ScrollView(); chatLog.style.maxHeight = 180; chatLog.style.minHeight = 90; chatLog.style.flexShrink = 0; chatLog.style.marginTop = 14; sidebar.Add(chatLog);
            chatInput = new TextField { multiline = false }; chatInput.style.fontSize = 18; chatInput.style.flexShrink = 0; chatInput.style.marginTop = 8; chatInput.RegisterCallback<KeyDownEvent>(evt => { if (evt.keyCode == KeyCode.Return || evt.keyCode == KeyCode.KeypadEnter) { Chat(); evt.StopPropagation(); } }); sidebar.Add(chatInput);
            sendChat = Button("Send chat", Chat); sidebar.Add(sendChat);
            if (retryAssets != null) sidebar.Add(Button("Retry Avatar load", retryAssets));
            sidebar.Add(Button("Settings", () => ShowSettings(true)));
            sidebar.Add(Button("Leave Room", session.Leave));
            entry = new VisualElement(); entry.style.position = Position.Absolute; entry.style.left = 0; entry.style.right = 0; entry.style.top = 0; entry.style.bottom = 0; entry.style.alignItems = Align.Center; entry.style.justifyContent = Justify.Center; root.Add(entry);
            var entryPaper = new VisualElement { name = "entry-paper" }; entryPaper.style.width = 470; entryPaper.style.backgroundColor = Paper; Pad(entryPaper, 30); entry.Add(entryPaper);
            entryPaper.Add(Label("PU Town", 52)); entryPaper.Add(Label("Gather in Woodland Village or Market Town.", 21));
            name = new TextField("Display Name"); name.style.marginTop = 24; name.style.fontSize = 21; name.value = PlayerPrefs.GetString("DisplayName", session.DisplayName); entryPaper.Add(name);
            code = new TextField("Room Code"); code.style.marginTop = 12; code.style.fontSize = 21; entryPaper.Add(code);
            var entryButtons = Row(); entryButtons.style.marginTop = 18;
            var create = Button("Create Room", () => Safe(() => { RememberName(); session.Create(name.value); })); create.style.flexGrow = 1; entryButtons.Add(create);
            var join = Button("Join Room", () => Safe(() => { RememberName(); session.Join(code.value, name.value); })); join.style.flexGrow = 1; entryButtons.Add(join); entryPaper.Add(entryButtons);
            var setup = new Foldout { text = "Connection", value = false }; setup.style.marginTop = 15; setup.Add(Label(session.Endpoint, 15)); setup.Add(Label("Configure the Game server with -server ws://host:8080/ws/game when launching.", 15)); entryPaper.Add(setup);
            reconnect = new VisualElement(); reconnect.style.position = Position.Absolute; reconnect.style.left = 0; reconnect.style.right = 0; reconnect.style.top = 0; reconnect.style.bottom = 0; reconnect.style.alignItems = Align.Center; reconnect.style.justifyContent = Justify.Center; reconnect.style.backgroundColor = new Color(.06f, .12f, .10f, .65f); root.Add(reconnect);
            var recoveryPaper = new VisualElement(); recoveryPaper.style.width = 470; recoveryPaper.style.backgroundColor = Paper; Pad(recoveryPaper, 28); reconnect.Add(recoveryPaper);
            var recoveryLabel = Label("", 24); recoveryLabel.name = "recovery-label"; recoveryPaper.Add(recoveryLabel); recoveryPaper.Add(Button("Return to entry", session.Leave));
            var entryError = Label("", 18); entryError.name = "entry-error"; entryError.style.color = new Color(.67f, .12f, .07f); entryError.style.whiteSpace = WhiteSpace.Normal; entryPaper.Add(entryError);
            entryPaper.Add(Button("Settings", () => ShowSettings(true)));
            settingsPanel = new VisualElement(); settingsPanel.style.position = Position.Absolute; settingsPanel.style.left = 0; settingsPanel.style.right = 0; settingsPanel.style.top = 0; settingsPanel.style.bottom = 0; settingsPanel.style.alignItems = Align.Center; settingsPanel.style.justifyContent = Justify.Center; settingsPanel.style.backgroundColor = new Color(.06f, .12f, .10f, .65f); root.Add(settingsPanel);
            BuildSettings(); ShowSettings(false);
        }
        public void SetRules(TownRules value) { rules = value; signature = ""; signatureRevision = -1; }
        public void EnableDeveloperEntry()
        {
            var paper = root.Q<VisualElement>("entry-paper");
            paper.Add(Button("Create Developer Room", () => Safe(() => { RememberName(); session.Create(name.value, true); })));
            var handoff = new Foldout { text = "Take a simulated Player", value = false }; var id = new TextField("Player ID"); handoff.Add(id); handoff.Add(Button("Take control", () => Safe(() => session.TakeDeveloperPlayer(code.value, id.value)))); paper.Add(handoff);
        }
        private void RememberName() { PlayerPrefs.SetString("DisplayName", StrictProtocol.DisplayName(name.value)); }
        private void Safe(Action action) { try { action(); root.Q<Label>("entry-error").text = ""; } catch (FormatException e) { root.Q<Label>("entry-error").text = e.Message; } }
        public void Render(double time, string assetsError)
        {
            now = time; var world = session.World;
            entry.style.display = session.Status == SessionStatus.Entry ? DisplayStyle.Flex : DisplayStyle.None;
            sidebar.style.display = world.RoomId != null ? DisplayStyle.Flex : DisplayStyle.None;
            reconnect.style.display = session.Status == SessionStatus.Connecting || session.Status == SessionStatus.Recovering || session.Status == SessionStatus.Failed || session.Status == SessionStatus.Leaving ? DisplayStyle.Flex : DisplayStyle.None;
            root.Q<Label>("entry-error").text = session.Error ?? root.Q<Label>("entry-error").text;
            var recoveryLabel = root.Q<Label>("recovery-label"); recoveryLabel.text = session.Status == SessionStatus.Connecting ? "Connecting to the Room…" : session.Status == SessionStatus.Leaving ? "Leaving the Room…" : session.Status == SessionStatus.Failed ? session.Error : "Reconnecting to Room " + session.RoomId + "… Your Membership is reserved by the server.";
            phase.text = world.Game == null ? world.RoomId == null ? "PU Town" : "Lobby · " + world.RoomId : PhaseName(world.Phase);
            countdown.text = world.PhaseEndsAt.HasValue ? TimeText(world.Remaining(now)) : world.Game != null && (string)world.Game["mode"] == "practice" ? "Practice" : "";
            status.text = world.RoomId == null ? "WASD to walk · Scroll to zoom" : "Room " + world.RoomId + "   " + world.Players.Count + "/10 Players" + (world.Paused ? "   Paused" : "");
            error.text = session.Error ?? world.Error ?? ""; assetStatus.text = assetsError ?? (world.RoomId != null && !session.AssetsReady ? "Loading the Room's published Avatars…" : "");
            taskTimer.text = world.Tasks?["activeTaskId"]?.Type == JTokenType.String ? world.TaskRemaining(now) > 0 ? "Working… " + TimeText(world.TaskRemaining(now)) : "Ready — finish this step" : "";
            error.style.display = string.IsNullOrEmpty(error.text) ? DisplayStyle.None : DisplayStyle.Flex;
            assetStatus.style.display = string.IsNullOrEmpty(assetStatus.text) ? DisplayStyle.None : DisplayStyle.Flex;
            taskTimer.style.display = string.IsNullOrEmpty(taskTimer.text) ? DisplayStyle.None : DisplayStyle.Flex;
            if (world.Phase != previousPhase || world.Round != previousRound) { previousPhase = world.Phase; previousRound = world.Round; previewTarget = null; previewChosen = false; }
            if (previewTarget != null && !Living(world).Any(p => (string)p["playerId"] == previewTarget) && !world.PracticeTargets.Any(p => (string)p["targetId"] == previewTarget)) { previewTarget = null; previewChosen = false; }
            if (signatureRevision != world.Revision || signatureCollectionId != collection.CollectionId
                    || signaturePreviewChosen != previewChosen || signaturePreviewTarget != previewTarget)
            {
                signatureRevision = world.Revision; signatureCollectionId = collection.CollectionId;
                signaturePreviewChosen = previewChosen; signaturePreviewTarget = previewTarget;
                contentSignature = new JArray(world.RoomPhase, world.MapId, world.Game, world.Tasks, world.RoleSetup, new JArray(world.Players.Values),
                    collection.CollectionId, world.Developer, world.Inspector, world.PracticeTargets, previewChosen, previewTarget).ToString(Formatting.None);
            }
            var focused = root.panel?.focusController?.focusedElement as VisualElement;
            if (signature != contentSignature && !(Typing && focused != null && content.Contains(focused))) { signature = contentSignature; BuildContent(world); }
            foreach (var action in perFrame) action();
            var canSpeak = session.CanControl && (world.Phase == "day" || world.Phase == "discussion" || world.Phase == "voting") && (string)world.Self?["status"] == "living";
            chatInput.SetEnabled(canSpeak); sendChat.SetEnabled(canSpeak);
            chatLog.style.display = world.Game != null ? DisplayStyle.Flex : DisplayStyle.None; chatInput.style.display = chatLog.style.display; sendChat.style.display = chatLog.style.display;
            if (chatCount != world.Chat.Count)
            {
                chatCount = world.Chat.Count; chatLog.Clear(); foreach (var message in world.Chat.Skip(Math.Max(0, world.Chat.Count - 100))) chatLog.Add(Label((string)message["senderName"] + ": " + (string)message["text"], 17));
                chatLog.schedule.Execute(() => chatLog.scrollOffset = new Vector2(0, float.MaxValue));
            }
        }
        private void BuildContent(NativeWorld world)
        {
            content.Clear(); perFrame.Clear();
            if (world.RoomPhase == "lobby") Lobby(world); else if (world.Game != null) Game(world);
            if (world.Developer != null) Developer(world);
            if (world.RoomId != null) Voice(world);
        }
        private void Lobby(NativeWorld world)
        {
            content.Add(Label("Waiting at the Townhall", 26));
            content.Add(Label(NativeTownMaps.Name(world.MapId), 21));
            if (world.HostPlayerId == world.SelfPlayerId)
            {
                content.Add(Label("Town Map", 18));
                var maps = new DropdownField(NativeTownMaps.Ids.Select(NativeTownMaps.Name).ToList(), NativeTownMaps.Ids.ToList().IndexOf(world.MapId));
                maps.RegisterValueChangedCallback(evt => session.Control("select_map", "mapId", NativeTownMaps.Ids[maps.index]));
                content.Add(maps); perFrame.Add(() => maps.SetEnabled(session.CanControl));
            }
            content.Add(Button("Copy Room Code", () => GUIUtility.systemCopyBuffer = world.RoomId));
            foreach (var player in world.Players.Values.OrderBy(p => (int)p["seat"]))
            {
                var row = Label((int)player["seat"] + 1 + ". " + (string)player["displayName"] + ((string)player["playerId"] == world.HostPlayerId ? " (Host)" : "") + "\n" + ((bool)player["connected"] ? (bool)player["ready"] ? "Ready" : "Not Ready" : "Disconnected"), 19); row.style.marginTop = 9;
                ColorUtility.TryParseHtmlString((string)player["colour"], out var colour); row.style.borderLeftColor = colour; row.style.borderLeftWidth = 5; row.style.paddingLeft = 9; row.tooltip = "Player ID: " + (string)player["playerId"]; content.Add(row);
            }
            if (world.Players.TryGetValue(world.SelfPlayerId ?? "", out var self))
            {
                var ready = Button((bool)self["ready"] ? "Withdraw Ready" : "Mark Ready", () => session.Control("set_ready", "ready", !(bool)self["ready"])); ready.style.marginTop = 18; content.Add(ready); perFrame.Add(() => ready.SetEnabled(session.CanControl));
            }
            var chooser = new Foldout { text = "Choose your Avatar", value = true }; chooser.style.marginTop = 15;
            foreach (var preset in collection.Presets.Values) { var id = preset.Id; chooser.Add(Button(preset.Name, () => session.Control("select_avatar", "avatarPreset", id))); } content.Add(chooser);
            var setup = world.RoleSetup;
            content.Add(Label("Role Setup: " + (string)setup?["mafia"] + " Mafia, " + (string)setup?["doctors"] + " Doctor(s), " + (string)setup?["sheriffs"] + " Sheriff(s)", 17));
            if (world.HostPlayerId == world.SelfPlayerId)
            {
                var deal = new Foldout { text = "Configure Roles", value = false }; var mafia = new IntegerField("Mafia") { value = (int)setup["mafia"] }; var doctors = new IntegerField("Doctors") { value = (int)setup["doctors"] }; var sheriffs = new IntegerField("Sheriffs") { value = (int)setup["sheriffs"] };
                deal.Add(mafia); deal.Add(doctors); deal.Add(sheriffs); deal.Add(Button("Apply Role Setup", () => session.Control("set_role_setup", "mafia", mafia.value, "doctors", doctors.value, "sheriffs", sheriffs.value))); content.Add(deal);
                var start = Button("Start Game", () => session.Control("start_game")); content.Add(start); perFrame.Add(() => start.SetEnabled(session.CanControl));
                if (world.Players.Count == 1) content.Add(Button("Start Solo Practice", () => session.Control("start_practice")));
            }
        }
        private void Game(NativeWorld world)
        {
            var self = world.Self; var living = (string)self["status"] == "living"; var role = (string)self["role"];
            content.Add(Label(role.Substring(0, 1).ToUpperInvariant() + role.Substring(1) + ((string)self["status"] == "eliminated" ? " · Ghost" : ""), 30));
            content.Add(Label(RoleHelp(role), 18));
            if (self["mafiaTeam"] is JArray team) content.Add(Label("Mafia team: " + string.Join(", ", team.Select(t => world.Name((string)t))), 17));
            if (self["investigations"] is JArray results) foreach (var result in results) content.Add(Label("Round " + result["round"] + ": " + world.Name((string)result["targetPlayerId"]) + " is " + ((bool)result["mafia"] ? "Mafia" : "Village"), 17));
            if (world.Phase == "day")
            {
                if (rules.TasksEnabled) Tasks(world);
                else content.Add(Label("Explore the town and talk with nearby Players. Tasks are disabled for now.", 18));
            }
            else if (world.Phase == "night")
            {
                content.Add(Label("Sleep where you stood. Conversation is closed.", 18));
                if (living && role != "villager")
                {
                    content.Add(Label(role == "mafia" ? "Choose a victim" : role == "doctor" ? "Choose protection" : "Choose an investigation", 22));
                    if (role == "doctor" && (string)world.Game["mode"] == "practice")
                    {
                        var selfId = world.SelfPlayerId;
                        var protect = Button(((string)self["nightChoice"] == selfId ? "Selected: " : "") + "Protect yourself", () => session.Control("night_choice", "round", world.Round, "targetPlayerId", selfId));
                        content.Add(protect); perFrame.Add(() => protect.SetEnabled(session.CanControl));
                    }
                    foreach (var player in (string)world.Game["mode"] == "practice" ? Enumerable.Empty<JObject>() : Living(world))
                    {
                        var id = (string)player["playerId"]; if (role == "sheriff" && id == world.SelfPlayerId || role == "mafia" && ((JArray)self["mafiaTeam"]).Any(t => (string)t == id)) continue;
                        var button = Button(((string)self["nightChoice"] == id ? "Selected: " : "") + world.Name(id), () => session.Control("night_choice", "round", world.Round, "targetPlayerId", id)); content.Add(button); perFrame.Add(() => button.SetEnabled(session.CanControl));
                    }
                    content.Add(Button("Withdraw choice", () => session.Control("night_choice", "round", world.Round, "targetPlayerId", null)));
                    content.Add(Label("You can change this choice until Night ends.", 16));
                }
            }
            else if (world.Phase == "discussion") content.Add(Label(living ? "Discuss what happened at Night with the Townhall." : "You may listen to the Townhall.", 20));
            else if (world.Phase == "voting")
            {
                if ((bool)self["meetingVoted"]) content.Add(Label("Ballot locked: " + world.Name((string)self["meetingVote"]), 22));
                else if (living)
                {
                    content.Add(Label("Preview your ballot, then Confirm.", 20));
                    foreach (var player in (string)world.Game["mode"] == "practice" ? Enumerable.Empty<JObject>() : Living(world)) { var id = (string)player["playerId"]; content.Add(Button((previewChosen && previewTarget == id ? "Selected: " : "") + world.Name(id), () => { previewChosen = true; previewTarget = id; signature = ""; })); }
                    content.Add(Button(previewChosen && previewTarget == null ? "Selected: Skip" : "Skip", () => { previewChosen = true; previewTarget = null; signature = ""; }));
                    var confirm = Button("Confirm ballot", () => session.Control("meeting_vote", "round", world.Round, "targetPlayerId", previewTarget)); content.Add(confirm); perFrame.Add(() => confirm.SetEnabled(previewChosen && session.CanControl));
                }
                else content.Add(Label("You may read the Townhall. Eliminated Participants cannot vote.", 18));
            }
            if ((string)world.Game["mode"] == "practice" && (world.Phase == "night" || world.Phase == "voting")) PracticeTargets(world);
            if (world.Game["outcome"] is JObject outcome)
            {
                if ((string)outcome["kind"] == "night") content.Add(Label(((JArray)outcome["deaths"]).Count == 0 ? "Everyone survived Night." : "Night deaths: " + string.Join(", ", ((JArray)outcome["deaths"]).Select(t => world.Name((string)t))), 18));
                else content.Add(Label(outcome["eliminatedPlayerId"].Type == JTokenType.Null ? "No Participant was eliminated." : world.Name((string)outcome["eliminatedPlayerId"]) + " was eliminated as " + (string)outcome["eliminatedRole"] + ".", 18));
            }
            if (world.Game["ballots"] is JArray ballots) foreach (var ballot in ballots) content.Add(Label(world.Name((string)ballot["voterPlayerId"]) + " voted " + world.Name((string)ballot["targetPlayerId"]), 17));
            if (world.Phase == "finished")
            {
                content.Add(Label((string)world.Game["winner"] == "mafia" ? "Mafia wins" : "Village wins", 34));
                if (world.Game["roles"] is JArray roles) foreach (var r in roles) content.Add(Label(world.Name((string)r["playerId"]) + ": " + (string)r["role"], 19));
            }
            if ((string)world.Game["mode"] == "practice")
            {
                var practice = new Foldout { text = "Solo Practice", value = true };
                foreach (var r in StrictProtocol.Roles) { var selected = r; practice.Add(Button("Preview " + r, () => session.Control("preview_role", "role", selected))); }
                practice.Add(Button("Advance phase", () => session.Control("advance_practice", "round", world.Round, "phase", world.Phase))); content.Add(practice);
            }
        }
        private void Tasks(NativeWorld world)
        {
            if (world.Tasks == null) return;
            content.Add(Label("Village Tasks: " + world.Tasks["completed"] + "/" + world.Tasks["total"], 22));
            foreach (var token in (JArray)world.Tasks["tasks"])
            {
                var task = (JObject)token; var id = (string)task["taskId"]; var active = (string)world.Tasks["activeTaskId"] == id;
                if ((string)world.Tasks["activeTaskId"] != null && !active) continue;
                content.Add(Label(((bool)task["fake"] ? "Fake Task · " : "") + (string)task["name"] + "\n" + task["step"] + "/" + task["steps"] + " steps", 19));
                var location = Label("", 16); content.Add(location); var buttons = new List<Button>();
                if ((int)task["step"] < (int)task["steps"])
                {
                    if ((string)task["kind"] == "sequence") content.Add(Label("Sequence: " + string.Join(" → ", ((JArray)task["sequence"]).Select(t => ((int)t + 1).ToString())), 17));
                    var values = active && (string)task["kind"] == "sequence" ? new[] { 0, 1, 2, 3 } : new[] { 0 };
                    var row = Row();
                    foreach (var value in values)
                    {
                        var selected = value; var label = !active ? "Open Task" : (string)task["kind"] == "sequence" ? (value + 1).ToString() : (string)task["kind"] == "delivery" ? (int)task["step"] % 2 == 0 ? "Pick up item" : "Deliver item" : "Finish repair step";
                        var button = Button(label, () => { if (active) session.Control("task_step", "round", world.Round, "taskId", id, "step", (int)task["step"], "value", selected); else session.Control("open_task", "round", world.Round, "taskId", id); }); button.style.flexGrow = 1; row.Add(button); buttons.Add(button);
                    }
                    content.Add(row);
                }
                perFrame.Add(() =>
                {
                    var self = world.Field?["self"]; var distance = self == null ? float.PositiveInfinity : Vector2.Distance(new Vector2((float)self["x"], (float)self["y"]), new Vector2((float)task["x"], (float)task["y"]));
                    var nearby = self != null && (world.Developer?["taskRange"]?.Type == JTokenType.Boolean && !(bool)world.Developer["taskRange"] || distance <= 64 && rules.Area((float)self["x"], (float)self["y"]) == rules.Area((float)task["x"], (float)task["y"]));
                    location.text = (int)task["step"] == (int)task["steps"] ? "Complete" : nearby ? "Within reach" : rules.Area((float)task["x"], (float)task["y"]) + " · " + (float.IsInfinity(distance) ? "Explore the town" : Mathf.CeilToInt(distance / rules.Units) + " m away");
                    foreach (var button in buttons) button.SetEnabled(session.CanControl && nearby && (!active || !world.Paused && world.TaskRemaining(now) <= 0));
                });
            }
            if (world.Tasks["activeTaskId"].Type == JTokenType.String) content.Add(Button("Close interaction", () => session.Control("close_task")));
            if ((string)world.Self?["status"] == "eliminated") content.Add(Label("As a Ghost, your earned Task progress still counts. Living Players cannot see or hear you.", 17));
        }
        private void PracticeTargets(NativeWorld world)
        {
            if (world.PracticeTargets.Count == 0) return;
            var self = world.Self; var role = (string)self["role"];
            if (world.Phase == "night" && role != "villager")
            {
                foreach (var target in world.PracticeTargets)
                {
                    var id = (string)target["targetId"]; var button = Button(((string)self["nightChoice"] == id ? "Selected: " : "") + (string)target["displayName"], () => session.Control("night_choice", "round", world.Round, "targetPlayerId", id));
                    button.SetEnabled(role != "mafia" || (string)target["role"] != "mafia"); content.Add(button);
                }
            }
            if (world.Phase == "voting" && !(bool)self["meetingVoted"])
            {
                foreach (var target in world.PracticeTargets) { var id = (string)target["targetId"]; content.Add(Button((previewChosen && previewTarget == id ? "Selected: " : "") + (string)target["displayName"], () => { previewChosen = true; previewTarget = id; signature = ""; })); }
            }
        }
        private void Developer(NativeWorld world)
        {
            var panel = new Foldout { text = "Developer Controller", value = false };
            var controller = (string)world.Developer["controllerId"] == world.SelfPlayerId;
            panel.Add(Label((world.Paused ? "Paused" : "Running") + " · " + (string)world.Developer["scenario"] + "\n" + (controller ? "You control this Room" : "Player view"), 18));
            if (world.Developer["controllerId"].Type == JTokenType.Null) panel.Add(Button("Take over controller", () => session.Control("developer_command", "action", "claim")));
            if (!controller && ((JArray)world.Developer["simulatedPlayerIds"]).Any(id => (string)id == world.SelfPlayerId)) panel.Add(Button("Release to idle simulation", session.ReleaseDeveloperPlayer));
            if (!controller) { content.Add(panel); return; }
            foreach (var action in new[] { "start", "advance", "reset", "lobby", "inspect" })
            {
                var command = action; var button = Button(action == "start" ? "Start setup" : action == "advance" ? "Next phase" : action == "reset" ? "Reset scenario" : action == "lobby" ? "Return to Lobby" : "Refresh inspector", () => session.Control("developer_command", "action", command));
                button.SetEnabled(action == "start" ? world.RoomPhase == "lobby" : action == "lobby" || action == "inspect" || world.Game != null); panel.Add(button);
            }
            panel.Add(Button(world.Paused ? "Resume Game" : "Pause Game", () => session.Control("developer_command", "action", "pause", "enabled", !world.Paused)));
            var scenarios = new List<string> { "four_roles", "protection", "voting", "recovery" }; if (rules.TasksEnabled) scenarios.Add("tasks");
            var scenario = new DropdownField("Test Scenario", scenarios, (string)world.Developer["scenario"]); panel.Add(scenario);
            panel.Add(Button("Load scenario", () => session.Control("developer_command", "action", "scenario", "name", scenario.value)));
            if (world.Inspector != null)
            {
                foreach (var setting in StrictProtocol.Settings)
                {
                    if (!rules.TasksEnabled && setting.StartsWith("task", StringComparison.Ordinal)) continue;
                    var key = setting; var toggle = new Toggle(setting) { value = (bool)world.Inspector["settings"][setting] }; toggle.RegisterValueChangedCallback(e => session.Control("developer_command", "action", "setting", "name", key, "enabled", e.newValue)); panel.Add(toggle);
                }
                foreach (var p in (JArray)world.Inspector["players"])
                {
                    var id = (string)p["playerId"]; var player = new Foldout { text = (string)p["displayName"] + " · " + (string)p["role"], value = false };
                    player.Add(Label((string)p["status"] + " · " + ((bool)p["simulated"] ? "Idle simulation" : "Connected control") + "\nNight: " + ((string)p["nightChoice"] ?? "none") + " · Ballot: " + ((bool)p["voted"] ? (string)p["vote"] ?? "Skip" : "unsubmitted"), 16));
                    foreach (var role in StrictProtocol.Roles) { var chosen = role; player.Add(Button("Set " + role, () => session.Control("developer_command", "action", "role", "playerId", id, "role", chosen))); }
                    var remove = Button("Remove Player", () => session.Control("developer_command", "action", "remove_player", "playerId", id)); remove.SetEnabled(id != world.SelfPlayerId); player.Add(remove);
                    var living = (string)p["status"] == "living"; var statusButton = Button(living ? "Eliminate" : "Revive", () => session.Control("developer_command", "action", "status", "playerId", id, "living", !living)); statusButton.SetEnabled(world.Game != null); player.Add(statusButton);
                    if ((bool)p["simulated"])
                    {
                        player.Add(Button("Copy native takeover command", () => GUIUtility.systemCopyBuffer = "PU Town -server " + session.Endpoint + " -dev-room " + world.RoomId + " -dev-player " + id + " -profile " + id));
                        player.Add(Label("Launch a second native client and use Take a simulated Player with this Room Code and Player ID: " + id, 15));
                    }
                    var x = new FloatField("X") { value = (float)p["x"] }; var y = new FloatField("Y") { value = (float)p["y"] }; player.Add(x); player.Add(y);
                    var teleport = Button("Teleport", () => session.Control("developer_command", "action", "teleport", "playerId", id, "x", x.value, "y", y.value)); teleport.SetEnabled(world.Game != null); player.Add(teleport);
                    if ((bool)p["simulated"] && world.Game != null)
                    {
                        var targets = new List<string> { "Nobody / Skip" }; targets.AddRange(((JArray)world.Inspector["players"]).Select(actor => (string)actor["displayName"] + " [" + (string)actor["playerId"] + "]"));
                        var target = new DropdownField("Simulated choice", targets, 0); player.Add(target);
                        Func<string> selectedTarget = () => target.index <= 0 ? null : (string)world.Inspector["players"][target.index - 1]["playerId"];
                        var choice = Button("Submit Night choice", () => session.Control("developer_command", "action", "night_choice", "playerId", id, "round", world.Round, "targetPlayerId", selectedTarget())); choice.SetEnabled(world.Phase == "night"); player.Add(choice);
                        var vote = Button("Confirm simulated ballot", () => session.Control("developer_command", "action", "vote", "playerId", id, "round", world.Round, "targetPlayerId", selectedTarget())); vote.SetEnabled(world.Phase == "voting"); player.Add(vote);
                    }
                    var bank = new Foldout { text = "Task banks", value = false };
                    foreach (var task in (JArray)p["tasks"])
                    {
                        var taskId = (string)task["taskId"]; var taskPanel = new Foldout { text = ((bool)task["fake"] ? "Fake · " : "Real · ") + taskId, value = false };
                        var places = ((JArray)world.Inspector["locations"]).Select(place => (string)place["name"]).ToList(); var location = new DropdownField("Assignment", places, (int)task["location"]); taskPanel.Add(location);
                        var kind = new DropdownField("Kind", new List<string> { "repair", "sequence", "delivery" }, (string)task["kind"]); taskPanel.Add(kind);
                        var steps = new IntegerField("Required steps") { value = (int)task["steps"] }; var duration = new IntegerField("Milliseconds per step") { value = (int)task["durationMs"] }; var progress = new IntegerField("Progress") { value = (int)task["step"] }; taskPanel.Add(steps); taskPanel.Add(duration); taskPanel.Add(progress);
                        taskPanel.Add(Button("Apply Task", () => session.Control("developer_command", "action", "task", "playerId", id, "taskId", taskId, "location", location.index, "kind", kind.value, "steps", steps.value, "durationMs", duration.value, "step", progress.value)));
                        taskPanel.Add(Button("Teleport to Task", () => { var place = world.Inspector["locations"][(int)task["currentLocation"]]; session.Control("developer_command", "action", "teleport", "playerId", id, "x", (float)place["x"], "y", (float)place["y"]); }));
                        var open = Button("Begin simulated work", () => session.Control("developer_command", "action", "open_task", "playerId", id, "round", world.Round, "taskId", taskId)); open.SetEnabled((bool)p["simulated"] && world.Phase == "day"); taskPanel.Add(open);
                        var sequenceValue = new IntegerField("Sequence value (0–3)") { value = new[] { 2, 0, 3, 1 }[(int)task["step"] % 4] }; if ((string)task["kind"] == "sequence") taskPanel.Add(sequenceValue);
                        var finish = Button("Finish simulated step", () => session.Control("developer_command", "action", "task_step", "playerId", id, "round", world.Round, "taskId", taskId, "step", (int)task["step"], "value", (string)task["kind"] == "sequence" ? sequenceValue.value : 0)); finish.SetEnabled((bool)p["simulated"] && world.Phase == "day" && !world.Paused); taskPanel.Add(finish);
                        bank.Add(taskPanel);
                    }
                    if (rules.TasksEnabled) player.Add(bank); panel.Add(player);
                }
            }
            var simulatedName = new TextField("Simulated Display Name") { value = "Town guest" }; panel.Add(simulatedName);
            foreach (var role in StrictProtocol.Roles) { var chosen = role; panel.Add(Button("Add " + role, () => session.Control("developer_command", "action", "add_player", "displayName", simulatedName.value, "role", chosen))); }
            content.Add(panel);
        }
        private void Voice(NativeWorld world)
        {
            var controls = new Foldout { text = "Voice", value = true }; var adapter = voice?.Invoke();
            if (adapter == null) controls.Add(Label("Native voice is loading or unavailable. Text chat remains available.", 16));
            else
            {
                var enabled = Button(adapter.Enabled ? "Disable voice" : "Enable voice", () => adapter.SetEnabled(!adapter.Enabled)); controls.Add(enabled);
                var microphone = Button(adapter.Muted ? "Enable microphone" : "Mute microphone", () => adapter.SetMuted(!adapter.Muted)); controls.Add(microphone);
                var state = Label(adapter.Status, 16); controls.Add(state);
                perFrame.Add(() => { enabled.text = adapter.Enabled ? "Disable voice" : "Enable voice"; microphone.text = adapter.Muted ? "Enable microphone" : "Mute microphone"; microphone.SetEnabled(adapter.Enabled); state.text = adapter.Status; });
            }
            content.Add(controls);
        }
        private void ShowSettings(bool open) { settingsOpen = open; settingsPanel.style.display = open ? DisplayStyle.Flex : DisplayStyle.None; if (open) BuildSettings(); }
        private void BuildSettings()
        {
            settingsPanel.Clear(); var paper = new VisualElement(); paper.style.width = 580; paper.style.maxHeight = 900; paper.style.backgroundColor = Paper; Pad(paper, 24); settingsPanel.Add(paper);
            paper.Add(Label("Settings", 32)); paper.Add(Label("The Game keeps running while Settings is open.", 17)); var scroll = new ScrollView(); paper.Add(scroll);
            var graphics = new DropdownField("Graphics", new List<string> { "Low", "Balanced", "High" }, PlayerPrefs.GetInt("native.graphicsPreset", 1)); graphics.RegisterValueChangedCallback(_ => NativePreferences.SetGraphicsPreset(graphics.index)); scroll.Add(graphics);
            var motion = new Toggle("Reduced motion") { value = NativePreferences.ReducedMotion }; motion.RegisterValueChangedCallback(e => NativePreferences.ReducedMotion = e.newValue); scroll.Add(motion);
            scroll.Add(Button(Screen.fullScreen ? "Use window" : "Use fullscreen", () => { Screen.fullScreen = !Screen.fullScreen; }));
            foreach (var category in new[] { "master", "voice", "effects", "ambience", "music" })
            {
                var channel = category; var slider = new Slider(category.Substring(0, 1).ToUpperInvariant() + category.Substring(1) + " volume", 0, 100) { value = NativePreferences.Volume(category) * 100 };
                slider.RegisterValueChangedCallback(e => { NativePreferences.SetVolume(channel, e.newValue / 100); voice?.Invoke()?.SetVolumes(NativePreferences.Volume("master"), NativePreferences.Volume("voice")); }); scroll.Add(slider);
            }
            var devices = new List<string> { "System default" }; devices.AddRange(voice?.Invoke()?.MicrophoneDevices ?? Microphone.devices);
            var selection = string.IsNullOrEmpty(NativePreferences.MicrophoneDevice) ? "System default" : NativePreferences.MicrophoneDevice; if (!devices.Contains(selection)) devices.Add(selection);
            var device = new DropdownField("Microphone", devices, selection); device.RegisterValueChangedCallback(e => { NativePreferences.MicrophoneDevice = e.newValue == "System default" ? "" : e.newValue; voice?.Invoke()?.SetMicrophoneDevice(NativePreferences.MicrophoneDevice); }); scroll.Add(device);
            scroll.Add(Button("Refresh microphones", BuildSettings));
            var speaking = new Toggle("Push to talk") { value = NativePreferences.PushToTalk }; speaking.RegisterValueChangedCallback(e => { NativePreferences.PushToTalk = e.newValue; voice?.Invoke()?.SetPushToTalk(e.newValue); }); scroll.Add(speaking);
            var keys = new List<string> { "V", "Space", "LeftShift", "RightShift", "B", "N" }; var key = new DropdownField("Talk key", keys, NativePreferences.TalkKey.ToString()); key.RegisterValueChangedCallback(e => { if (Enum.TryParse<KeyCode>(e.newValue, out var value)) NativePreferences.TalkKey = value; }); scroll.Add(key);
            var suppression = new Toggle("Microphone noise suppression") { value = NativePreferences.NoiseSuppression }; suppression.RegisterValueChangedCallback(e => NativePreferences.NoiseSuppression = e.newValue); scroll.Add(suppression);
            microphoneStatus = Label("", 16); scroll.Add(microphoneStatus); paper.Add(Button("Close Settings", () => ShowSettings(false)));
        }
        private void Chat()
        {
            var text = chatInput.value.Trim(); var length = StrictProtocol.CodePointCount(text);
            if (length < 1 || length > 240) { error.text = "Chat must be 1–240 characters."; return; }
            session.Control("send_chat", "channel", "public", "text", text); chatInput.value = "";
        }
        private static IEnumerable<JObject> Living(NativeWorld world) { return ((JArray)world.Game?["players"] ?? new JArray()).Cast<JObject>().Where(p => (string)p["status"] == "living"); }
        private Label Label(string text, int size)
        {
            var label = new Label(text); label.style.fontSize = size; label.style.whiteSpace = WhiteSpace.Normal;
            label.style.unityTextAlign = TextAnchor.UpperLeft; label.style.flexShrink = 0; label.style.marginBottom = 8; return label;
        }
        private Button Button(string text, Action action)
        {
            var button = new Button(action) { text = text }; button.style.fontSize = 19; button.style.minHeight = 42;
            button.style.marginTop = 6; button.style.flexGrow = 0; button.style.flexShrink = 0; button.style.whiteSpace = WhiteSpace.Normal;
            button.style.unityTextAlign = TextAnchor.MiddleCenter; button.style.paddingTop = button.style.paddingBottom = 8;
            button.style.paddingLeft = button.style.paddingRight = 12;
            button.style.borderTopLeftRadius = button.style.borderTopRightRadius = button.style.borderBottomLeftRadius = button.style.borderBottomRightRadius = 6;
            button.style.backgroundColor = new Color(.10f, .31f, .27f); button.style.color = Color.white; return button;
        }
        private static VisualElement Row() { var row = new VisualElement(); row.style.flexDirection = FlexDirection.Row; row.style.flexShrink = 0; return row; }
        private static void Pad(VisualElement element, int value) { element.style.paddingLeft = element.style.paddingRight = element.style.paddingTop = element.style.paddingBottom = value; }
        private static string TimeText(double ms) { var seconds = (int)Math.Ceiling(ms / 1000); return (seconds / 60) + ":" + (seconds % 60).ToString("00"); }
        private static string PhaseName(string phase) { return phase == "role_reveal" ? "Your Role" : phase == "day" ? "Day" : phase == "night" ? "Night" : phase == "discussion" ? "Townhall discussion" : phase == "voting" ? "Townhall voting" : phase == "voting_result" ? "Meeting result" : "Game finished"; }
        private static string RoleHelp(string role) { return role == "mafia" ? "Agree on a Village victim at Night. Win when the living Mafia match or outnumber the Village." : role == "doctor" ? "Protect one living Participant each Night. Help the Townhall find the Mafia." : role == "sheriff" ? "Investigate one other living Participant each Night. Results belong to you." : "Explore, converse with nearby Players and help the Townhall find the Mafia."; }
        public void Dispose() { UnityEngine.Object.Destroy(owner); UnityEngine.Object.Destroy(settings); }
    }
}
