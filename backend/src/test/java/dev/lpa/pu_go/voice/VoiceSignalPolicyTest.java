package dev.lpa.pu_go.voice;

import com.google.protobuf.ByteString;
import com.google.protobuf.UnknownFieldSet;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.zip.GZIPOutputStream;

import static org.junit.jupiter.api.Assertions.*;

class VoiceSignalPolicyTest {
    private static ByteString nested(int field, ByteString body) {
        return UnknownFieldSet.newBuilder().addField(field,
                UnknownFieldSet.Field.newBuilder().addLengthDelimited(body).build()).build().toByteString();
    }
    private static ByteString track(int type) {
        return UnknownFieldSet.newBuilder().addField(3,
                UnknownFieldSet.Field.newBuilder().addVarint(type).build()).build().toByteString();
    }
    private static ByteString offer(String sdp) { return nested(1, nested(2, ByteString.copyFromUtf8(sdp))); }

    @Test void rejectsVideoTypeRegardlessOfDeclaredSource() {
        assertTrue(VoiceSignalPolicy.allowsSignal(nested(4, track(0))));
        assertFalse(VoiceSignalPolicy.allowsSignal(nested(4, track(1))));
    }
    @Test void acceptsReceiveOnlySdkSectionsButRejectsSendingAndInheritedDirections() {
        assertTrue(VoiceSignalPolicy.allowsSignal(offer("v=0\r\nm=video 9 RTP/AVP 96\r\na=recvonly\r\nm=audio 9 RTP/AVP 111\r\na=sendrecv\r\n")));
        assertTrue(VoiceSignalPolicy.allowsSignal(offer("v=0\r\na=inactive\r\nm=video 9 RTP/AVP 96\r\n")));
        assertFalse(VoiceSignalPolicy.allowsSignal(offer("v=0\r\nm=video 9 RTP/AVP 96\r\n")));
        assertFalse(VoiceSignalPolicy.allowsSignal(offer("v=0\r\nm=video 9 RTP/AVP 96\r\na=sendrecv\r\na=recvonly\r\n")));
        assertFalse(VoiceSignalPolicy.allowsSignal(offer("v=0\r\na=recvonly\r\nm=video 9 RTP/AVP 96\r\na=sendonly\r\n")));
        assertFalse(VoiceSignalPolicy.allowsSignal(offer("v=0\r\nm=video 9 RTP/AVP 96\r\na=sendrecv\r\nm=audio 9 RTP/AVP 111\r\n")));
    }
    @Test void checksFastPublishInsidePlainAndGzipJoin() throws Exception {
        for (int type : new int[]{0, 1}) for (int compression : new int[]{0, 1}) {
            byte[] body = nested(5, track(type)).toByteArray();
            if (compression == 1) {
                var out = new ByteArrayOutputStream();
                try (var gzip = new GZIPOutputStream(out)) { gzip.write(body); }
                body = out.toByteArray();
            }
            var wrapped = UnknownFieldSet.newBuilder().addField(1, UnknownFieldSet.Field.newBuilder().addVarint(compression).build())
                    .addField(2, UnknownFieldSet.Field.newBuilder().addLengthDelimited(ByteString.copyFrom(body)).build()).build();
            assertEquals(type == 0, VoiceSignalPolicy.allowsJoin(Base64.getUrlEncoder().encodeToString(wrapped.toByteArray())));
        }
        assertFalse(VoiceSignalPolicy.allowsJoin("malformed!"));
    }
}
