export const BACKEND_PORT = Number(process.env.PU_TOWN_E2E_BACKEND_PORT ?? 18081);
if (!Number.isInteger(BACKEND_PORT) || BACKEND_PORT < 1 || BACKEND_PORT > 65535) {
  throw new Error("PU_TOWN_E2E_BACKEND_PORT must be a valid TCP port.");
}
export const GAME_URL = `/?ws=ws://localhost:${BACKEND_PORT}/ws/game`;
