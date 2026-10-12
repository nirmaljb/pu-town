import type { MapId } from "./protocol.js";

export const TOWN_MAPS: readonly Readonly<{ id: MapId; name: string }>[] = [
  { id: "village", name: "Sunwater Village" },
  { id: "horror", name: "Blackthorn Hollow" },
  { id: "cyberpunk", name: "Silver Jubilee Campus" }
];
export function townName(id: MapId): string { return TOWN_MAPS.find(map => map.id === id)!.name; }
export function mapRoot(id: MapId): string { return `maps/${id}/`; }
