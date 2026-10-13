package dev.lpa.pu_go.developer;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.Map;

@RestController
public final class DeveloperCapabilities {
    private final boolean enabled;
    public DeveloperCapabilities(@Value("${putown.developer.enabled:false}") boolean enabled) { this.enabled = enabled; }
    @GetMapping("/developer/capabilities")
    @CrossOrigin(origins = {"http://localhost:5173", "https://localhost:5173"})
    public Map<String, Boolean> capabilities(HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        java.util.Collections.list(request.getHeaderNames()).forEach(name ->
                java.util.Collections.list(request.getHeaders(name)).forEach(value -> headers.add(name, value)));
        if (!enabled || !LocalDeveloperAccess.permits(new InetSocketAddress(request.getRemoteAddr(), request.getRemotePort()),
                URI.create(request.getRequestURL().toString()), headers)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return Map.of("enabled", true);
    }
}
