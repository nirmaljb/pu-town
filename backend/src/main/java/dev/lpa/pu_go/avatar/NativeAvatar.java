package dev.lpa.pu_go.avatar;

import java.util.List;

/** Versioned native representation. Bundled bytes stay with the Room's pinned collection. */
public record NativeAvatar(int version, String masterId, int masterRevision, Model model, Rig rig,
                           Animations animations, List<PlatformAsset> platformAssets) {
    public NativeAvatar {
        platformAssets = List.copyOf(platformAssets);
    }

    public record Model(String sourceSha256, String rootNode, double heightMetres, String pivot, String forwardAxis) {}
    public record Rig(String type, String avatarName, String hipsBone) {}
    public record Clip(String clipName, double durationSeconds, boolean loop) {}
    public record Animations(Clip standing, Clip walking, Clip seated) {}
    public record PlatformAsset(String platform, String format, String unityVersion, String assetName,
                                String sha256, long byteLength, String data) {}
}
