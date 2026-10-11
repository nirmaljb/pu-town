package dev.lpa.pu_go.developer;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import java.net.InetSocketAddress;
import java.net.URI;
import static org.junit.jupiter.api.Assertions.*;

class DeveloperHandshakeTest {
    @Test
    void localBrowserIsRecognizedButProxyRemoteAndMalformedOriginsFailClosed() {
        var remote = new InetSocketAddress("127.0.0.1", 9999);
        var uri = URI.create("http://localhost:8080/ws/game");
        var headers = new HttpHeaders(); headers.setOrigin("http://localhost:5173");
        assertTrue(LocalDeveloperAccess.permits(remote, uri, headers));
        assertFalse(LocalDeveloperAccess.permits(new InetSocketAddress("192.0.2.1", 9999), uri, headers));
        assertFalse(LocalDeveloperAccess.permits(remote, URI.create("https://public.ts.net/ws/game"), headers));
        for (String name : new String[]{"Forwarded", "X-Forwarded-Host", "X-Forwarded-For", "Tailscale-User-Login"}) {
            headers.add(name, "localhost"); assertFalse(LocalDeveloperAccess.permits(remote, uri, headers)); headers.remove(name);
        }
        for (String origin : new String[]{"https://public.ts.net", "null", "//localhost", "invalid origin", ""}) {
            headers.setOrigin(origin); assertFalse(LocalDeveloperAccess.permits(remote, uri, headers));
        }
    }
}
