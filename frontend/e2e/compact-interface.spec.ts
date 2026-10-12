import { expect, test, type Page } from "@playwright/test";
import { GAME_URL } from "./environment.js";
import type { ServerMessage } from "../src/protocol.js";

function observe(page: Page) {
  const events: ServerMessage[] = [];
  page.on("websocket", socket => socket.on("framereceived", ({ payload }) => events.push(JSON.parse(String(payload)) as ServerMessage)));
  return <T extends ServerMessage["type"]>(type: T) => [...events].reverse().find(event => event.type === type) as Extract<ServerMessage, { type: T }> | undefined;
}
async function enter(page: Page, name: string, code?: string) {
  await page.goto(GAME_URL);
  await page.locator(`[data-entry=${code ? "join" : "create"}]`).click();
  await page.getByLabel("Display Name", { exact: true }).fill(name);
  if (code) await page.getByLabel("Room Code", { exact: true }).fill(code);
  await page.locator(".enter-room").click();
  await expect(page.locator(".lobby-sidebar")).toBeVisible();
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`centered shared town selection, map controls, recovery and Leave at ${viewport.width}px`, async ({ browser }) => {
    test.setTimeout(90_000);
    const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport })));
    try {
      const pages = await Promise.all(contexts.map(context => context.newPage()));
      const latest = pages.map(observe);
      const host = pages[0]!;
      await enter(host, "Host");
      const code = latest[0]!("room_snapshot")!.roomId;
      for (let index = 1; index < pages.length; index++) await enter(pages[index]!, `Player ${index}`, code);
      for (const mapId of ["horror", "village", "cyberpunk"] as const) {
        await host.locator(`[data-map=${mapId}]`).click();
        for (const page of pages) await expect(page.locator(`[data-map=${mapId}]`)).toHaveAttribute("aria-pressed", "true");
      }
      await expect(pages[1]!.locator("[data-map=horror]")).toBeDisabled();
      const choice = await host.locator(".map-options").boundingBox();
      expect(Math.abs(choice!.x + choice!.width / 2 - viewport.width / 2)).toBeLessThan(2);
      await expect(host.locator(".role-setup")).not.toHaveAttribute("open");
      await expect(host.locator(".character-options")).not.toHaveAttribute("open");
      await host.locator(".character-options summary").click();
      await expect(host.locator(".avatar-chooser")).toBeVisible();
      await host.locator(".character-options summary").click();
      await host.screenshot({ path: test.info().outputPath("centered-lobby.png") });
      const fonts = await host.locator("button, input, summary, h1, p").evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => getComputedStyle(element).fontFamily));
      expect(fonts.every(font => font.includes("Silkscreen"))).toBe(true);
      for (const page of pages) await page.locator(".ready-toggle").click();
      await host.locator(".start-game").click();
      await expect.poll(() => latest[0]!("field_state")?.self.x, { timeout: 20_000 }).toBeDefined();
      await expect(host.locator(".game-phase")).toHaveText("Day · Explore the town");
      await host.keyboard.press("m");
      await expect(host.locator(".map-dialog")).toBeVisible();
      await expect(host.locator("#map-title")).toHaveText("Silver Jubilee Campus");
      await expect(host.locator(".map-surface img")).toHaveJSProperty("complete", true);
      await expect(host.locator(".map-marker-self")).toHaveCount(1);
      await expect(host.locator(".map-marker-task")).toHaveCount(3);
      await expect(host.locator(".map-markers > *")).toHaveCount(4);
      const start = latest[0]!("field_state")!.self;
      await host.keyboard.down("d");
      await host.waitForTimeout(350);
      await host.keyboard.up("d");
      expect(latest[0]!("field_state")!.self.x).toBe(start.x);
      await host.screenshot({ path: test.info().outputPath("whole-town.png") });
      await host.keyboard.press("Escape");
      await expect(host.locator(".map-dialog")).not.toBeVisible();
      await host.locator(".chat-input").fill("m");
      await host.keyboard.press("m");
      await expect(host.locator(".map-dialog")).not.toBeVisible();
      await host.locator(".chat-input").blur();
      await expect(host.locator(".phase-transition")).not.toBeVisible();
      await host.keyboard.down("d");
      await expect.poll(() => latest[0]!("field_state")!.self.x).toBeGreaterThan(start.x + 10);
      await host.keyboard.up("d");
      await host.reload();
      await expect(host.locator(".game-phase")).toHaveText("Day · Explore the town", { timeout: 20_000 });
      await host.locator(".map-toggle").click();
      await expect(host.locator("#map-title")).toHaveText("Silver Jubilee Campus");
      await host.keyboard.press("m");
      await expect(host.locator(".map-dialog")).not.toBeVisible();
      await host.locator(".room-menu-toggle").click();
      await host.locator(".leave-room").click();
      await expect(host.locator(".menu-choices")).toBeVisible();
      await expect(host.locator(".map-toggle")).not.toBeVisible();
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
}

for (const [mapId, name, firstTask] of [
  ["village", "Sunwater Village", "Sign the town ledger"],
  ["horror", "Blackthorn Hollow", "Abandoned abbey"],
  ["cyberpunk", "Silver Jubilee Campus", "Block A Seminar Room"]
] as const) {
  test(`Solo Practice uses ${name} terrain and Tasks`, async ({ page }) => {
    test.setTimeout(45_000);
    const latest = observe(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await enter(page, "Explorer");
    await page.locator(`[data-map=${mapId}]`).click();
    await expect(page.locator(`[data-map=${mapId}]`)).toHaveAttribute("aria-pressed", "true");
    await page.locator(".start-practice").click();
    await expect.poll(() => latest("task_state")?.tasks[0]?.name).toBe(firstTask);
    await expect(page.locator(".game-phase")).toContainText("Day");
    await page.screenshot({ path: test.info().outputPath(`${mapId}-day.png`) });
    await page.keyboard.press("m");
    await expect(page.locator("#map-title")).toHaveText(name);
    await expect(page.locator(".map-surface img")).toHaveJSProperty("complete", true);
    await page.keyboard.press("Escape");
    await page.locator(".next-practice-phase").click();
    await expect(page.locator(".game-phase")).toContainText("Night");
    await page.keyboard.press("m");
    await expect(page.locator(".map-dialog")).toBeVisible();
    await page.locator(".map-dialog button").click();
    await expect(page.locator(".map-dialog")).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
