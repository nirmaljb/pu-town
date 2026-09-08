export const AVATAR_PRESETS = ["townsperson-1", "townsperson-2", "townsperson-3", "townsperson-4", "townsperson-5", "townsperson-6"] as const;
export type AvatarPreset = typeof AVATAR_PRESETS[number];

export function requireAvatarPreset(value: unknown): AvatarPreset {
  if (typeof value !== "string" || !AVATAR_PRESETS.includes(value as AvatarPreset)) {
    throw new Error("Invalid Avatar Preset");
  }
  return value as AvatarPreset;
}
