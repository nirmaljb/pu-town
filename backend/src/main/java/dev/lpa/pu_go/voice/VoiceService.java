package dev.lpa.pu_go.voice;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;

/** LiveKit credentials never authorize admission without a current Game connection. */
@Component
public class VoiceService {
    public record Grant(String identity, String room, String playerId, boolean canPublish, String speakerId, BooleanSupplier allowed) {}
    private final Map<String, String> initialTokens = new ConcurrentHashMap<>();
    private final Map<String, Grant> grants = new ConcurrentHashMap<>();
    private final Map<String, Runnable> signals = new ConcurrentHashMap<>();
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final String gatewaySecret = UUID.randomUUID().toString() + UUID.randomUUID();
    private final String server;
    private final String key;
    private final String secret;

    public VoiceService(@Value("${putown.voice.server:http://127.0.0.1:7880}") String server,
                        @Value("${putown.voice.key:}") String key,
                        @Value("${putown.voice.secret:}") String secret) {
        this.server = server; this.key = key; this.secret = secret;
    }

    public boolean enabled() { return !key.isBlank() && secret.length() >= 32; }

    public String issue(String room, String playerId, boolean canPublish, BooleanSupplier allowed) {
        revokePlayer(playerId);
        String identity = UUID.randomUUID().toString();
        Grant grant = new Grant(identity, room, playerId, canPublish, null, allowed);
        grants.put(identity, grant);
        return gatewayToken(grant);
    }

    /** A Day publisher has one isolated room; listeners receive separate, hidden identities. */
    public String issueDayPublication(String room, String playerId, BooleanSupplier allowed) {
        revokePlayer(playerId);
        Grant grant = new Grant(UUID.randomUUID().toString(), room, playerId, true, playerId, allowed);
        grants.put(grant.identity(), grant);
        return initialToken(grant);
    }

    public boolean hasDayPublication(String playerId) {
        return grants.values().stream().anyMatch(g -> g.playerId().equals(playerId)
                && playerId.equals(g.speakerId()) && g.canPublish() && g.allowed().getAsBoolean());
    }

    public String dayListenerToken(String room, String playerId, String speakerId, BooleanSupplier allowed) {
        Grant grant = grants.values().stream().filter(g -> g.room().equals(room) && g.playerId().equals(playerId)
                && speakerId.equals(g.speakerId()) && !g.canPublish()).findFirst().orElse(null);
        if (grant == null) {
            grant = new Grant(UUID.randomUUID().toString(), room, playerId, false, speakerId, allowed);
            grants.put(grant.identity(), grant);
        }
        return initialToken(grant);
    }

    private String initialToken(Grant grant) {
        return initialTokens.computeIfAbsent(grant.identity(), ignored -> gatewayToken(grant));
    }

    public String gatewayToken(Grant grant) { return sign(claimsOf(grant), gatewaySecret); }
    public String mediaToken(Grant grant) { return sign(claimsOf(grant), secret); }
    private static Map<String, Object> claimsOf(Grant grant) {
        return Map.of("sub", grant.identity(), "name", grant.canPublish() ? grant.playerId() : "", "video", Map.of("room", grant.room(), "roomJoin", true,
                "canPublish", grant.canPublish(), "canSubscribe", grant.speakerId() == null || !grant.canPublish(), "canPublishData", false,
                "hidden", grant.speakerId() != null && !grant.canPublish(),
                "canPublishSources", grant.canPublish() ? List.of("microphone") : List.of(), "canUpdateOwnMetadata", false));
    }

    public Grant authorize(String token) {
        if (!enabled() || token == null || token.length() > 8192) return null;
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3 || !MessageDigest.isEqual(hmac(parts[0] + "." + parts[1], gatewaySecret), Base64.getUrlDecoder().decode(parts[2]))) return null;
            var claims = json.readTree(Base64.getUrlDecoder().decode(parts[1]));
            if (!key.equals(claims.path("iss").asText()) || claims.path("exp").asLong() <= System.currentTimeMillis() / 1000) return null;
            Grant grant = grants.get(claims.path("sub").asText());
            return grant != null && grant.room().equals(claims.path("video").path("room").asText()) && grant.allowed().getAsBoolean() ? grant : null;
        } catch (Exception ignored) { return null; }
    }

    /** Revocation is latched: refreshed self-hosted tokens cannot restore a removed grant. */
    public void revokePlayer(String playerId) {
        grants.values().stream().filter(g -> g.playerId().equals(playerId)).toList().forEach(this::revoke);
    }

    public List<String> revokeInvalid(String room) {
        var invalid = grants.values().stream().filter(g -> g.room().startsWith("pu-" + room + "-") && !g.allowed().getAsBoolean()).toList();
        invalid.forEach(this::revoke);
        return invalid.stream().filter(g -> g.speakerId() == null || g.canPublish()).map(Grant::playerId).distinct().toList();
    }

    public void revoke(Grant grant) {
        if (!grants.remove(grant.identity(), grant)) return;
        initialTokens.remove(grant.identity());
        // Never perform signal socket writes or media HTTP calls under the Room lock.
        worker.execute(() -> remove(grant));
    }

    private void remove(Grant grant) {
        Runnable close = signals.remove(grant.identity());
        if (close != null) close.run();
        try {
            String token = sign(Map.of("video", Map.of("room", grant.room(), "roomAdmin", true)));
            HttpRequest request = HttpRequest.newBuilder(URI.create(server + "/twirp/livekit.RoomService/RemoveParticipant"))
                    .timeout(Duration.ofSeconds(2)).header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("room", grant.room(), "identity", grant.identity())))).build();
            int status = http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status != 200 && status != 404) worker.schedule(() -> remove(grant), 1, TimeUnit.SECONDS);
        } catch (Exception ignored) { worker.schedule(() -> remove(grant), 1, TimeUnit.SECONDS); }
    }

    public void attach(Grant grant, Runnable close) {
        Runnable previous = signals.put(grant.identity(), close);
        if (previous != null) previous.run();
        if (!grants.containsKey(grant.identity()) || !grant.allowed().getAsBoolean()) {
            signals.remove(grant.identity(), close); close.run();
        }
    }

    public URI upstream(String path, String query) {
        return URI.create(server.replaceFirst("^http", "ws") + path + "?" + query);
    }

    private String sign(Map<String, Object> claims) { return sign(claims, secret); }
    private String sign(Map<String, Object> claims, String signingSecret) {
        var payload = new java.util.HashMap<>(claims);
        long now = System.currentTimeMillis() / 1000;
        payload.put("iss", key); payload.put("nbf", now - 5); payload.put("exp", now + 300);
        String input = encode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8)) + "." + encode(json.writeValueAsBytes(payload));
        return input + "." + encode(hmac(input, signingSecret));
    }

    private byte[] hmac(String input, String signingSecret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(input.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { throw new IllegalStateException("Cannot sign media credentials", e); }
    }
    private static String encode(byte[] value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value); }
    @PreDestroy public void stop() { worker.shutdownNow(); }
}
