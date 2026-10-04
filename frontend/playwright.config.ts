import { defineConfig } from "@playwright/test";

// A separate loopback address can isolate this harness from another checkout's Vite.
// Browsers still use localhost so the backend's supported Origin remains unchanged.
const backendPort = process.env.PU_TOWN_E2E_BACKEND_PORT ?? "18081";
const host = process.env.PU_TOWN_E2E_HOST ?? "127.0.0.1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 420_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    launchOptions: { args: [`--host-resolver-rules=MAP localhost ${host}`, "--disable-webgl",
      ...(process.env.PUTOWN_VOICE_KEY ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] : [])] }
  },
  webServer: [
    {
      command: `./mvnw spring-boot:run -Dspring-boot.run.arguments=--server.port=${backendPort}`,
      cwd: "../backend",
      url: `http://localhost:${backendPort}/health`,
      timeout: 120_000
    },
    {
      command: `npm run dev -- --host ${host} --port 5173 --strictPort`,
      url: `http://${host}:5173`,
      timeout: 30_000
    }
  ]
});
