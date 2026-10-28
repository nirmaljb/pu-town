/**
 * The WebSocket endpoint for a page at `page`. The `ws` query parameter wins; otherwise the
 * Game is at the page's own address — the frontend server passes it through to the backend —
 * so a Player on this computer, on the network, or behind a shared link reaches the same
 * backend, over `wss` when the page itself is secure.
 */
export function gameEndpoint(page: Readonly<{ protocol: string; host: string; search: string }>): string {
  const configured = new URLSearchParams(page.search).get("ws");
  if (configured) return configured;
  const scheme = page.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${page.host}/ws/game`;
}
