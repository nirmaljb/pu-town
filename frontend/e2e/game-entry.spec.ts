import { test, expect } from "@playwright/test";
import { GAME_URL } from "./environment.js";

test("independent Players enter a centered Game and can Leave", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 1280, height: 800 } })));
  try {
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (const [index, page] of pages.entries()) {
      await page.bringToFront();
      await page.goto(GAME_URL);
      await page.getByLabel("Display Name", { exact: true }).fill(`Player ${index + 1}`);
      await expect(page.getByLabel("Display Name", { exact: true })).toHaveValue(`Player ${index + 1}`);
      if (index === 0) {
        await page.getByRole("button", { name: "Create Room" }).click();
      } else {
        await page.getByLabel("Room Code", { exact: true }).fill(await pages[0]!.locator(".active-code").innerText());
        await page.getByRole("button", { name: "Join Lobby" }).click();
      }
      await expect(page.getByRole("button", { name: "Ready", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await pages[0]!.bringToFront();
    await expect(pages[0]!.getByRole("button", { name: "Start Game" })).toBeEnabled();
    await pages[0]!.getByRole("button", { name: "Start Game" }).click();
    for (const page of pages) {
      await page.bringToFront();
      await expect(page.locator(".game-banner")).toBeVisible();
      await expect.poll(async () => page.locator("#stage canvas").evaluate(canvas => {
        const bounds = canvas.getBoundingClientRect();
        return Math.abs(bounds.x + bounds.width / 2 - innerWidth / 2);
      })).toBeLessThan(2);
      const canvas = await page.locator("#stage canvas").boundingBox();
      expect(canvas).not.toBeNull();
      await expect(page.getByRole("button", { name: "Copy code" })).toBeHidden();
      await expect(page.getByRole("button", { name: "Leave Room", exact: true })).toBeVisible();
      const panel = await page.getByRole("region", { name: "Game controls" }).boundingBox();
      expect(panel).not.toBeNull();
      expect(panel!.x).toBeGreaterThanOrEqual(canvas!.x);
      expect(panel!.x + panel!.width).toBeLessThanOrEqual(canvas!.x + canvas!.width + 1);
    }
    await pages[3]!.bringToFront();
    await pages[3]!.getByRole("button", { name: "Leave Room", exact: true }).click();
    await expect(pages[3]!.getByRole("button", { name: "Create Room" })).toBeVisible();
    await expect(pages[0]!.locator(".game-banner")).toBeVisible();
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
  }
});
