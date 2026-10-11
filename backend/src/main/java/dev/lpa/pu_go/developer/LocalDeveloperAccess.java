package dev.lpa.pu_go.developer;

import org.springframework.http.HttpHeaders;
import java.net.InetSocketAddress;
import java.net.URI;

/** Fail closed even when a public reverse proxy connects from loopback. */
public final class LocalDeveloperAccess {
    private LocalDeveloperAccess() {}
    public static boolean permits(InetSocketAddress remote, URI uri, HttpHeaders headers) {
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()
                || uri == null || !localHost(uri.getHost())) return false;
        for (String header : headers.headerNames()) {
            String name = header.toLowerCase(java.util.Locale.ROOT);
            if (name.equals("forwarded") || name.startsWith("x-forwarded-") || name.startsWith("tailscale-")) return false;
        }
        try {
            URI origin = URI.create(headers.getOrigin() == null ? "" : headers.getOrigin());
            return localHost(origin.getHost()) && ("http".equals(origin.getScheme()) || "https".equals(origin.getScheme()));
        } catch (IllegalArgumentException exception) { return false; }
    }
    private static boolean localHost(String host) {
        return "localhost".equals(host) || "127.0.0.1".equals(host) || "[::1]".equals(host) || "::1".equals(host);
    }
}
