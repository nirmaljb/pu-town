import { defineConfig } from "@playwright/test";

// Keep a separate backend so browser acceptance cannot change a development Room.
const backendPort = 18082;
const bindAddress = process.env.PU_TOWN_BROWSER_BIND ?? "localhost";
export default defineConfig({
  testDir: "./test/browser",
  timeout: 45_000,
  workers: 1,
  use: {
    baseURL: `http://localhost:5173/?ws=ws://localhost:${backendPort}/ws/game`,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    actionTimeout: 10_000,
    launchOptions: {
      // Phaser AUTO falls back to Canvas on hosts without a reliable GPU.
      args: ["--disable-webgl", ...(bindAddress === "localhost" ? [] : [`--host-resolver-rules=MAP localhost ${bindAddress}`])]
    }
  },
  webServer: [
    {
      command: `./mvnw -q package -DskipTests && java -Xmx96m -jar target/backend-0.0.1-SNAPSHOT.jar --server.port=${backendPort}`,
      cwd: "../backend",
      env: { MAVEN_OPTS: "-Xmx128m" },
      url: `http://localhost:${backendPort}/health`,
      timeout: 120_000,
      reuseExistingServer: false
    },
    {
      command: `npm run dev -- --host ${bindAddress} --port 5173 --strictPort`,
      url: `http://${bindAddress}:5173`,
      env: { NODE_OPTIONS: "--max-old-space-size=128" },
      reuseExistingServer: false
    }
  ]
});
