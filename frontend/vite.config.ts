import { defineConfig, type ProxyOptions } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// The page and the Game share one address: the frontend server passes the WebSocket and the
// collection endpoint through to the backend on this computer. So a Player only ever needs
// to reach one port, which is what lets a single shared link (a tunnel) carry the whole Game.
const BACKEND = "http://localhost:8080";
const proxy: Record<string, ProxyOptions> = {
  "/ws/game": { target: BACKEND, ws: true },
  "/rooms": { target: BACKEND }
};

// Hosts a shared link may arrive under, besides this computer's own names and IP addresses.
const allowedHosts = [".trycloudflare.com"];

// Browsers grant a microphone only to secure pages, so voice from another computer on the
// network needs https. PU_TOWN_HTTPS=1 serves the page with a self-signed certificate (each
// browser asks once to trust it); the WebSocket then follows as wss through the same proxy.
const https = process.env.PU_TOWN_HTTPS === "1";

export default defineConfig({
  plugins: https ? [basicSsl({ name: "pu-town" })] : [],
  server: { port: 5173, strictPort: true, proxy, allowedHosts },
  preview: { port: 5173, strictPort: true, proxy, allowedHosts }
});
