package dev.lpa.pu_go.health;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    public record HealthStatusResponse(String status) {}

    @GetMapping("/health")
    public HealthStatusResponse index() {
        return new HealthStatusResponse("healthy");
    }
}
