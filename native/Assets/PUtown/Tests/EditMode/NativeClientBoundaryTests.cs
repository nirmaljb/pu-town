using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.IO;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PUtown.Runtime;
using UnityEngine;
using UnityEngine.TestTools;
using UnityEngine.UIElements;

namespace PUtown.Tests
{
    public sealed class NativeClientBoundaryTests
    {
        private const string Credential = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        private static JObject Player(string id = "p1", int seat = 0)
        {
            return new JObject { ["playerId"] = id, ["displayName"] = "Player " + id, ["colour"] = "#FFAA11", ["avatarPreset"] = "scholar", ["seat"] = seat, ["ready"] = false, ["connected"] = true, ["x"] = 2400, ["y"] = 1800, ["facing"] = "down" };
        }
        private static JObject Snapshot()
        {
            return StrictProtocol.Command("room_snapshot", "selfPlayerId", "p1", "roomId", "ABC123", "recoveryToken", Credential, "phase", "lobby", "hostPlayerId", "p1", "roleSetup", new JObject { ["mafia"] = 1, ["doctors"] = 1, ["sheriffs"] = 1 }, "mapId", "campus", "players", new JArray(Player()));
        }
        private static JObject Game(string phase = "day", int round = 1, int remaining = 10000)
        {
            var roster = Player(); roster.Remove("ready"); roster.Remove("connected"); roster.Remove("x"); roster.Remove("y"); roster.Remove("facing"); roster["status"] = "living";
            return StrictProtocol.Command("game_state", "mode", "competitive", "phase", phase, "round", round, "remainingMs", remaining, "players", new JArray(roster), "outcome", null, "ballots", null, "winner", null, "roles", null,
                "self", new JObject { ["role"] = "villager", ["faction"] = "village", ["status"] = "living", ["killedByMafia"] = false, ["mafiaTeam"] = JValue.CreateNull(), ["investigations"] = JValue.CreateNull(), ["meetingVoted"] = false, ["meetingVote"] = JValue.CreateNull(), ["nightChoice"] = JValue.CreateNull() });
        }
        [TestCase("{\"version\":2,\"type\":\"pong\"}")]
        [TestCase("{\"version\":1,\"type\":\"pong\",\"extra\":true}")]
        [TestCase("{\"version\":1,\"type\":\"pong\",}")]
        [TestCase("{version:1,type:'pong'}")]
        [TestCase("{\"version\":1,\"type\":\"pong\",\"version\":1}")]
        [TestCase("{\"version\":1,\"type\":\"pong\"}{}")]
        [TestCase("{\"version\":1,\"type\":\"unknown\"}")]
        public void StrictWireRejectsUnsupportedOrMalformedPayload(string json) { Assert.That(() => StrictProtocol.Decode(json), Throws.Exception); }
        [Test]
        public void RecipientDisclosureIsValidatedBeforeAdmission()
        {
            var game = Game(); ((JObject)game["self"])["mafiaTeam"] = new JArray("p2");
            Assert.That(() => StrictProtocol.Decode(game.ToString()), Throws.TypeOf<FormatException>());
        }
        [Test]
        public void ADecidingForfeitDuringRoleRevealCanFinishRoundZero()
        {
            var socket = new FakeSocket();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, new MemoryStore(), () => 0, false))
            {
                session.Create("Alice"); socket.Deliver(Snapshot()); session.ApplyFrame();
                socket.Deliver(Game("role_reveal", 0, 8000)); session.ApplyFrame();
                var finished = Game("finished", 0); finished["remainingMs"] = JValue.CreateNull(); finished["winner"] = "village";
                finished["roles"] = new JArray(new JObject { ["playerId"] = "p1", ["role"] = "villager" });
                socket.Deliver(finished); session.ApplyFrame();
                Assert.That(session.Status, Is.EqualTo(SessionStatus.Active));
                Assert.That(session.World.Phase, Is.EqualTo("finished"));
                Assert.That((string)session.World.Game["winner"], Is.EqualTo("village"));
            }
        }
        [Test]
        public void RecoverySnapshotDiscardsPredictionUntilItsNewAcceptedFieldArrives()
        {
            var world = new NativeWorld(); var snapshot = Snapshot(); snapshot["phase"] = "playing";
            world.Apply(StrictProtocol.Decode(snapshot.ToString()), 0); world.Apply(StrictProtocol.Decode(Game().ToString()), 0);
            var field = StrictProtocol.Command("field_state", "round", 1, "players", new JArray(new JObject { ["playerId"] = "p1", ["x"] = 2400, ["y"] = 1800, ["facing"] = "down", ["ghost"] = false }), "self", new JObject { ["x"] = 2400, ["y"] = 1800, ["facing"] = "down", ["correction"] = 0 });
            var rules = new CampusRules(File.ReadAllText(Path.Combine(Application.dataPath, "PUtown/Resources/Campus/campus.json")));
            var prediction = new LocalPrediction(); world.Apply(StrictProtocol.Decode(field.ToString()), 0);
            prediction.Update(world, rules, Vector2.right, .1f, 0, true, (_, __, ___) => { });
            Assert.That(prediction.Position.x, Is.GreaterThan(2400));
            world.Apply(StrictProtocol.Decode(snapshot.ToString()), 100);
            prediction.Update(world, rules, Vector2.zero, .1f, 100, true, (_, __, ___) => { });
            Assert.That(prediction.Active, Is.False);
            field["self"]["x"] = 2480; field["players"][0]["x"] = 2480;
            world.Apply(StrictProtocol.Decode(field.ToString()), 200);
            prediction.Update(world, rules, Vector2.zero, .1f, 200, true, (_, __, ___) => { });
            Assert.That(prediction.Position.x, Is.EqualTo(2480));
        }
        [Test]
        public void DuplicateSeatCannotChangeAppliedRoom()
        {
            var snapshot = Snapshot(); ((JArray)snapshot["players"]).Add(Player("p2", 0));
            Assert.That(() => StrictProtocol.Decode(snapshot.ToString()), Throws.TypeOf<FormatException>());
        }
        [Test]
        public void MembershipAndCountdownChangeOnlyAtNextFrameAndCountFromArrival()
        {
            var now = 1000d; var socket = new FakeSocket(); var store = new MemoryStore();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, store, () => now, false))
            {
                session.Create("Alice"); socket.Deliver(Snapshot());
                Assert.That(session.World.SelfPlayerId, Is.Null); Assert.That(session.Status, Is.EqualTo(SessionStatus.Connecting));
                session.ApplyFrame(); Assert.That(session.World.SelfPlayerId, Is.EqualTo("p1")); Assert.That(store.Intent.Token, Is.EqualTo(Credential));
                socket.Deliver(Game()); now = 5000; session.ApplyFrame();
                Assert.That(session.World.Remaining(now), Is.EqualTo(6000)); Assert.That(session.World.Round, Is.EqualTo(1));
            }
        }
        [Test]
        public void FreshNativeCreateSelectsCampusBeforeAllowingLobbyControls()
        {
            var socket = new FakeSocket();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, new MemoryStore(), () => 0, false))
            {
                session.Create("Alice"); var snapshot = Snapshot(); snapshot["mapId"] = "village"; socket.Deliver(snapshot);
                Assert.That(socket.Sent.Any(m => (string)m["type"] == "select_map"), Is.False); session.ApplyFrame();
                Assert.That((string)socket.Sent.Last()["type"], Is.EqualTo("select_map")); Assert.That((string)socket.Sent.Last()["mapId"], Is.EqualTo("campus")); Assert.That(session.SelectingCampus, Is.True);
                session.Control("set_ready", "ready", true); Assert.That(socket.Sent.Any(m => (string)m["type"] == "set_ready"), Is.False);
                var state = StrictProtocol.Command("room_state", "phase", "lobby", "hostPlayerId", "p1", "roleSetup", snapshot["roleSetup"], "mapId", "campus", "players", snapshot["players"]); socket.Deliver(state); session.ApplyFrame();
                Assert.That(session.World.MapId, Is.EqualTo("campus")); Assert.That(session.SelectingCampus, Is.False); Assert.That(session.CanControl, Is.False);
                session.AssetsReady = true; session.Control("set_ready", "ready", true); Assert.That((string)socket.Sent.Last()["type"], Is.EqualTo("set_ready"));
            }
        }
        [Test]
        public void PausedDeveloperGameKeepsChoicesChatAndVoiceAvailableButFreezesMovementAndTaskSteps()
        {
            var socket = new FakeSocket();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, new MemoryStore(), () => 0, false))
            {
                session.Create("Alice"); var snapshot = Snapshot(); snapshot["phase"] = "playing";
                socket.Deliver(snapshot); socket.Deliver(Game()); session.ApplyFrame(); session.AssetsReady = true;
                socket.Deliver(StrictProtocol.Command("developer_status", "controllerId", "p1", "paused", true, "nightMovement", false, "taskRange", true, "scenario", "four_roles", "revision", 1, "simulatedPlayerIds", new JArray()));
                Assert.That(session.World.Paused, Is.False);
                session.ApplyFrame(); Assert.That(session.World.Paused, Is.True); socket.Sent.Clear();

                session.Control("send_chat", "channel", "public", "text", "The paused Game can still discuss choices.");
                session.Control("night_choice", "round", 1, "targetPlayerId", null);
                session.Control("meeting_vote", "round", 1, "targetPlayerId", null);
                session.Control("open_task", "round", 1, "taskId", "repair-1");
                session.Control("close_task"); session.Control("join_voice"); session.Control("leave_voice");
                session.Control("move", "x", 2420, "y", 1800, "facing", "right");
                session.Control("task_step", "round", 1, "taskId", "repair-1", "step", 0, "value", 0);

                Assert.That(socket.Sent.Select(command => (string)command["type"]), Is.EqualTo(new[] { "send_chat", "night_choice", "meeting_vote", "open_task", "close_task", "join_voice", "leave_voice" }));
            }
        }
        [Test]
        public void PracticeDoctorCanProtectSelfThroughTheInterfaceWithoutAddingRealTargetsToOtherChoices()
        {
            var socket = new FakeSocket();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, new MemoryStore(), () => 0, false))
            using (var collection = new NativeAvatarCollection())
            {
                session.Create("Alice"); var snapshot = Snapshot(); snapshot["phase"] = "playing";
                var game = Game("night"); game["mode"] = "practice"; game["remainingMs"] = JValue.CreateNull(); game["self"]["role"] = "doctor";
                socket.Deliver(snapshot); socket.Deliver(game);
                socket.Deliver(StrictProtocol.Command("practice_state", "targets", new JArray(
                    new JObject { ["targetId"] = "practice-villager", ["displayName"] = "Practice Villager", ["role"] = "villager" },
                    new JObject { ["targetId"] = "practice-mafia", ["displayName"] = "Practice Mafia", ["role"] = "mafia" })));
                session.ApplyFrame(); session.AssetsReady = true;
                var overlay = new NativeOverlay(session, new CampusRules(Resources.Load<TextAsset>("Campus/campus").text), collection, null);
                var interfaceObject = GameObject.Find("Native interface"); var document = interfaceObject.GetComponent<UIDocument>(); var panelSettings = document.panelSettings;
                try
                {
                    overlay.Render(0, null); var root = document.rootVisualElement;
                    var protect = root.Query<Button>().ToList().SingleOrDefault(button => button.text == "Protect yourself");
                    Assert.That(protect, Is.Not.Null, "The practice Doctor needs an explicit self-protection choice.");
                    Assert.That(root.Query<Button>().ToList().Any(button => button.text == "Practice Villager"), Is.True);
                    socket.Sent.Clear();
                    using (var submit = NavigationSubmitEvent.GetPooled()) { submit.target = protect; protect.SendEvent(submit); }
                    Assert.That(socket.Sent, Has.Count.EqualTo(1)); Assert.That((string)socket.Sent[0]["type"], Is.EqualTo("night_choice"));
                    Assert.That((string)socket.Sent[0]["targetPlayerId"], Is.EqualTo("p1"));

                    socket.Deliver(StrictProtocol.Command("practice_state", "targets", new JArray(
                        new JObject { ["targetId"] = "practice-villager", ["displayName"] = "Updated practice target", ["role"] = "villager" })));
                    session.ApplyFrame(); overlay.Render(0, null);
                    Assert.That(root.Query<Button>().ToList().Any(button => button.text == "Updated practice target"), Is.True, "A newly applied practice surface must update without a Game state event.");

                    foreach (var role in new[] { "mafia", "sheriff" })
                    {
                        game["self"]["role"] = role; game["self"]["faction"] = role == "mafia" ? "mafia" : "village";
                        game["self"]["mafiaTeam"] = role == "mafia" ? (JToken)new JArray("p1") : JValue.CreateNull();
                        game["self"]["investigations"] = role == "sheriff" ? (JToken)new JArray() : JValue.CreateNull();
                        socket.Deliver(game); session.ApplyFrame(); overlay.Render(0, null);
                        Assert.That(root.Query<Button>().ToList().Any(button => button.text.Contains("Protect yourself") || button.text == "Player p1"), Is.False);
                    }
                    game["phase"] = "voting"; socket.Deliver(game); session.ApplyFrame(); overlay.Render(0, null);
                    Assert.That(root.Query<Button>().ToList().Any(button => button.text.Contains("Protect yourself") || button.text == "Player p1"), Is.False);
                }
                finally { UnityEngine.Object.DestroyImmediate(interfaceObject); UnityEngine.Object.DestroyImmediate(panelSettings); }
            }
        }
        [UnityTest]
        public IEnumerator FullNightChoicesKeepWrappedTextReadableAndFooterCompactAt720pAnd1080p()
        {
            var socket = new FakeSocket();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, new MemoryStore(), () => 0, false))
            using (var collection = new NativeAvatarCollection())
            {
                session.Create("Alice"); var snapshot = Snapshot(); snapshot["phase"] = "playing";
                var game = Game("night"); game["self"]["role"] = "doctor";
                for (var seat = 1; seat < 10; seat++)
                {
                    var player = Player("p" + (seat + 1), seat); ((JArray)snapshot["players"]).Add(player);
                    var participant = (JObject)player.DeepClone();
                    foreach (var key in new[] { "ready", "connected", "x", "y", "facing" }) participant.Remove(key);
                    participant["status"] = "living"; ((JArray)game["players"]).Add(participant);
                }
                socket.Deliver(snapshot); socket.Deliver(game); session.ApplyFrame(); session.AssetsReady = true;
                var overlay = new NativeOverlay(session, new CampusRules(Resources.Load<TextAsset>("Campus/campus").text), collection, Resources.Load<Font>("Fonts/AtkinsonHyperlegible-Regular"), () => { });
                var interfaceObject = GameObject.Find("Native interface"); var document = interfaceObject.GetComponent<UIDocument>(); var panelSettings = document.panelSettings;
                RenderTexture viewport = null;
                try
                {
                    foreach (var size in new[] { new Vector2Int(1280, 720), new Vector2Int(1920, 1080) })
                    {
                        if (viewport != null) UnityEngine.Object.DestroyImmediate(viewport);
                        viewport = new RenderTexture(size.x, size.y, 0); viewport.Create(); panelSettings.targetTexture = viewport;
                        foreach (var playerCount in new[] { 4, 10 })
                        {
                            var visibleRoom = (JObject)snapshot.DeepClone(); visibleRoom["players"] = new JArray(((JArray)snapshot["players"]).Take(playerCount));
                            var visibleGame = (JObject)game.DeepClone(); visibleGame["players"] = new JArray(((JArray)game["players"]).Take(playerCount));
                            socket.Deliver(visibleRoom); socket.Deliver(visibleGame); session.ApplyFrame(); session.AssetsReady = true;
                            overlay.Render(0, null);
                            for (var frame = 0; frame < 5; frame++) yield return null;
                            var root = document.rootVisualElement;
                            var labels = new[] {
                                root.Query<Label>().ToList().Single(label => label.text.StartsWith("Protect one living Participant")),
                                root.Query<Label>().ToList().Single(label => label.text == "Sleep where you stood. Conversation is closed."),
                                root.Query<Label>().ToList().Single(label => label.text == "Choose protection") };
                            foreach (var label in labels)
                            {
                                var measured = label.MeasureTextSize(label.text, label.contentRect.width, VisualElement.MeasureMode.Exactly, 0, VisualElement.MeasureMode.Undefined);
                                Assert.That(measured.y, Is.GreaterThan(0), "Text measurement needs an attached layout at " + size);
                                Assert.That(label.contentRect.height + .5f, Is.GreaterThanOrEqualTo(measured.y), "The complete wrapped instruction must remain readable at " + size + ": " + label.text);
                            }
                            for (var index = 1; index < labels.Length; index++)
                                Assert.That(labels[index].worldBound.yMin, Is.GreaterThanOrEqualTo(labels[index - 1].worldBound.yMax), "Night instructions must not overlap at " + size);
                            var leave = root.Query<Button>().ToList().Single(button => button.text == "Leave Room");
                            Assert.That(leave.layout.height, Is.InRange(42f, 60f), "Footer actions must leave space for the Game's scrolling choices.");
                            if (playerCount == 10)
                            {
                                var scroll = labels[0].GetFirstAncestorOfType<ScrollView>();
                                Assert.That(scroll.contentContainer.worldBound.height, Is.GreaterThan(scroll.contentViewport.worldBound.height), "Ten Night targets must scroll instead of squeezing the instructions.");
                                var before = labels[0].worldBound.yMin; scroll.scrollOffset = new Vector2(0, scroll.verticalScroller.highValue);
                                for (var frame = 0; frame < 3; frame++) yield return null;
                                Assert.That(labels[0].worldBound.yMin, Is.LessThan(before), "The complete choices surface must be reachable by scrolling.");
                                scroll.scrollOffset = Vector2.zero;
                            }
                        }
                        var discussion = Game("discussion"); discussion["self"]["role"] = "doctor";
                        socket.Deliver(discussion); session.ApplyFrame(); overlay.Render(0, null);
                        for (var frame = 0; frame < 5; frame++) yield return null;
                        var discussionFooter = document.rootVisualElement.Query<Button>().ToList().Single(button => button.text == "Leave Room");
                        Assert.That(discussionFooter.layout.height, Is.InRange(42f, 60f), "Townhall footer actions must remain compact when the Game content is short at " + size);
                    }
                }
                finally
                {
                    UnityEngine.Object.DestroyImmediate(interfaceObject); UnityEngine.Object.DestroyImmediate(panelSettings);
                    if (viewport != null) UnityEngine.Object.DestroyImmediate(viewport);
                }
            }
        }
        [Test]
        public void NativeMediaFailureCannotCloseGameTransport()
        {
            var socket = new FakeSocket();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, new MemoryStore(), () => 0, false))
            {
                session.Create("Alice"); socket.Deliver(Snapshot()); session.ApplyFrame(); session.VoiceAuthorization += _ => throw new FormatException("Media failure");
                socket.Deliver(StrictProtocol.Command("voice_state", "url", "/voice", "token", "private-voice-grant", "canPublish", false)); session.ApplyFrame();
                Assert.That(session.Status, Is.EqualTo(SessionStatus.Active)); Assert.That(session.World.Voice, Is.Not.Null);
            }
        }
        [Test]
        public void NativeDeveloperTakeAndReleaseRetainMembershipIdentityWithoutAutomaticRecovery()
        {
            var socket = new FakeSocket(); var store = new MemoryStore();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, store, () => 0, false))
            {
                session.TakeDeveloperPlayer("abc123", "p1"); Assert.That((string)socket.Sent.Single()["type"], Is.EqualTo("take_developer_player"));
                socket.Deliver(Snapshot()); session.ApplyFrame(); Assert.That(session.World.SelfPlayerId, Is.EqualTo("p1"));
                session.ReleaseDeveloperPlayer(); Assert.That((string)socket.Sent.Last()["action"], Is.EqualTo("release")); Assert.That(store.Intent, Is.Null);
                socket.Deliver(StrictProtocol.Command("room_left", "roomId", "ABC123")); session.ApplyFrame(); Assert.That(session.Status, Is.EqualTo(SessionStatus.Entry));
                socket.Close(1006); session.ApplyFrame(); Assert.That(session.Status, Is.EqualTo(SessionStatus.Entry));
            }
        }
        [Test]
        public void TransportHeartbeatWorksWithoutFramesAndFailureAppliesAtFrame()
        {
            var now = 0d; var socket = new FakeSocket();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, new MemoryStore(), () => now, false))
            {
                session.Create("Alice"); socket.Deliver(Snapshot()); session.ApplyFrame();
                for (var i = 1; i <= 40; ++i) { now = i * 250; session.CheckTransportHealth(); }
                Assert.That(socket.Sent.Any(d => (string)d["type"] == "ping"), Is.True);
                Assert.That(session.Status, Is.EqualTo(SessionStatus.Active)); session.ApplyFrame(); Assert.That(session.Status, Is.EqualTo(SessionStatus.Recovering));
            }
        }
        [Test]
        public void SuspensionGetsOnlyOneFreshDeadlineUntilPong()
        {
            var health = new TransportHealth(); health.ConfirmMembership(0);
            Assert.That(health.Check(30000, true), Is.EqualTo(HealthAction.Ping));
            Assert.That(health.Check(39999, true), Is.EqualTo(HealthAction.Ping));
            Assert.That(health.Check(40000, true), Is.EqualTo(HealthAction.Failure));
            health.ConfirmMembership(0); health.Check(30000, true); health.Pong(31000);
            Assert.That(health.Check(50000, true), Is.EqualTo(HealthAction.Ping));
        }
        [Test]
        public void RestartRecoversExistingMembershipAndTakeoverIsTerminal()
        {
            var socket = new FakeSocket(); var store = new MemoryStore { Intent = new RecoveryIntent("ws://localhost:8080/ws/game", "ABC123", Credential, "Alice") };
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, store, () => 0, false))
            {
                Assert.That((string)socket.Sent.Single()["type"], Is.EqualTo("recover_room")); socket.Deliver(Snapshot()); session.ApplyFrame();
                socket.Close(4001); Assert.That(session.Status, Is.EqualTo(SessionStatus.Active)); session.ApplyFrame();
                Assert.That(session.Status, Is.EqualTo(SessionStatus.Failed)); Assert.That(store.Intent, Is.Null);
            }
        }
        [Test]
        public void LeaveClearsRestartIntentAndStaleSocketCannotRejoin()
        {
            var socket = new FakeSocket(); var store = new MemoryStore();
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => socket, store, () => 0, false))
            {
                session.Create("Alice"); socket.Deliver(Snapshot()); session.ApplyFrame(); session.Leave();
                Assert.That(store.Intent, Is.Null); Assert.That((string)socket.Sent.Last()["type"], Is.EqualTo("leave_room"));
                socket.Deliver(StrictProtocol.Command("room_left", "roomId", "ABC123")); session.ApplyFrame(); socket.Deliver(Snapshot()); session.ApplyFrame();
                Assert.That(session.Status, Is.EqualTo(SessionStatus.Entry)); Assert.That(session.World.SelfPlayerId, Is.Null);
            }
        }
        [Test]
        public void InboxKeepsArrivalOrderAndNeverReplacesOnOverflow()
        {
            var inbox = new ArrivalInbox(2); var pong = StrictProtocol.Decode("{\"version\":1,\"type\":\"pong\"}");
            Assert.That(inbox.Enqueue(new InboundEvent(1, 1, pong)), Is.True); Assert.That(inbox.Enqueue(new InboundEvent(1, 2, pong)), Is.True); Assert.That(inbox.Enqueue(new InboundEvent(1, 3, pong)), Is.False);
            inbox.Take(out var first); inbox.Take(out var second); Assert.That(first.ArrivedAt, Is.EqualTo(1)); Assert.That(second.ArrivedAt, Is.EqualTo(2));
        }
        [Test]
        public void RecoveryRetriesRemainServerOwnedPastReservationTime()
        {
            var now = 0d; var sockets = new List<FakeSocket>();
            var store = new MemoryStore { Intent = new RecoveryIntent("ws://localhost:8080/ws/game", "ABC123", Credential, "Alice") };
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => { var socket = new FakeSocket(); sockets.Add(socket); return socket; }, store, () => now, false))
            {
                for (var i = 0; i < 20; ++i) { sockets.Last().Close(1006); session.ApplyFrame(); now += 5000; session.ApplyFrame(); }
                now = 150000; session.ApplyFrame(); Assert.That(session.Status, Is.EqualTo(SessionStatus.Recovering)); Assert.That(store.Intent, Is.Not.Null); now = 155000; session.ApplyFrame();
                sockets.Last().Deliver(StrictProtocol.Command("error", "code", "recovery_expired", "message", "This Membership has expired.")); session.ApplyFrame();
                Assert.That(session.Status, Is.EqualTo(SessionStatus.Failed)); Assert.That(store.Intent, Is.Null);
            }
        }
        [Test]
        public void OldGenerationSnapshotCannotReplaceRecoveredPlayer()
        {
            var now = 0d; var first = new FakeSocket(); var second = new FakeSocket(); var attempts = 0;
            using (var session = new GameSession("ws://localhost:8080/ws/game", () => attempts++ == 0 ? first : second, new MemoryStore(), () => now, false))
            {
                session.Create("Alice"); first.Deliver(Snapshot()); session.ApplyFrame(); first.Close(1006); session.ApplyFrame(); now = 500; session.ApplyFrame();
                second.Deliver(Snapshot()); session.ApplyFrame(); var stale = Snapshot(); stale["selfPlayerId"] = "stale"; first.Deliver(stale); session.ApplyFrame();
                Assert.That(session.World.SelfPlayerId, Is.EqualTo("p1")); Assert.That(session.Status, Is.EqualTo(SessionStatus.Active));
            }
        }
        [Test]
        public void AppliedTaskAndChatRestoreOnlyRecipientsServerSnapshot()
        {
            var world = new NativeWorld(); world.Apply(StrictProtocol.Decode(Snapshot().ToString()), 0); world.Apply(StrictProtocol.Decode(Game().ToString()), 0);
            var history = StrictProtocol.Command("chat_history", "messages", new JArray(new JObject { ["channel"] = "public", ["round"] = 1, ["senderPlayerId"] = "p2", ["senderName"] = "Bob", ["text"] = "Authorized earlier message" }));
            world.Apply(StrictProtocol.Decode(history.ToString()), 1000); history["messages"] = new JArray(); world.Apply(StrictProtocol.Decode(history.ToString()), 2000);
            Assert.That(world.Chat, Is.Empty);
            var tasks = StrictProtocol.Command("task_state", "tasks", new JArray(new JObject { ["taskId"] = "repair-1", ["name"] = "Repair", ["kind"] = "repair", ["x"] = 2400, ["y"] = 1800, ["step"] = 1, ["steps"] = 3, ["fake"] = false, ["sequence"] = new JArray() }), "completed", 1, "total", 30, "activeTaskId", "repair-1", "remainingMs", 1000);
            world.Apply(StrictProtocol.Decode(tasks.ToString()), 2000); Assert.That(world.TaskRemaining(3500), Is.Zero); Assert.That((int)world.Tasks["tasks"][0]["step"], Is.EqualTo(1));
        }
        [Test]
        public void NativeRestartIntentIsEndpointBoundAndDoesNotContainAccountIdentity()
        {
            var directory = Path.Combine(Path.GetTempPath(), "putown-recovery-" + Guid.NewGuid().ToString("N")); var path = Path.Combine(directory, "intent.json"); var store = new FileRecoveryStore(path);
            try
            {
                store.Save(new RecoveryIntent("ws://localhost:8080/ws/game", "ABC123", Credential, "Alice"));
                Assert.That(store.Read("ws://other-server:8080/ws/game"), Is.Null); Assert.That(store.Read("ws://localhost:8080/ws/game").Token, Is.EqualTo(Credential));
                var data = JObject.Parse(File.ReadAllText(path)); Assert.That(data.Properties().Select(p => p.Name), Is.EquivalentTo(new[] { "version", "endpoint", "roomId", "recoveryToken", "displayName" }));
                store.Clear(); Assert.That(File.Exists(path), Is.False);
            }
            finally { if (Directory.Exists(directory)) Directory.Delete(directory, true); }
        }
        [Test]
        public void NativeCampusMappingAndPredictionAdoptServerCorrectionAndFreezeNight()
        {
            var campus = new CampusRules(Resources.Load<TextAsset>("Campus/campus").text); var world = new NativeWorld(); var prediction = new LocalPrediction(); var sent = new List<Vector2>();
            world.Apply(StrictProtocol.Decode(Snapshot().ToString()), 0); world.Apply(StrictProtocol.Decode(Game().ToString()), 0);
            var field = StrictProtocol.Command("field_state", "round", 1, "players", new JArray(new JObject { ["playerId"] = "p1", ["x"] = 2400, ["y"] = 1800, ["facing"] = "down", ["ghost"] = false }), "self", new JObject { ["x"] = 2400, ["y"] = 1800, ["facing"] = "down", ["correction"] = 0 });
            world.Apply(StrictProtocol.Decode(field.ToString()), 0);
            Assert.That(campus.ToServer(campus.ToWorld(2400, 1800)), Is.EqualTo(new Vector2(2400, 1800)));
            prediction.Update(world, campus, Vector2.right, .1f, 100, true, (x, y, facing) => sent.Add(new Vector2(x, y)));
            Assert.That(prediction.Position.x, Is.GreaterThan(2400)); Assert.That((float)world.Field["players"][0]["x"], Is.EqualTo(2400)); Assert.That(sent, Has.Count.EqualTo(1));
            ((JObject)field["self"])["correction"] = 1; world.Apply(StrictProtocol.Decode(field.ToString()), 200);
            prediction.Update(world, campus, Vector2.zero, .1f, 200, true, (x, y, facing) => sent.Add(new Vector2(x, y)));
            Assert.That(prediction.Position, Is.EqualTo(new Vector2(2400, 1800)));
            world.Apply(StrictProtocol.Decode(Game("night").ToString()), 300);
            prediction.Update(world, campus, Vector2.right, .1f, 300, true, (x, y, facing) => sent.Add(new Vector2(x, y)));
            Assert.That(prediction.Position, Is.EqualTo(new Vector2(2400, 1800))); Assert.That(prediction.Moving, Is.False);
        }
        [Test]
        public void StaleFieldRoundAndUnauthorizedInspectorCannotAlterVisibleState()
        {
            var world = new NativeWorld(); world.Apply(StrictProtocol.Decode(Snapshot().ToString()), 0); world.Apply(StrictProtocol.Decode(Game().ToString()), 0);
            var stale = StrictProtocol.Command("field_state", "round", 2, "players", new JArray(), "self", new JObject { ["x"] = 99, ["y"] = 99, ["facing"] = "up", ["correction"] = 10 }); world.Apply(StrictProtocol.Decode(stale.ToString()), 0); Assert.That(world.Field, Is.Null);
            var inspector = StrictProtocol.Command("developer_state", "settings", JObject.FromObject(new Dictionary<string, bool> { ["automatic"] = true, ["factionVictory"] = true, ["taskVictory"] = true, ["taskRange"] = true, ["taskDuration"] = true, ["nightMovement"] = false }), "players", new JArray(), "locations", new JArray());
            world.Apply(StrictProtocol.Decode(inspector.ToString()), 0); Assert.That(world.Inspector, Is.Null);
        }
        private sealed class FakeSocket : IGameSocket
        {
            public event Action<string> Received; public event Action<int, string> Closed;
            public readonly List<JObject> Sent = new List<JObject>();
            public Task Connect(Uri endpoint) { return Task.CompletedTask; }
            public Task Send(string payload) { Sent.Add(JObject.Parse(payload)); return Task.CompletedTask; }
            public void Deliver(JObject data) { Received?.Invoke(data.ToString()); }
            public void Close(int code) { Closed?.Invoke(code, ""); }
            public void Abort() { }
            public void Dispose() { }
        }
        private sealed class MemoryStore : IRecoveryStore
        {
            public RecoveryIntent Intent;
            public RecoveryIntent Read(string endpoint) { return Intent?.Endpoint == endpoint ? Intent : null; }
            public void Save(RecoveryIntent intent) { Intent = intent; }
            public void Clear() { Intent = null; }
        }
    }
}
