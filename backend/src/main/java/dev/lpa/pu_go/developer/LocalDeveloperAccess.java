package dev.lpa.pu_go.developer;

import org.springframework.http.HttpHeaders;
import java.net.InetSocketAddress;
import java.net.URI;

/** Fail closed even when a public reverse proxy connects from loopback. */
public final class LocalDeveloperAccess {
    public static final String NATIVE_VERSION_HEADER = "X-PUtown-Native-Version";
    private LocalDeveloperAccess() {}
    public static boolean permits(InetSocketAddress remote, URI uri, HttpHeaders headers) {
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()
                || uri == null || !localHost(uri.getHost()) || uri.getUserInfo() != null
                || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))) return false;
        for (String header : headers.headerNames()) {
            String name = header.toLowerCase(java.util.Locale.ROOT);
            if (name.equals("forwarded") || name.startsWith("x-forwarded-") || name.startsWith("tailscale-")
                    || name.equals("x-real-ip")) return false;
        }
        // The marker is a version assertion, not a credential: all direct-local checks above still apply.
        var nativeVersions = headers.get(NATIVE_VERSION_HEADER);
        if (nativeVersions != null)
            return nativeVersions.size() == 1 && "1".equals(nativeVersions.get(0)) && headers.get(HttpHeaders.ORIGIN) == null;
        try {
            var origins = headers.get(HttpHeaders.ORIGIN);
            if (origins == null || origins.size() != 1) return false;
            URI origin = URI.create(origins.get(0));
            return localHost(origin.getHost()) && ("http".equals(origin.getScheme()) || "https".equals(origin.getScheme()))
                    && origin.getUserInfo() == null && origin.getQuery() == null && origin.getFragment() == null
                    && (origin.getRawPath() == null || origin.getRawPath().isEmpty());
        } catch (IllegalArgumentException exception) { return false; }
    }
    private static boolean localHost(String host) {
        return "localhost".equals(host) || "127.0.0.1".equals(host) || "[::1]".equals(host) || "::1".equals(host);
    }
}
