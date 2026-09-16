package dev.lpa.pu_go.websocket.handler;

import dev.lpa.pu_go.room.RoomManager;
import dev.lpa.pu_go.room.RoomRules;
import dev.lpa.pu_go.websocket.support.RecordingWebSocketSession;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Iterator;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertFalse;

class GameWebSocketHandlerTest {
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AtomicLong now = new AtomicLong(1_000_000_000L);
    private final java.util.concurrent.atomic.AtomicInteger playerIds = new java.util.concurrent.atomic.AtomicInteger();
    private final AtomicLong milliseconds = new AtomicLong();
    private final GameWebSocketHandler handler = new GameWebSocketHandler(
            new RoomManager(milliseconds::get), Runnable::run, () -> "player-" + playerIds.incrementAndGet(), now::get
    );

    // Start rings the Room centre, so movement tests start from their own standing position.
    private static final int FIRST_X = (int) RoomRules.spawnX(0);
    private static final int FIRST_Y = (int) RoomRules.spawnY(0);
    private static final int SECOND_X = (int) RoomRules.spawnX(1);
    private static final int SECOND_Y = (int) RoomRules.spawnY(1);

    @Test
    void invalidSelectionsNeverChangeMembershipAndRetiredSocketsHaveNoAuthority() throws Exception {
        var original = connect("reject-selection");
        select(original, "townsperson-10");
        assertEquals("not_in_room", latest(original).path("code").asText());
        send(original, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        var initial = latest(original);
        var observer = connect("reject-observer"); join(observer, initial.path("roomId").asText());
        select(original, "townsperson-10");
        var accepted = latest(observer);
        for (String request : List.of(
                "{\"version\":1,\"type\":\"select_avatar\"}",
                "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":null}",
                "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":5}",
                "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":\"\"}",
                "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":\"townsperson-1\",\"playerId\":\"other\"}",
                "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":\"townsperson-1\",\"roomId\":\"OTHER1\"}")) {
            send(original, request);
            assertEquals("malformed_message", latest(original).path("code").asText());
            assertEquals(accepted, latest(observer));
        }
        select(original, "unpublished-draft");
        assertEquals("invalid_avatar_preset", latest(original).path("code").asText());
        assertEquals(accepted, latest(observer));
        send(original, "{\"version\":2,\"type\":\"select_avatar\",\"avatarPreset\":\"townsperson-1\"}");
        assertEquals("unsupported_version", latest(original).path("code").asText());
        var takeover = connect("selected-takeover");
        recover(takeover, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        assertEquals("townsperson-10", latest(takeover).path("players").get(0).path("avatarPreset").asText());
        var takenOver = latest(observer);
        select(original, "townsperson-1");
        assertEquals(takenOver, latest(observer));
        handler.afterConnectionClosed(takeover, org.springframework.web.socket.CloseStatus.NORMAL);
        var returned = connect("selected-returned");
        recover(returned, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        assertEquals("townsperson-10", latest(returned).path("players").get(0).path("avatarPreset").asText());
        send(returned, "{\"version\":1,\"type\":\"leave_room\"}");
        var fresh = connect("selected-fresh"); join(fresh, initial.path("roomId").asText());
        assertFalse(initial.path("selfPlayerId").equals(latest(fresh).path("selfPlayerId")));
        assertTrue(dev.lpa.pu_go.player.PublishedAvatars.IDS.contains(latest(fresh).path("players").get(1).path("avatarPreset").asText()));
        recover(returned, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        assertEquals("recovery_expired", latest(returned).path("code").asText());
    }

    @Test
    void simultaneousSelectionAndStartHaveOneConsistentRoomOrder() throws Exception {
        var host = connect("selection-race-host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        var initial = latest(host);
        var guest = connect("selection-race-guest"); join(guest, initial.path("roomId").asText());
        select(guest, "townsperson-1");
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        var barrier = new java.util.concurrent.CyclicBarrier(2);
        try {
            var start = executor.submit(() -> { barrier.await(); send(host, "{\"version\":1,\"type\":\"start_game\"}"); return null; });
            var selection = executor.submit(() -> { barrier.await(); select(guest, "townsperson-10"); return null; });
            start.get(5, java.util.concurrent.TimeUnit.SECONDS); selection.get(5, java.util.concurrent.TimeUnit.SECONDS);
        } finally { executor.shutdownNow(); }
        var started = latest(host);
        assertEquals("playing", started.path("phase").asText());
        boolean rejected = latest(guest).path("type").asText().equals("error");
        assertEquals(rejected ? "townsperson-1" : "townsperson-10", started.path("players").get(1).path("avatarPreset").asText());
        if (rejected) assertEquals("invalid_phase", latest(guest).path("code").asText());
        else assertEquals(started, latest(guest));
    }

    @Test
    void lobbySelectionsAreSharedCosmeticsAndStartLocksTheLastAcceptedChoice() throws Exception {
        var host = connect("select-host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        var initial = latest(host);
        var guest = connect("select-guest"); join(guest, initial.path("roomId").asText());
        var other = connect("select-other");
        send(other, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Other\"}");
        var otherBefore = latest(other);
        send(host, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        var before = latest(host).path("players").get(0);
        select(host, "townsperson-10");
        assertEquals("room_state", latest(host).path("type").asText());
        assertEquals(latest(host), latest(guest));
        var selected = latest(host).path("players").get(0);
        assertEquals("townsperson-10", selected.path("avatarPreset").asText());
        for (String field : List.of("playerId", "displayName", "colour", "seat", "ready", "connected", "x", "y", "facing", "sequence", "epoch"))
            assertEquals(before.path(field), selected.path(field), field);
        select(guest, "townsperson-10");
        assertEquals("townsperson-10", latest(host).path("players").get(1).path("avatarPreset").asText());
        select(host, "townsperson-8");
        assertEquals(otherBefore, latest(other));
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("townsperson-8", latest(guest).path("players").get(0).path("avatarPreset").asText());
        select(host, "townsperson-9");
        assertEquals("invalid_phase", latest(host).path("code").asText());
        var recovered = connect("select-recovered");
        recover(recovered, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        assertEquals("playing", latest(recovered).path("phase").asText());
        assertEquals("townsperson-8", latest(recovered).path("players").get(0).path("avatarPreset").asText());
    }

    private void select(RecordingWebSocketSession session, String preset) throws Exception {
        send(session, "{\"version\":1,\"type\":\"select_avatar\",\"avatarPreset\":\"" + preset + "\"}");
    }

    @Test
    void simultaneousReturnsAfterHostGracePublishOneAuthority() throws Exception {
        var host = connect("race-host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        var hostSnapshot = latest(host);
        var guest = connect("race-guest"); join(guest, hostSnapshot.path("roomId").asText());
        var guestSnapshot = latest(guest);
        handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
        handler.afterConnectionClosed(guest, org.springframework.web.socket.CloseStatus.NORMAL);
        milliseconds.addAndGet(15_000);
        var first = connect("race-first"); var second = connect("race-second");
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        var barrier = new java.util.concurrent.CyclicBarrier(2);
        try {
            var a = executor.submit(() -> { barrier.await(); recover(first, hostSnapshot.path("roomId").asText(), hostSnapshot.path("recoveryToken").asText()); return null; });
            var b = executor.submit(() -> { barrier.await(); recover(second, guestSnapshot.path("roomId").asText(), guestSnapshot.path("recoveryToken").asText()); return null; });
            a.get(5, java.util.concurrent.TimeUnit.SECONDS); b.get(5, java.util.concurrent.TimeUnit.SECONDS);
        } finally { executor.shutdownNow(); }
        assertEquals(latest(first).path("hostPlayerId"), latest(second).path("hostPlayerId"));
        assertEquals(2, latest(first).path("players").size());
        assertTrue(List.of(hostSnapshot.path("selfPlayerId"), guestSnapshot.path("selfPlayerId")).contains(latest(first).path("hostPlayerId")));
    }

    @Test
    void reachableRecoveryThenLeaveReleasesReservationWithoutRestoringIt() throws Exception {
        var original = connect("release-original");
        send(original, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        var initial = latest(original);
        var observer = connect("release-observer");
        join(observer, initial.path("roomId").asText());
        handler.afterConnectionClosed(original, org.springframework.web.socket.CloseStatus.NORMAL);
        var release = connect("release");
        recover(release, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        send(release, "{\"version\":1,\"type\":\"leave_room\"}");
        assertEquals("room_left", latest(release).path("type").asText());
        assertEquals(1, latest(observer).path("players").size());
        handler.afterConnectionClosed(release, org.springframework.web.socket.CloseStatus.NORMAL);
        var late = connect("release-late");
        recover(late, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        assertEquals("recovery_expired", latest(late).path("code").asText());
    }

    @Test
    void recoveryBeforeGracePreservesHostAndSkipsDisconnectedSuccessors() throws Exception {
        var host = connect("grace-host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        var initial = latest(host);
        var older = connect("older"); join(older, initial.path("roomId").asText());
        var connected = connect("connected"); join(connected, initial.path("roomId").asText());
        var connectedId = latest(connected).path("selfPlayerId");
        handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
        milliseconds.addAndGet(14_999);
        var returning = connect("grace-return");
        recover(returning, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        assertEquals(initial.path("selfPlayerId"), latest(returning).path("hostPlayerId"));
        handler.afterConnectionClosed(returning, org.springframework.web.socket.CloseStatus.NORMAL);
        handler.afterConnectionClosed(older, org.springframework.web.socket.CloseStatus.NORMAL);
        milliseconds.addAndGet(15_000); handler.expireMemberships();
        assertEquals(connectedId, latest(connected).path("hostPlayerId"));
    }

    @Test
    void firstReturnAfterAllDisconnectedGetsHostAndRetainsLobbyState() throws Exception {
        for (boolean hostFirst : List.of(true, false)) {
            var host = connect("all-host-" + hostFirst);
            send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
            var initial = latest(host);
            var guest = connect("all-guest-" + hostFirst);
            join(guest, initial.path("roomId").asText());
            var guestSnapshot = latest(guest);
            send(guest, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
            handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
            handler.afterConnectionClosed(guest, org.springframework.web.socket.CloseStatus.NORMAL);
            milliseconds.addAndGet(15_000);
            var first = connect("first-" + hostFirst);
            var identity = hostFirst ? initial : guestSnapshot;
            recover(first, initial.path("roomId").asText(), identity.path("recoveryToken").asText());
            assertEquals(identity.path("selfPlayerId"), latest(first).path("hostPlayerId"));
            assertEquals("lobby", latest(first).path("phase").asText());
            assertTrue(latest(first).path("players").get(1).path("ready").asBoolean());
            send(first, "{\"version\":1,\"type\":\"start_game\"}");
            var second = connect("second-" + hostFirst);
            var other = hostFirst ? guestSnapshot : initial;
            recover(second, initial.path("roomId").asText(), other.path("recoveryToken").asText());
            assertEquals(identity.path("selfPlayerId"), latest(second).path("hostPlayerId"));
            assertEquals("playing", latest(second).path("phase").asText());
            assertTrue(latest(second).path("players").get(0).path("seat").isNull());
            assertTrue(latest(second).path("players").get(1).path("seat").isNull());
        }
    }

    @Test
    void hostKeepsAuthorityUntilExactGraceDeadlineAndReturningHostDoesNotReclaimIt() throws Exception {
        var host = connect("host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        var initial = latest(host);
        var observer = connect("observer");
        send(observer, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + initial.path("roomId").asText() + "\",\"displayName\":\"Observer\"}");
        var observerId = latest(observer).path("selfPlayerId");
        handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
        milliseconds.addAndGet(14_999);
        handler.expireMemberships();
        assertEquals(initial.path("selfPlayerId"), latest(observer).path("hostPlayerId"));
        milliseconds.incrementAndGet();
        handler.expireMemberships();
        assertEquals(observerId, latest(observer).path("hostPlayerId"));
        var returning = connect("returning");
        recover(returning, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        assertEquals(observerId, latest(returning).path("hostPlayerId"));
    }

    @Test
    void recoveryTakesOverAnActiveSocketAndRetiresItsAuthority() throws Exception {
        var original = connect("original");
        send(original, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        var initial = latest(original);
        var replacement = connect("replacement");
        recover(replacement, initial.path("roomId").asText(), initial.path("recoveryToken").asText());
        assertEquals(initial.path("selfPlayerId"), latest(replacement).path("selfPlayerId"));
        assertEquals(4001, original.closeStatus().getCode());
        for (String payload : List.of(
                "{\"version\":1,\"type\":\"move_player\",\"x\":650,\"y\":360,\"facing\":\"right\",\"sequence\":1,\"epoch\":0}",
                "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}",
                "{\"version\":1,\"type\":\"start_game\"}",
                "{\"version\":1,\"type\":\"leave_room\"}")) send(original, payload);
        handler.afterConnectionClosed(original, org.springframework.web.socket.CloseStatus.NORMAL);
        send(replacement, "{\"version\":1,\"type\":\"set_ready\",\"ready\":false}");
        assertEquals("lobby", latest(replacement).path("phase").asText());
        assertEquals(1, latest(replacement).path("players").size());
        assertFalse(latest(replacement).path("players").get(0).path("ready").asBoolean(true));
    }

    @Test
    void closingDuringRecoveryAlwaysLeavesARecoverableDisconnectedMembership() throws Exception {
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        try {
            for (int attempt = 0; attempt < 100; attempt++) {
                var original = connect("original-" + attempt);
                send(original, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
                var initial = latest(original);
                String code = initial.path("roomId").asText();
                String token = initial.path("recoveryToken").asText();
                handler.afterConnectionClosed(original, org.springframework.web.socket.CloseStatus.NORMAL);
                var returning = connect("returning-" + attempt);
                var barrier = new java.util.concurrent.CyclicBarrier(2);
                var recovery = executor.submit(() -> { barrier.await(); recover(returning, code, token); return null; });
                var close = executor.submit(() -> { barrier.await(); handler.afterConnectionClosed(returning, org.springframework.web.socket.CloseStatus.NORMAL); return null; });
                recovery.get(5, java.util.concurrent.TimeUnit.SECONDS);
                close.get(5, java.util.concurrent.TimeUnit.SECONDS);
                var retry = connect("retry-" + attempt);
                recover(retry, code, token);
                assertEquals(initial.path("selfPlayerId"), latest(retry).path("selfPlayerId"));
            }
        } finally { executor.shutdownNow(); }
    }

    @Test
    void simultaneousRecoveryUsesOneReservedPlaceInAFullRoom() throws Exception {
        var host = connect("host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        var initial = latest(host);
        String code = initial.path("roomId").asText();
        String token = initial.path("recoveryToken").asText();
        for (int i = 0; i < 9; i++) join(connect("guest-" + i), code);
        handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
        var one = connect("one");
        var two = connect("two");
        var executor = java.util.concurrent.Executors.newFixedThreadPool(2);
        var barrier = new java.util.concurrent.CyclicBarrier(2);
        try {
            var a = executor.submit(() -> { barrier.await(); recover(one, code, token); return null; });
            var b = executor.submit(() -> { barrier.await(); recover(two, code, token); return null; });
            a.get(5, java.util.concurrent.TimeUnit.SECONDS);
            b.get(5, java.util.concurrent.TimeUnit.SECONDS);
        } finally { executor.shutdownNow(); }
        for (var connection : List.of(one, two)) {
            assertEquals(initial.path("selfPlayerId"), latest(connection).path("selfPlayerId"));
            assertEquals(10, latest(connection).path("players").size());
        }
        assertTrue(one.isOpen() != two.isOpen());
        assertEquals(4001, (one.isOpen() ? two : one).closeStatus().getCode());
    }

    @Test
    void invalidRecoveryCannotExtendExpiryAndLateSocketsCannotRemoveRecovery() throws Exception {
        var original = connect("original");
        send(original, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        var initial = latest(original);
        String code = initial.path("roomId").asText();
        String token = initial.path("recoveryToken").asText();
        handler.afterConnectionClosed(original, org.springframework.web.socket.CloseStatus.NORMAL);
        var invalid = connect("invalid");
        milliseconds.set(119_999);
        recover(invalid, code, "0".repeat(64));
        assertEquals("recovery_expired", latest(invalid).path("code").asText());
        var returning = connect("returning");
        recover(returning, code, token);
        assertEquals(initial.path("selfPlayerId"), latest(returning).path("selfPlayerId"));
        handler.afterConnectionClosed(original, org.springframework.web.socket.CloseStatus.NORMAL);
        send(original, "{\"version\":1,\"type\":\"leave_room\"}");
        send(returning, "{\"version\":1,\"type\":\"set_ready\",\"ready\":true}");
        org.junit.jupiter.api.Assertions.assertTrue(latest(returning).path("players").get(0).path("ready").asBoolean());
        handler.afterConnectionClosed(returning, org.springframework.web.socket.CloseStatus.NORMAL);
        milliseconds.set(239_999);
        recover(invalid, code, token);
        assertEquals("recovery_expired", latest(invalid).path("code").asText());
        milliseconds.set(539_999);
        join(invalid, code);
        assertEquals("room_not_found", latest(invalid).path("code").asText());
    }

    private void recover(RecordingWebSocketSession session, String code, String token) throws Exception {
        send(session, "{\"version\":1,\"type\":\"recover_room\",\"roomId\":\"" + code + "\",\"recoveryToken\":\"" + token + "\"}");
    }

    @Test
    void disconnectReservesAndRecoversTheSamePrivateMembership() throws Exception {
        var alex = connect("alex");
        send(alex, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        var initial = latest(alex);
        String code = initial.path("roomId").asText();
        String credential = initial.path("recoveryToken").asText();
        org.junit.jupiter.api.Assertions.assertTrue(credential.length() >= 32);
        var observer = connect("observer");
        join(observer, code);
        assertFalse(observer.payloads().toString().contains(credential));
        handler.afterConnectionClosed(alex, org.springframework.web.socket.CloseStatus.NORMAL);
        assertEquals("room_state", latest(observer).path("type").asText());
        assertFalse(latest(observer).path("players").get(0).path("connected").asBoolean(true));
        var returning = connect("returning");
        send(returning, "{\"version\":1,\"type\":\"recover_room\",\"roomId\":\"" + code + "\",\"recoveryToken\":\"" + credential + "\"}");
        assertEquals(initial.path("selfPlayerId"), latest(returning).path("selfPlayerId"));
        assertEquals(initial.path("players").get(0), latest(returning).path("players").get(0));
        assertEquals(2, latest(observer).path("players").size());
        org.junit.jupiter.api.Assertions.assertTrue(latest(observer).path("players").get(0).path("connected").asBoolean());
    }

    @Test
    void retainsFacingAndRejectsOutstandingMovementAfterCorrection() throws Exception {
        var alex = connect("alex");
        send(alex, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        String code = json(alex.payloads().get(0)).get("roomId").asText();
        send(alex, """
                {"version":1,"type":"start_game"}
                """);
        send(alex, """
                {"version":1,"type":"move_player","x":%d,"y":%d,"facing":"left","sequence":1,"epoch":0}
                """.formatted(FIRST_X, FIRST_Y));
        assertEquals("left", json(alex.payloads().get(2)).get("facing").asText());
        send(alex, """
                {"version":1,"type":"move_player","x":1200,"y":%d,"facing":"right","sequence":2,"epoch":0}
                """.formatted(FIRST_Y));
        JsonNode correction = json(alex.payloads().get(3));
        assertEquals("movement_correction", correction.get("type").asText());
        assertEquals(FIRST_X, correction.get("x").asDouble());
        assertEquals(1, correction.get("epoch").asInt());
        send(alex, """
                {"version":1,"type":"move_player","x":%d,"y":%d,"facing":"up","sequence":3,"epoch":0}
                """.formatted(FIRST_X + 10, FIRST_Y));
        assertEquals("movement_correction", json(alex.payloads().get(4)).get("type").asText());
        var sam = connect("sam");
        recover(sam, code, json(alex.payloads().get(0)).path("recoveryToken").asText());
        JsonNode retained = json(sam.payloads().get(0)).get("players").get(0);
        assertEquals(FIRST_X, retained.get("x").asDouble());
        assertEquals("left", retained.get("facing").asText());
        send(sam, """
                {"version":1,"type":"move_player","x":%d,"y":%d,"facing":"up","sequence":4,"epoch":1}
                """.formatted(FIRST_X + 10, FIRST_Y));
        assertEquals("up", json(sam.payloads().get(1)).get("facing").asText());
    }

    @Test
    void onlyCreateMakesRoomsAndJoinNormalizesCodes() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"ABC234\",\"displayName\":\"Alex\"}");
        assertEquals("room_not_found", json(alex.payloads().get(0)).get("code").asText());
        send(alex, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"  Alex  \"}");
        JsonNode snapshot = json(alex.payloads().get(1));
        String code = snapshot.get("roomId").asText();
        org.junit.jupiter.api.Assertions.assertTrue(code.matches("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}"));
        assertEquals("Alex", snapshot.get("players").get(0).get("displayName").asText());
        RecordingWebSocketSession sam = connect("session-2");
        send(sam, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\" " + code.toLowerCase() + " \",\"displayName\":\"Alex\"}");
        assertEquals(2, json(sam.payloads().get(0)).get("players").size());
    }

    @Test
    void joiningReturnsSnapshotAndAnnouncesThePlayerToExistingRoomMembers() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);

        JsonNode alexSnapshot = json(alex.payloads().get(0));
        assertEquals("room_snapshot", alexSnapshot.get("type").asText());
        assertEquals(1, alexSnapshot.get("version").asInt());
        assertEquals("player-1", alexSnapshot.get("selfPlayerId").asText());
        org.junit.jupiter.api.Assertions.assertTrue(alexSnapshot.get("roomId").asText().length() == 6);
        assertEquals("Alex", alexSnapshot.get("players").get(0).get("displayName").asText());

        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"%s","displayName":"Sam"}
                """.formatted(json(alex.payloads().get(0)).get("roomId").asText()));

        JsonNode joined = json(alex.payloads().get(1));
        assertEquals("player_joined", joined.get("type").asText());
        assertEquals("player-2", joined.get("player").get("playerId").asText());
        assertEquals(2, json(sam.payloads().get(0)).get("players").size());
    }

    @Test
    void avatarAssignmentIsSharedAndStableForTheRoomMembership() throws Exception {
        var alex = connect("alex");
        send(alex, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        JsonNode initial = json(alex.payloads().get(0));
        String code = initial.get("roomId").asText();
        String alexPreset = initial.get("players").get(0).get("avatarPreset").asText();
        org.junit.jupiter.api.Assertions.assertTrue(dev.lpa.pu_go.player.PublishedAvatars.IDS.contains(alexPreset));

        var sam = connect("sam");
        join(sam, code);
        JsonNode announcement = json(alex.payloads().get(1)).get("player");
        JsonNode samSnapshot = json(sam.payloads().get(0));
        for (JsonNode player : samSnapshot.get("players")) {
            String expected = player.get("playerId").asText().equals("player-1")
                    ? alexPreset : announcement.get("avatarPreset").asText();
            assertEquals(expected, player.get("avatarPreset").asText());
            org.junit.jupiter.api.Assertions.assertTrue(dev.lpa.pu_go.player.PublishedAvatars.IDS.contains(expected));
        }

        send(alex, "{\"version\":1,\"type\":\"start_game\"}");
        // Repeated Join is idempotent; failed room switches keep the current appearance.
        join(alex, code);
        join(alex, "AAAAAA".equals(code) ? "BBBBBB" : "AAAAAA");
        now.addAndGet(1_000_000_000L);
        send(alex, "{\"version\":1,\"type\":\"move_player\",\"facing\":\"right\",\"sequence\":1,\"epoch\":0,\"x\":650,\"y\":360}");
        join(alex, code);
        JsonNode finalSnapshot = json(alex.payloads().get(alex.payloads().size() - 1));
        for (JsonNode player : finalSnapshot.get("players")) {
            if (player.get("playerId").asText().equals("player-1")) {
                assertEquals(alexPreset, player.get("avatarPreset").asText());
                assertEquals(650, player.get("x").asDouble());
            }
        }
    }

    @Test
    void malformedOrIncompatibleMessagesAreRejectedAtTheProtocolBoundary() throws Exception {
        RecordingWebSocketSession session = connect("session-1");

        send(session, "{not json");
        send(session, """
                {"version":2,"type":"leave_room"}
                """);
        send(session, """
                {"version":1,"type":"leave_room","roomId":"smuggled-field"}
                """);

        assertEquals(List.of("malformed_message", "unsupported_version", "malformed_message"),
                session.payloads().stream().map(this::jsonUnchecked)
                        .map(node -> node.get("code").asText()).toList());
    }

    @Test
    void onlyFiniteInBoundsPlausibleMovementBecomesAuthoritative() throws Exception {
        RecordingWebSocketSession session = connect("session-1");
        send(session, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);

        send(session, "{\"version\":1,\"type\":\"start_game\"}");
        now.addAndGet(1_000_000_000L);
        send(session, """
                {"version":1,"type":"move_player","facing":"right","sequence":1,"epoch":0,"x":700,"y":360}
                """);
        send(session, """
                {"version":1,"type":"move_player","facing":"right","sequence":2,"epoch":0,"x":1200,"y":360}
                """);

        JsonNode accepted = json(session.payloads().get(2));
        assertEquals("player_moved", accepted.get("type").asText());
        assertEquals(700, accepted.get("x").asDouble());
        JsonNode rejected = json(session.payloads().get(3));
        assertEquals("movement_correction", rejected.get("type").asText());
        assertEquals(700, rejected.get("x").asDouble());
    }

    @Test
    void leavingIsAcknowledgedAndDoesNotMasqueradeAsDisconnecting() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"%s","displayName":"Sam"}
                """.formatted(json(alex.payloads().get(0)).get("roomId").asText()));

        send(sam, """
                {"version":1,"type":"leave_room"}
                """);

        JsonNode left = json(alex.payloads().get(2));
        assertEquals("player_left", left.get("type").asText());
        assertEquals("left", left.get("reason").asText());
        assertEquals("room_left", json(sam.payloads().get(1)).get("type").asText());

        handler.afterConnectionClosed(sam, org.springframework.web.socket.CloseStatus.NORMAL);
        assertEquals(3, alex.payloads().size());
    }

    @Test
    void disconnectRetainsMembershipAndNotifiesRemainingPlayers() throws Exception {
        RecordingWebSocketSession alex = connect("session-1");
        send(alex, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        RecordingWebSocketSession sam = connect("session-2");
        send(sam, """
                {"version":1,"type":"join_room","roomId":"%s","displayName":"Sam"}
                """.formatted(json(alex.payloads().get(0)).get("roomId").asText()));

        handler.afterConnectionClosed(sam, org.springframework.web.socket.CloseStatus.NORMAL);

        JsonNode left = json(alex.payloads().get(2));
        assertEquals("room_state", left.get("type").asText());
        assertEquals(2, left.path("players").size());
        assertFalse(left.path("players").get(1).path("connected").asBoolean(true));
    }

    @Test
    void roomReservesAllTenDistinctColoursUntilExactDisconnectExpiry() throws Exception {
        RecordingWebSocketSession first = connect("first");
        send(first, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        String code = json(first.payloads().get(0)).get("roomId").asText();
        RecordingWebSocketSession last = null;
        for (int i = 1; i < 10; i++) {
            last = connect("member-" + i);
            join(last, code);
        }
        java.util.Set<String> colours = new java.util.HashSet<>();
        json(last.payloads().get(0)).get("players").forEach(p -> colours.add(p.get("colour").asText()));
        assertEquals(10, colours.size());
        var occupants = json(last.payloads().get(0)).get("players");
        for (int i = 0; i < 10; i++) assertEquals(i, occupants.get(i).path("seat").asInt(-1));
        RecordingWebSocketSession eleventh = connect("eleventh");
        join(eleventh, code);
        assertEquals("room_full", json(eleventh.payloads().get(0)).get("code").asText());
        handler.afterConnectionClosed(first, org.springframework.web.socket.CloseStatus.NORMAL);
        join(eleventh, code);
        assertEquals("room_full", latest(eleventh).path("code").asText());
        milliseconds.set(119_999);
        join(eleventh, code);
        assertEquals("room_full", latest(eleventh).path("code").asText());
        milliseconds.set(120_000);
        join(eleventh, code);
        var recovered = latest(eleventh).get("players");
        assertEquals(10, recovered.size());
        assertEquals(1, recovered.get(0).path("seat").asInt(-1));
        assertEquals(0, recovered.get(9).path("seat").asInt(-1));
    }

    @Test
    void emptyRoomExpiresFiveMinutesAfterLastDeparture() throws Exception {
        RecordingWebSocketSession first = connect("first");
        send(first, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
        String code = json(first.payloads().get(0)).get("roomId").asText();
        send(first, "{\"version\":1,\"type\":\"leave_room\"}");
        milliseconds.set(299_999);
        join(first, code);
        assertEquals("room_snapshot", json(first.payloads().get(2)).get("type").asText());
        send(first, "{\"version\":1,\"type\":\"leave_room\"}");
        milliseconds.addAndGet(299_999);
        join(first, code);
        assertEquals("room_snapshot", json(first.payloads().get(4)).get("type").asText());
        send(first, "{\"version\":1,\"type\":\"leave_room\"}");
        milliseconds.addAndGet(300_000);
        join(first, code);
        assertEquals("room_not_found", json(first.payloads().get(6)).get("code").asText());
    }

    @Test
    void heartbeatRespondsAndNamesAreValidatedBeforeCreation() throws Exception {
        var session = connect("first");
        send(session, "{\"version\":1,\"type\":\"ping\"}");
        assertEquals("pong", json(session.payloads().get(0)).get("type").asText());
        for (String name : List.of("   ", "a".repeat(25))) {
            send(session, objectMapper.writeValueAsString(java.util.Map.of(
                    "version", 1, "type", "create_room", "displayName", name)));
            assertEquals("malformed_message", json(session.payloads().get(session.payloads().size() - 1)).get("code").asText());
        }
        send(session, objectMapper.writeValueAsString(java.util.Map.of(
                "version", 1, "type", "create_room", "displayName", "a".repeat(24))));
        assertEquals("room_snapshot", json(session.payloads().get(3)).get("type").asText());
    }

    @Test
    void creatorWaitsInLobbyAndCanStartAlone() throws Exception {
        var host = connect("host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        assertEquals("lobby", latest(host).path("phase").asText());
        assertEquals("player-1", latest(host).path("hostPlayerId").asText());
        send(host, "{\"version\":1,\"type\":\"move_player\",\"facing\":\"right\",\"sequence\":1,\"epoch\":0,\"x\":650,\"y\":360}");
        assertEquals("movement_correction", latest(host).path("type").asText());
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("room_state", latest(host).path("type").asText());
        assertEquals("playing", latest(host).path("phase").asText());
        assertEquals(640, latest(host).path("players").get(0).path("x").asDouble());
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        assertEquals("invalid_phase", latest(host).path("code").asText());
    }

    @Test
    void readinessIsSharedAndDoesNotGateHostStart() throws Exception {
        var host = connect("host");
        send(host, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        String code = latest(host).path("roomId").asText();
        assertFalse(latest(host).path("players").get(0).path("ready").asBoolean(true));
        var guest = connect("guest");
        join(guest, code);
        send(guest, """
                {"version":1,"type":"start_game"}
                """);
        assertEquals("not_host", latest(guest).path("code").asText());
        for (boolean ready : List.of(true, false)) {
            send(guest, """
                    {"version":1,"type":"set_ready","ready":%s}
                    """.formatted(ready));
            assertEquals("room_state", latest(host).path("type").asText());
            assertEquals(ready, latest(host).path("players").get(1).path("ready").asBoolean());
            assertEquals(latest(host), latest(guest));
        }
        send(host, """
                {"version":1,"type":"start_game"}
                """);
        assertEquals("playing", latest(host).path("phase").asText());
        assertEquals(latest(host), latest(guest));
        send(guest, """
                {"version":1,"type":"set_ready","ready":true}
                """);
        assertEquals("invalid_phase", latest(guest).path("code").asText());
        var late = connect("late");
        join(late, code);
        assertEquals("invalid_phase", latest(late).path("code").asText());
        assertEquals("Game already started", latest(late).path("message").asText());
    }

    @Test
    void hostDeparturePromotesLongestMembershipAndReturnDoesNotReclaimAuthority() throws Exception {
        for (boolean disconnect : List.of(false, true)) {
            var host = connect("host-" + disconnect);
            send(host, """
                    {"version":1,"type":"create_room","displayName":"Alex"}
                    """);
            String code = latest(host).path("roomId").asText();
            var next = connect("next-" + disconnect);
            join(next, code);
            String nextId = latest(next).path("selfPlayerId").asText();
            var third = connect("third-" + disconnect);
            join(third, code);
            send(next, """
                    {"version":1,"type":"set_ready","ready":true}
                    """);
            if (disconnect) {
                handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
                milliseconds.addAndGet(15_000);
                handler.expireMemberships();
            }
            else send(host, """
                    {"version":1,"type":"leave_room"}
                    """);
            assertEquals(nextId, latest(next).path("hostPlayerId").asText());
            assertEquals(latest(next), latest(third));
            var returning = connect("returning-" + disconnect);
            join(returning, code);
            var snapshot = latest(returning);
            assertEquals(nextId, snapshot.path("hostPlayerId").asText());
            int successorIndex = disconnect ? 1 : 0;
            int newcomerIndex = disconnect ? 3 : 2;
            assertEquals(1, snapshot.path("players").get(successorIndex).path("seat").asInt());
            org.junit.jupiter.api.Assertions.assertTrue(snapshot.path("players").get(successorIndex).path("ready").asBoolean());
            assertEquals(disconnect ? 3 : 0, snapshot.path("players").get(newcomerIndex).path("seat").asInt());
            assertFalse(snapshot.path("players").get(newcomerIndex).path("ready").asBoolean(true));
            send(returning, """
                    {"version":1,"type":"start_game"}
                    """);
            assertEquals("not_host", latest(returning).path("code").asText());
            send(next, """
                    {"version":1,"type":"start_game"}
                    """);
            assertEquals("playing", latest(third).path("phase").asText());
        }
    }

    @Test
    void rejectedStartedRoomEntryPreservesMembershipAndCannotBypassLeaveOrExpiry() throws Exception {
        var host = connect("closed-host");
        send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Host\"}");
        String code = latest(host).path("roomId").asText();
        var guest = connect("closed-guest");
        join(guest, code);
        var initial = latest(guest);
        handler.afterConnectionClosed(guest, org.springframework.web.socket.CloseStatus.NORMAL);
        send(host, "{\"version\":1,\"type\":\"start_game\"}");
        var returning = connect("closed-return");
        recover(returning, code, initial.path("recoveryToken").asText());
        var recovered = latest(returning);
        assertEquals("playing", recovered.path("phase").asText());
        assertEquals(initial.path("selfPlayerId"), recovered.path("selfPlayerId"));
        assertEquals(initial.path("players").get(1).path("avatarPreset"), recovered.path("players").get(1).path("avatarPreset"));
        join(returning, code);
        assertEquals(recovered, latest(returning));
        handler.afterConnectionClosed(returning, org.springframework.web.socket.CloseStatus.NORMAL);
        milliseconds.addAndGet(120_000);
        var expired = connect("closed-expired");
        recover(expired, code, initial.path("recoveryToken").asText());
        assertEquals("recovery_expired", latest(expired).path("code").asText());
        join(expired, code);
        assertEquals("invalid_phase", latest(expired).path("code").asText());
        send(expired, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Other\"}");
        var otherRoom = latest(expired);
        join(expired, code);
        assertEquals("invalid_phase", latest(expired).path("code").asText());
        join(expired, otherRoom.path("roomId").asText());
        assertEquals(otherRoom, latest(expired));
        send(host, "{\"version\":1,\"type\":\"leave_room\"}");
        join(host, code);
        assertEquals("room_not_found", latest(host).path("code").asText());
    }

    @Test
    void startedRoomRemainsRecoverableUntilFinalMembershipEndsThenIsRemoved() throws Exception {
        for (boolean expire : List.of(false, true)) {
            var host = connect("host-" + expire);
            send(host, "{\"version\":1,\"type\":\"create_room\",\"displayName\":\"Alex\"}");
            var initial = latest(host);
            String code = initial.path("roomId").asText();
            send(host, "{\"version\":1,\"type\":\"start_game\"}");
            handler.afterConnectionClosed(host, org.springframework.web.socket.CloseStatus.NORMAL);
            milliseconds.addAndGet(119_999);
            var returning = connect("returning-" + expire);
            recover(returning, code, initial.path("recoveryToken").asText());
            assertEquals("playing", latest(returning).path("phase").asText());
            assertEquals(initial.path("selfPlayerId"), latest(returning).path("selfPlayerId"));
            if (expire) {
                handler.afterConnectionClosed(returning, org.springframework.web.socket.CloseStatus.NORMAL);
                milliseconds.addAndGet(120_000);
                handler.expireMemberships();
            } else {
                send(returning, "{\"version\":1,\"type\":\"leave_room\"}");
                assertEquals("room_left", latest(returning).path("type").asText());
            }
            var newcomer = connect("newcomer-" + expire);
            join(newcomer, code);
            assertEquals("room_not_found", latest(newcomer).path("code").asText());
        }
    }

    @Test
    void queuedMovementCannotOvertakeHostSuccessionState() throws Exception {
        var tasks = new java.util.ArrayDeque<Runnable>();
        var serial = new GameWebSocketHandler(new RoomManager(milliseconds::get), tasks::add,
                () -> "queued-" + playerIds.incrementAndGet(), now::get);
        var host = new RecordingWebSocketSession("queued-host");
        var guest = new RecordingWebSocketSession("queued-guest");
        serial.afterConnectionEstablished(host);
        serial.afterConnectionEstablished(guest);
        serial.handleMessage(host, new TextMessage("""
                {"version":1,"type":"create_room","displayName":"Alex"}
                """));
        while (!tasks.isEmpty()) tasks.remove().run();
        String code = latest(host).path("roomId").asText();
        serial.handleMessage(guest, new TextMessage("""
                {"version":1,"type":"join_room","roomId":"%s","displayName":"Sam"}
                """.formatted(code)));
        serial.handleMessage(host, new TextMessage("""
                {"version":1,"type":"start_game"}
                """));
        while (!tasks.isEmpty()) tasks.remove().run();
        serial.handleMessage(guest, new TextMessage("""
                {"version":1,"type":"move_player","facing":"right","sequence":1,"epoch":0,"x":%d,"y":%d}
                """.formatted(SECOND_X + 10, SECOND_Y)));
        serial.handleMessage(host, new TextMessage("""
                {"version":1,"type":"leave_room"}
                """));
        serial.handleMessage(guest, new TextMessage("""
                {"version":1,"type":"move_player","facing":"right","sequence":2,"epoch":0,"x":%d,"y":%d}
                """.formatted(SECOND_X + 20, SECOND_Y)));
        while (!tasks.isEmpty()) tasks.remove().run();
        assertEquals("player_moved", latest(guest).path("type").asText());
        assertEquals(SECOND_X + 20, latest(guest).path("x").asDouble());
    }

    @Test
    void startAndDepartureHaveConsistentResultsInEitherOrder() throws Exception {
        for (boolean startFirst : List.of(true, false)) {
            var host = connect("ordered-host-" + startFirst);
            send(host, """
                    {"version":1,"type":"create_room","displayName":"Alex"}
                    """);
            String code = latest(host).path("roomId").asText();
            var guest = connect("ordered-guest-" + startFirst);
            join(guest, code);
            String guestId = latest(guest).path("selfPlayerId").asText();
            if (startFirst) send(host, """
                    {"version":1,"type":"start_game"}
                    """);
            send(host, """
                    {"version":1,"type":"leave_room"}
                    """);
            assertEquals(guestId, latest(guest).path("hostPlayerId").asText());
            assertEquals(startFirst ? "playing" : "lobby", latest(guest).path("phase").asText());
            send(host, """
                    {"version":1,"type":"start_game"}
                    """);
            assertEquals("not_in_room", latest(host).path("code").asText());
            send(guest, """
                    {"version":1,"type":"start_game"}
                    """);
            assertEquals(startFirst ? "invalid_phase" : "room_state",
                    latest(guest).path(startFirst ? "code" : "type").asText());
        }
    }

    @Test
    void lobbyControlsRejectForeignFieldsAndMalformedReadiness() throws Exception {
        var player = connect("unjoined");
        for (String message : List.of(
                "{\"version\":1,\"type\":\"set_ready\",\"ready\":true,\"playerId\":\"other\"}",
                "{\"version\":1,\"type\":\"set_ready\",\"ready\":1}",
                "{\"version\":1,\"type\":\"set_ready\"}",
                "{\"version\":1,\"type\":\"start_game\",\"roomId\":\"ABC234\"}")) {
            send(player, message);
            assertEquals("malformed_message", latest(player).path("code").asText());
        }
        send(player, """
                {"version":1,"type":"set_ready","ready":true}
                """);
        assertEquals("not_in_room", latest(player).path("code").asText());
    }

    @Test
    void startPlacesEveryPlayerAtItsOwnStandingPositionInsideTheRoom() throws Exception {
        var alex = connect("alex");
        send(alex, """
                {"version":1,"type":"create_room","displayName":"Alex"}
                """);
        String code = json(alex.payloads().get(0)).get("roomId").asText();
        for (int guest = 0; guest < 4; guest++) join(connect("guest-" + guest), code);
        send(alex, """
                {"version":1,"type":"start_game"}
                """);
        JsonNode players = latest(alex).path("players");
        assertEquals(5, players.size());
        var places = new java.util.HashSet<String>();
        for (JsonNode player : players) {
            assertTrue(player.path("x").asDouble() >= 0 && player.path("x").asDouble() <= RoomRules.WIDTH);
            assertTrue(player.path("y").asDouble() >= 0 && player.path("y").asDouble() <= RoomRules.HEIGHT);
            places.add(player.path("x").asText() + "," + player.path("y").asText());
        }
        // Duplicate appearances stay individually visible because nobody shares a standing position.
        assertEquals(5, places.size());
    }

    private JsonNode latest(RecordingWebSocketSession session) throws Exception {
        return json(session.payloads().get(session.payloads().size() - 1));
    }

    private void join(RecordingWebSocketSession session, String code) throws Exception {
        send(session, "{\"version\":1,\"type\":\"join_room\",\"roomId\":\"" + code + "\",\"displayName\":\"Alex\"}");
    }

    private RecordingWebSocketSession connect(String sessionId) throws Exception {
        RecordingWebSocketSession session = new RecordingWebSocketSession(sessionId);
        handler.afterConnectionEstablished(session);
        return session;
    }

    private void send(RecordingWebSocketSession session, String payload) throws Exception {
        handler.handleMessage(session, new TextMessage(payload));
    }

    private JsonNode json(String payload) throws Exception {
        return objectMapper.readTree(payload);
    }

    private JsonNode jsonUnchecked(String payload) {
        try {
            return json(payload);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }
}
