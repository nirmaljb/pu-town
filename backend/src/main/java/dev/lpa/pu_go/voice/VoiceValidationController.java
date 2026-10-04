package dev.lpa.pu_go.voice;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@org.springframework.web.bind.annotation.CrossOrigin(origins = "${putown.allowed-origins:http://localhost:5173,https://localhost:5173}")
@RestController
public class VoiceValidationController {
    private final VoiceService voice;
    public VoiceValidationController(VoiceService voice) { this.voice = voice; }
    @GetMapping({"/voice/rtc/validate", "/voice/rtc/v1/validate"})
    public ResponseEntity<Void> validate(@RequestParam(name = "access_token", required = false) String token) {
        return ResponseEntity.status(voice.authorize(token) == null ? 403 : 200).build();
    }
}
