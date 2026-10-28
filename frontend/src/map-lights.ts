/** A lamp, hearth, window or the shrine's portal, from the map's `lights` layer. */
export type MapLight = Readonly<{ x: number; y: number; radius: number; color: number; flicker: boolean }>;

type LightObject = Readonly<{ x?: number; y?: number; properties?: unknown }>;

/** Reads the map's `lights` layer; Tiled keeps custom properties as a list of name/value pairs. */
export function mapLights(objects: readonly LightObject[]): MapLight[] {
  return objects.map(object => {
    const raw = object.properties;
    const props: Record<string, unknown> = Array.isArray(raw)
      ? Object.fromEntries((raw as { name: string; value: unknown }[]).map(p => [p.name, p.value]))
      : (raw as Record<string, unknown> | undefined) ?? {};
    const colour = typeof props.color === "string" ? props.color : "#ffc26b";
    return {
      x: object.x ?? 0, y: object.y ?? 0,
      radius: typeof props.radius === "number" ? props.radius : 160,
      color: Number.parseInt(colour.replace("#", "").slice(-6), 16),
      flicker: Boolean(props.flicker)
    };
  });
}
