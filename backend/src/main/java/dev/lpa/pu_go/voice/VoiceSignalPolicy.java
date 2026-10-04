package dev.lpa.pu_go.voice;

import com.google.protobuf.ByteString;
import com.google.protobuf.UnknownFieldSet;

import java.io.ByteArrayInputStream;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.GZIPInputStream;

/** Audio-only checks for the pinned LiveKit protocol, including v1 fast-publish Join. */
final class VoiceSignalPolicy {
    private static final int MAX_JOIN_BYTES = 256 * 1024;
    private VoiceSignalPolicy() {}

    static boolean allowsSignal(ByteString payload) {
        return allowsSignal(payload, true);
    }

    static boolean allowsSignal(ByteString payload, boolean canPublish) {
        try {
            var request = UnknownFieldSet.parseFrom(payload);
            // SignalRequest.add_track = 4; offer = 1.
            return audioTracks(request, 4, canPublish) && audioOffers(request, 1, canPublish);
        } catch (Exception ignored) { return false; }
    }

    static boolean allowsJoin(String encoded) {
        return allowsJoin(encoded, true);
    }

    static boolean allowsJoin(String encoded, boolean canPublish) {
        if (encoded == null) return true;
        try {
            if (encoded.length() > MAX_JOIN_BYTES) return false;
            byte[] raw = Base64.getUrlDecoder().decode(URLDecoder.decode(encoded, StandardCharsets.UTF_8));
            var wrapped = UnknownFieldSet.parseFrom(raw);
            long compression = value(wrapped, 1);
            if (compression != 0 && compression != 1) return false;
            for (ByteString body : wrapped.getField(2).getLengthDelimitedList()) {
                byte[] join = body.toByteArray();
                if (compression == 1) try (var input = new GZIPInputStream(new ByteArrayInputStream(join))) {
                    join = input.readNBytes(MAX_JOIN_BYTES + 1);
                }
                if (join.length > MAX_JOIN_BYTES) return false;
                var request = UnknownFieldSet.parseFrom(join);
                // JoinRequest.add_track_requests = 5; publisher_offer = 6.
                if (!audioTracks(request, 5, canPublish) || !audioOffers(request, 6, canPublish)) return false;
            }
            return true;
        } catch (Exception ignored) { return false; }
    }

    private static boolean audioTracks(UnknownFieldSet request, int field, boolean canPublish) throws java.io.IOException {
        for (ByteString body : request.getField(field).getLengthDelimitedList()) {
            var track = UnknownFieldSet.parseFrom(body);
            // AddTrackRequest.type = 3; TrackType.AUDIO = 0. Source is independently
            // enforced by LiveKit; a declared microphone does not imply audio type.
            if (!canPublish || value(track, 3) != 0) return false;
        }
        return true;
    }

    private static boolean audioOffers(UnknownFieldSet request, int field, boolean canPublish) throws java.io.IOException {
        for (ByteString body : request.getField(field).getLengthDelimitedList()) {
            var offer = UnknownFieldSet.parseFrom(body);
            // SDKs may pre-negotiate receive-only video sections. Reject sending
            // video, including SDP with the implicit default sendrecv direction.
            for (ByteString sdp : offer.getField(2).getLengthDelimitedList())
                if (sendsForbiddenMedia(sdp.toStringUtf8(), canPublish)) return false;
        }
        return true;
    }

    private static boolean sendsForbiddenMedia(String sdp, boolean canPublish) {
        String sessionDirection = "sendrecv";
        String direction = sessionDirection;
        boolean media = false;
        boolean forbiddenMedia = false;
        boolean directionSeen = false;
        for (String line : sdp.split("\\r?\\n")) {
            if (line.startsWith("m=")) {
                if (forbiddenMedia && !direction.equals("recvonly") && !direction.equals("inactive")) return true;
                String[] fields = line.substring(2).split("\\s+");
                forbiddenMedia = fields.length >= 2 && (fields[0].equals("video") || !canPublish && fields[0].equals("audio")) && !fields[1].equals("0");
                media = true;
                directionSeen = false;
                direction = sessionDirection;
            } else if (line.equals("a=recvonly") || line.equals("a=inactive") || line.equals("a=sendonly") || line.equals("a=sendrecv")) {
                // Duplicate SDP direction attributes are invalid and parser-dependent.
                if (directionSeen) return true;
                directionSeen = true;
                direction = line.substring(2);
                if (!media) sessionDirection = direction;
            }
        }
        return forbiddenMedia && !direction.equals("recvonly") && !direction.equals("inactive");
    }

    private static long value(UnknownFieldSet fields, int field) {
        var values = fields.getField(field).getVarintList();
        return values.isEmpty() ? 0 : values.get(values.size() - 1);
    }
}
