import { expect, test, type Page } from "@playwright/test";
import type { ServerMessage } from "../src/protocol.js";
import { GAME_URL } from "./environment.js";
function observe(page: Page) {
  const events: ServerMessage[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("websocket", socket => { if (socket.url().includes("/ws/game")) socket.on("framereceived", ({ payload }) => events.push(JSON.parse(String(payload)))); });
  return { events, errors, latest: <T extends ServerMessage["type"]>(type: T) => [...events].reverse().find(event => event.type === type) as Extract<ServerMessage, { type: T }> | undefined };
}
test("local Developer Room supports simulations, browser handoff, movement, Tasks, reset and recovery", async ({ browser }) => {
  test.skip(process.env.PU_TOWN_E2E_DEVELOPER !== "1", "Requires an enabled local backend"); test.setTimeout(100_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const host = await context.newPage(), controller = observe(host);
    await host.goto(GAME_URL); await host.locator(".developer-entry").click();
    await host.getByLabel("Display Name", { exact: true }).fill("Developer"); await host.locator(".enter-room").click();
    await expect(host.locator(".developer-panel")).toBeVisible(); await host.locator(".developer-panel > summary").click();
    await host.locator(".developer-load").click();
    await expect(host.locator(".transition-role")).toHaveText("You are the Mafia");
    await host.screenshot({ path: test.info().outputPath("role-title.png") }); await expect(host.locator(".phase-transition")).toBeHidden();
    await expect.poll(() => controller.latest("developer_state")?.players.length).toBe(4);
    const simulated = controller.latest("developer_state")!.players.find(player => player.role === "doctor")!;
    await host.locator(".developer-player").selectOption(simulated.playerId);
    const popupPromise = context.waitForEvent("page"); await host.getByRole("button", { name: "Open local browser as this Player", exact: true }).click();
    const guest = await popupPromise, recipient = observe(guest);
    await expect(guest.locator(".developer-panel")).toBeVisible(); await expect.poll(() => recipient.latest("game_state")?.self.role).toBe("doctor");
    expect(recipient.events.some(event => event.type === "developer_state")).toBe(false);
    await guest.locator(".developer-panel > summary").click(); await expect(guest.locator(".developer-controller")).toBeHidden();
    await host.bringToFront(); await host.locator("[data-action=advance]").click(); await expect.poll(() => recipient.latest("game_state")?.phase).toBe("day");
    await guest.bringToFront(); await expect(guest.locator(".phase-transition")).toBeHidden();
    const before = recipient.latest("field_state")!.self;
    await guest.locator("canvas").click({ position: { x: 500, y: 250 } }); await guest.keyboard.down("s"); await guest.waitForTimeout(500); await guest.keyboard.up("s");
    await expect.poll(() => recipient.latest("field_state")?.self.y).toBeGreaterThan(before.y);
    await host.bringToFront(); await host.locator("[data-action=pause]").click(); await expect(guest.locator(".game-countdown")).toContainText("Paused");
    const countdown = await guest.locator(".game-countdown").innerText(); await guest.waitForTimeout(1100); expect(await guest.locator(".game-countdown").innerText()).toBe(countdown);
    await host.locator("[data-action=pause]").click(); await host.locator("[data-setting=taskRange]").uncheck(); await host.locator("[data-setting=taskDuration]").uncheck();
    await guest.bringToFront(); await guest.locator(".task-interface summary").click(); await guest.getByRole("button", { name: "Repair", exact: true }).first().click();
    await guest.getByRole("button", { name: "Finish repair step", exact: true }).click(); await expect.poll(() => recipient.latest("task_state")?.tasks[0]?.step).toBe(1);
    await host.bringToFront(); await host.locator("[data-action=reset]").click(); await expect.poll(() => recipient.latest("task_state")?.tasks[0]?.step).toBe(0);
    expect(recipient.latest("room_snapshot")!.selfPlayerId).toBe(simulated.playerId);
    await guest.bringToFront(); await guest.reload(); await expect.poll(() => recipient.events.filter(event => event.type === "room_snapshot").length).toBe(2);
    expect(recipient.latest("room_snapshot")!.selfPlayerId).toBe(simulated.playerId); await expect(guest.locator(".phase-transition")).toBeHidden();
    await guest.locator(".developer-panel > summary").click(); await guest.locator(".developer-release").click(); await expect(guest.locator(".menu-choices")).toBeVisible();
    await host.bringToFront(); await expect.poll(() => controller.latest("developer_state")?.players.find(player => player.playerId === simulated.playerId)?.simulated).toBe(true);
    await host.locator("[data-action=lobby]").click(); await expect(host.locator(".lobby-sidebar")).toBeVisible(); await expect(host.locator(".game-panel")).toBeHidden();
    await host.screenshot({ path: test.info().outputPath("developer-lobby.png") });
    await host.locator(".room-menu-toggle").click(); await host.locator(".leave-room").click(); await expect(host.locator(".menu-choices")).toBeVisible();
    expect(controller.errors).toEqual([]); expect(recipient.errors).toEqual([]);
  } finally { await context.close(); }
});
