package dev.lpa.pu_go.developer;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import java.net.InetSocketAddress;
import java.net.URI;
import static org.junit.jupiter.api.Assertions.*;

class DeveloperHandshakeTest {
    @Test
    void directLocalNativeVersionOneNeedsNoOriginButStillRejectsForwardingAndPublicAuthority() {
        var local = new InetSocketAddress("127.0.0.1", 9999);
        var endpoint = URI.create("http://127.0.0.1:8080/ws/game");
        var headers = new HttpHeaders();
        headers.set("X-PUtown-Native-Version", "1");
        assertTrue(LocalDeveloperAccess.permits(local, endpoint, headers));
        assertTrue(LocalDeveloperAccess.permits(new InetSocketAddress("::1", 9999), URI.create("http://[::1]:8080/ws/game"), headers));
        assertFalse(LocalDeveloperAccess.permits(InetSocketAddress.createUnresolved("localhost", 9999), endpoint, headers));
        assertFalse(LocalDeveloperAccess.permits(new InetSocketAddress("192.0.2.1", 9999), endpoint, headers));
        assertFalse(LocalDeveloperAccess.permits(local, URI.create("http://public.example/ws/game"), headers));
        for (String name : new String[]{"Forwarded", "X-Forwarded-Host", "X-Forwarded-For", "X-Forwarded-Proto", "Tailscale-User-Login", "X-Real-IP"}) {
            headers.add(name, "localhost"); assertFalse(LocalDeveloperAccess.permits(local, endpoint, headers)); headers.remove(name);
        }
        headers.setOrigin("http://localhost:5173");
        assertFalse(LocalDeveloperAccess.permits(local, endpoint, headers), "Native entry has an explicit absent-Origin contract");
        headers.remove(HttpHeaders.ORIGIN);
        for (String version : new String[]{"", "0", "2", "1, 1", " 1"}) {
            headers.set("X-PUtown-Native-Version", version);
            assertFalse(LocalDeveloperAccess.permits(local, endpoint, headers));
        }
        headers.set("X-PUtown-Native-Version", "1"); headers.add("X-PUtown-Native-Version", "1");
        assertFalse(LocalDeveloperAccess.permits(local, endpoint, headers));
        headers.remove("X-PUtown-Native-Version");
        assertFalse(LocalDeveloperAccess.permits(local, endpoint, headers), "A local connection alone cannot claim native developer access");
    }

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
        for (String origin : new String[]{"https://public.ts.net", "null", "//localhost", "invalid origin", "", "http://localhost/path", "http://localhost?query", "http://localhost#fragment", "http://name@localhost"}) {
            headers.setOrigin(origin); assertFalse(LocalDeveloperAccess.permits(remote, uri, headers));
        }
        headers.setOrigin("http://localhost:5173"); headers.add(HttpHeaders.ORIGIN,"http://localhost:5173");
        assertFalse(LocalDeveloperAccess.permits(remote,uri,headers));
    }
}
