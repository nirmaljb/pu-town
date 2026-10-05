import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// A separate loopback address can isolate this harness from another checkout's Vite.
// Browsers still use localhost so the backend's supported Origin remains unchanged.
const backendPort = process.env.PU_TOWN_E2E_BACKEND_PORT ?? "18081";
const host = process.env.PU_TOWN_E2E_HOST ?? "127.0.0.1";
const reuseExistingServer = process.env.PU_TOWN_E2E_REUSE === "1";
const frontendPort = process.env.PU_TOWN_E2E_FRONTEND_PORT ?? "5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 420_000,
  use: {
    actionTimeout: 10_000,
    channel: "chromium",
    baseURL: `http://localhost:${frontendPort}`,
    trace: { mode: "retain-on-failure", screenshots: false },
    launchOptions: { args: [`--host-resolver-rules=MAP localhost ${host}`,
      ...(process.env.PUTOWN_VOICE_KEY ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-audio-capture=${fileURLToPath(new URL("./e2e/fixtures/microphone.wav", import.meta.url))}`] : [])] }
  },
  webServer: [
    {
      command: `./mvnw spring-boot:run -Dspring-boot.run.arguments="--server.port=${backendPort} --putown.allowed-origins=http://localhost:${frontendPort}"`,
      cwd: "../backend",
      url: `http://localhost:${backendPort}/health`,
      timeout: 120_000,
      reuseExistingServer
    },
    {
      command: `npm run dev -- --host ${host} --port ${frontendPort} --strictPort`,
      url: `http://${host}:${frontendPort}`,
      timeout: 30_000,
      reuseExistingServer
    }
  ]
});
