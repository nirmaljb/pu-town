import collection from "./published-avatars.json" with { type: "json" };

/** Release artifact shared with the backend; drafts never enter this catalogue. */
export const PUBLISHED_AVATARS = collection.presets;
export const AVATAR_PRESETS: readonly string[] = PUBLISHED_AVATARS.map(preset => preset.id);
export type AvatarPreset = string;

export function requireAvatarPreset(value: unknown): AvatarPreset {
  if (typeof value !== "string" || !AVATAR_PRESETS.includes(value)) {
    throw new Error("Invalid Avatar Preset");
  }
  return value;
}
