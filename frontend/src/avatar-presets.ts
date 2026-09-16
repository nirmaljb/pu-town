/**
 * The Published Avatar Collection a Room pinned at creation. The client no longer bundles a
 * catalogue: it fetches the Room's own collection on join, because only then does it know
 * which Room — and so which collection — it needs.
 */

/** The backend's own preset identifier rule; membership is the Room's to decide, not ours. */
const PRESET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ARTWORK_PREFIX = "data:image/png;base64,";
// Entry must not stall behind a Room whose collection never arrives.
const COLLECTION_DEADLINE_MS = 10_000;

export type AvatarPreset = string;

export type PublishedAvatar = Readonly<{
  id: string;
  name: string;
  sprite: string;
  seatedSprite: string;
}>;

export type AvatarCollection = Readonly<{
  collectionId: string;
  presets: readonly PublishedAvatar[];
}>;

let active: AvatarCollection | null = null;

export function activeAvatarCollection(): AvatarCollection | null {
  return active;
}

export function setActiveAvatarCollection(collection: AvatarCollection | null): void {
  active = collection;
}

/**
 * Wire-level validation only. A snapshot can arrive before the collection does — creating a
 * Room yields its code in that very snapshot — so membership is left to the server, which
 * validates against the same collection this client is about to fetch.
 */
export function requireAvatarPreset(value: unknown): AvatarPreset {
  if (typeof value !== "string" || !PRESET_ID.test(value)) throw new Error("Invalid Avatar Preset");
  return value;
}

/** Outbound selection: never ask a Room for a preset outside the collection it offered. */
export function requireSelectableAvatarPreset(value: unknown): AvatarPreset {
  const preset = requireAvatarPreset(value);
  if (!active?.presets.some(published => published.id === preset)) throw new Error("Invalid Avatar Preset");
  return preset;
}

export function decodeAvatarCollection(body: unknown): AvatarCollection {
  const document = body as Record<string, unknown> | null;
  if (document === null || typeof document !== "object" || document.version !== 1) {
    throw new Error("Unsupported Avatar Collection");
  }
  const collectionId = document.collectionId;
  if (typeof collectionId !== "string" || collectionId.trim() === "") {
    throw new Error("Avatar Collection is unidentified");
  }
  if (!Array.isArray(document.presets) || document.presets.length === 0) {
    throw new Error("Avatar Collection holds no Avatar Presets");
  }
  const presets = document.presets.map(entry => decodePublishedAvatar(entry));
  if (new Set(presets.map(preset => preset.id)).size !== presets.length) {
    throw new Error("Duplicate Avatar Preset in the collection");
  }
  return { collectionId, presets };
}

function decodePublishedAvatar(value: unknown): PublishedAvatar {
  const preset = value as Record<string, unknown> | null;
  if (preset === null || typeof preset !== "object" || Array.isArray(preset)) {
    throw new Error("Invalid Avatar Preset");
  }
  const name = preset.name;
  // Names are counted in code points, as Display Names are.
  if (typeof name !== "string" || name.trim() === "" || [...name].length > 24) {
    throw new Error("Invalid Avatar Preset name");
  }
  // Artwork must be inline. A collection can never point this client at remote images.
  for (const artwork of [preset.sprite, preset.seatedSprite]) {
    if (typeof artwork !== "string" || !artwork.startsWith(ARTWORK_PREFIX)) {
      throw new Error("Incomplete Avatar Preset artwork");
    }
  }
  return {
    id: requireAvatarPreset(preset.id),
    name,
    sprite: preset.sprite as string,
    seatedSprite: preset.seatedSprite as string
  };
}

/** The collection endpoint sits beside the game WebSocket on the same backend. */
export function avatarCollectionUrl(websocketUrl: string, roomId: string): string {
  const url = new URL(websocketUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.search = "";
  url.hash = "";
  url.pathname = `/rooms/${encodeURIComponent(roomId)}/avatars`;
  return url.toString();
}

export async function fetchAvatarCollection(
  websocketUrl: string,
  roomId: string,
  request: typeof fetch = (...args) => fetch(...args)
): Promise<AvatarCollection> {
  const response = await request(avatarCollectionUrl(websocketUrl, roomId), {
    signal: AbortSignal.timeout(COLLECTION_DEADLINE_MS)
  });
  if (!response.ok) throw new Error(`The Room's Avatar Collection is unavailable (${response.status})`);
  return decodeAvatarCollection(await response.json());
}
