package dev.lpa.pu_go.avatar;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Reads the publication file the authoring tool writes. Rooms resolve a collection here
 * when they are created, so Publishing reaches the next Room without a rebuild or restart.
 */
@Component
public class PublishedAvatars implements AvatarCollections {
    private static final Pattern PRESET_ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,63}");
    private static final String ARTWORK_PREFIX = "data:image/png;base64,";
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    private static final Pattern UNITY_VERSION = Pattern.compile("[0-9]+\\.[0-9]+\\.[0-9]+[abfp][0-9]+");
    private final Path publication;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private AvatarCollection collection;
    private long loadedFrom = -1;
    private long loadedSize = -1;
    private Object loadedFileKey;

    public PublishedAvatars(@Value("${putown.avatars.publication:data/published-avatars.json}") Path publication) {
        this.publication = publication;
    }

    /** A publication that cannot be read is a startup failure, not a first-Room surprise. */
    @PostConstruct
    void requireReadablePublication() {
        current();
    }

    @Override
    public synchronized AvatarCollection current() {
        try {
            BasicFileAttributes attributes = Files.readAttributes(publication, BasicFileAttributes.class);
            long modified = attributes.lastModifiedTime().toMillis();
            long size = attributes.size();
            // Atomic publication replaces the inode, even when its size and timestamp match.
            // Filesystems without a file key are reread rather than missing a valid replacement.
            Object fileKey = attributes.fileKey();
            if (collection == null || fileKey == null || !Objects.equals(fileKey, loadedFileKey)
                    || modified != loadedFrom || size != loadedSize) {
                collection = read(Files.readAllBytes(publication));
                loadedFrom = modified;
                loadedSize = size;
                loadedFileKey = fileKey;
            }
        } catch (Exception exception) {
            // A running game keeps serving the last good collection; only a cold start fails.
            if (collection == null)
                throw new IllegalStateException("Cannot load published Avatar Collection from " + publication, exception);
        }
        return collection;
    }

    private AvatarCollection read(byte[] published) {
        JsonNode document = objectMapper.readTree(published);
        JsonNode presets = document.path("presets");
        int version = document.path("version").asInt();
        if (!document.path("version").isIntegralNumber() || (version != 1 && version != 2)
                || !presets.isArray() || presets.isEmpty())
            throw new IllegalStateException("Publish at least one Avatar Preset");
        if (version == 2) requireFields(document, Set.of("version", "presets"));
        List<AvatarPreset> collected = new ArrayList<>();
        for (JsonNode preset : presets) {
            String id = preset.path("id").asText();
            String name = preset.path("name").asText();
            String sprite = preset.has("sprite") ? preset.path("sprite").asText() : null;
            String seatedSprite = preset.has("seatedSprite") ? preset.path("seatedSprite").asText() : null;
            // Names are counted in code points, as Display Names are.
            if (!preset.path("id").isString() || !preset.path("name").isString()
                    || !PRESET_ID.matcher(id).matches() || name.isBlank()
                    || name.codePointCount(0, name.length()) > 24
                    || ((version == 1 || sprite != null || seatedSprite != null)
                        && (sprite == null || seatedSprite == null || !sprite.startsWith(ARTWORK_PREFIX)
                            || !seatedSprite.startsWith(ARTWORK_PREFIX))))
                throw new IllegalStateException("Incomplete published Avatar Preset: " + id);
            NativeAvatar nativeRepresentation = null;
            if (version == 2) {
                requireFields(preset, sprite == null ? Set.of("id", "name", "native")
                        : Set.of("id", "name", "sprite", "seatedSprite", "native"));
                nativeRepresentation = readNative(preset.path("native"));
            }
            collected.add(new AvatarPreset(id, name, sprite, seatedSprite, nativeRepresentation));
        }
        if (new HashSet<>(collected.stream().map(AvatarPreset::id).toList()).size() != collected.size())
            throw new IllegalStateException("Duplicate published Avatar Preset");
        return new AvatarCollection(identify(published), collected);
    }

    private static NativeAvatar readNative(JsonNode nativeAvatar) {
        requireFields(nativeAvatar, Set.of("version", "masterId", "masterRevision", "model", "rig", "animations", "platformAssets"));
        if (!nativeAvatar.path("version").isIntegralNumber() || nativeAvatar.path("version").asInt() != 1)
            throw new IllegalStateException("Unsupported native Avatar version");
        String masterId = text(nativeAvatar, "masterId");
        if (!PRESET_ID.matcher(masterId).matches()) throw new IllegalStateException("Invalid native Avatar master ID");
        JsonNode revision = nativeAvatar.path("masterRevision");
        if (!revision.isIntegralNumber() || revision.asLong() < 1 || revision.asLong() > Integer.MAX_VALUE)
            throw new IllegalStateException("Invalid native Avatar master revision");
        JsonNode model = nativeAvatar.path("model");
        requireFields(model, Set.of("sourceSha256", "rootNode", "heightMetres", "pivot", "forwardAxis"));
        String sourceSha256 = text(model, "sourceSha256");
        if (!SHA256.matcher(sourceSha256).matches() || !text(model, "pivot").equals("feet")
                || !text(model, "forwardAxis").equals("+z"))
            throw new IllegalStateException("Invalid native Avatar model convention");
        double height = positiveNumber(model, "heightMetres");
        JsonNode rig = nativeAvatar.path("rig");
        requireFields(rig, Set.of("type", "avatarName", "hipsBone"));
        if (!text(rig, "type").equals("humanoid")) throw new IllegalStateException("Unsupported native Avatar rig");
        JsonNode animations = nativeAvatar.path("animations");
        requireFields(animations, Set.of("standing", "walking", "seated"));
        NativeAvatar.Animations clips = new NativeAvatar.Animations(readClip(animations.path("standing")),
                readClip(animations.path("walking")), readClip(animations.path("seated")));
        JsonNode platformAssets = nativeAvatar.path("platformAssets");
        if (!platformAssets.isArray() || platformAssets.size() != 2)
            throw new IllegalStateException("Publish native Avatar assets for Windows and macOS");
        List<NativeAvatar.PlatformAsset> assets = new ArrayList<>();
        Set<String> platforms = new HashSet<>();
        for (JsonNode asset : platformAssets) {
            requireFields(asset, Set.of("platform", "format", "unityVersion", "assetName", "sha256", "byteLength", "data"));
            String platform = text(asset, "platform");
            String unityVersion = text(asset, "unityVersion");
            if (!Set.of("windows-x86_64", "macos-universal").contains(platform) || !platforms.add(platform)
                    || !text(asset, "format").equals("unity-assetbundle") || !UNITY_VERSION.matcher(unityVersion).matches())
                throw new IllegalStateException("Invalid native Avatar platform asset");
            String sha256 = text(asset, "sha256");
            JsonNode length = asset.path("byteLength");
            if (!SHA256.matcher(sha256).matches() || !length.isIntegralNumber() || length.asLong() < 8
                    || length.asLong() > 64L * 1024 * 1024)
                throw new IllegalStateException("Invalid native Avatar asset integrity descriptor");
            String data = text(asset, "data", 90 * 1024 * 1024);
            byte[] bytes = Base64.getDecoder().decode(data);
            if (bytes.length != length.asLong() || !sha256.equals(digest(bytes))
                    || !new String(bytes, 0, Math.min(8, bytes.length), StandardCharsets.US_ASCII).equals("UnityFS\0"))
                throw new IllegalStateException("Native Avatar platform asset failed integrity validation");
            assets.add(new NativeAvatar.PlatformAsset(platform, "unity-assetbundle", unityVersion,
                    text(asset, "assetName"), sha256, bytes.length, data));
        }
        if (!assets.get(0).unityVersion().equals(assets.get(1).unityVersion()))
            throw new IllegalStateException("Native Avatar platform assets must share a Unity version");
        return new NativeAvatar(1, masterId, revision.asInt(),
                new NativeAvatar.Model(sourceSha256, text(model, "rootNode"), height, "feet", "+z"),
                new NativeAvatar.Rig("humanoid", text(rig, "avatarName"), text(rig, "hipsBone")), clips, assets);
    }

    private static NativeAvatar.Clip readClip(JsonNode clip) {
        requireFields(clip, Set.of("clipName", "durationSeconds", "loop"));
        if (!clip.path("loop").isBoolean() || !clip.path("loop").asBoolean())
            throw new IllegalStateException("Native Avatar standing, walking and seated clips must loop");
        return new NativeAvatar.Clip(text(clip, "clipName"), positiveNumber(clip, "durationSeconds"), true);
    }

    private static double positiveNumber(JsonNode object, String field) {
        JsonNode value = object.path(field);
        if (!value.isNumber() || !Double.isFinite(value.asDouble()) || value.asDouble() <= 0)
            throw new IllegalStateException("Invalid native Avatar " + field);
        return value.asDouble();
    }

    private static String text(JsonNode object, String field) { return text(object, field, 512); }

    private static String text(JsonNode object, String field, int limit) {
        JsonNode value = object.path(field);
        if (!value.isString() || value.asText().isBlank() || value.asText().length() > limit)
            throw new IllegalStateException("Invalid native Avatar " + field);
        return value.asText();
    }

    private static void requireFields(JsonNode object, Set<String> fields) {
        if (!object.isObject() || !object.propertyNames().equals(fields))
            throw new IllegalStateException("Incomplete or unknown native Avatar fields");
    }

    private static String digest(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    /** Content-derived, so a Room's pinned collection is nameable without a release counter. */
    private static String identify(byte[] published) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(published);
            return HexFormat.of().formatHex(digest, 0, 8);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
