import { defineConfig, type ProxyOptions } from "vite";

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

export default defineConfig({
  server: { port: 5173, strictPort: true, proxy, allowedHosts },
  preview: { port: 5173, strictPort: true, proxy, allowedHosts }
});
