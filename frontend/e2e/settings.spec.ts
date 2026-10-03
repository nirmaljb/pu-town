import { expect, test } from "@playwright/test";
import { GAME_URL } from "./environment.js";
import { setVolume } from "./volume-control.js";

test.use({ actionTimeout: 10_000 });

test("Settings is available before joining a Room", async ({ page }) => {
  await page.goto(GAME_URL);
  await expect(page.getByRole("button", { name: "Create Room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
});

test("Players remember independent volumes and preview local sound without pausing play", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 800, height: 600 } })));
  try {
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const host = pages[0]!;
    for (const [index, page] of pages.entries()) {
      await page.bringToFront();
      await page.goto(GAME_URL);
      await page.getByLabel("Display Name", { exact: true }).fill(`Settings Player ${index}`);
      if (index === 0) await page.getByRole("button", { name: "Create Room" }).click();
      else {
        await page.getByLabel("Room Code", { exact: true }).fill(await host.locator(".active-code").innerText());
        await page.getByRole("button", { name: "Join Lobby" }).click();
      }
      await page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await host.bringToFront();
    await host.getByRole("button", { name: "Start Game" }).click();
    await expect(host.locator(".game-banner")).toBeVisible();
    await host.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = host.getByRole("dialog", { name: "Settings", exact: true });
    for (const [label, value] of [["Master volume", "50"], ["Effects volume", "25"], ["Ambience volume", "35"], ["Voice volume", "65"]] as const) {
      await setVolume(host, label, Number(value));
    }
    await dialog.getByRole("button", { name: "Preview effects" }).click();
    await expect(dialog.getByRole("status", { name: "Settings feedback" })).toHaveText("Playing effects preview locally.");
    await dialog.getByLabel("Reduced motion", { exact: true }).check();
    await dialog.getByLabel("Prefer fullscreen", { exact: true }).check();
    await expect(host.locator(".game-phase")).toHaveText("Roam the town", { timeout: 15_000 });
    await dialog.getByRole("button", { name: "Close Settings" }).click();
    await host.reload();
    await expect(host.locator(".game-banner")).toBeVisible();
    await host.getByRole("button", { name: "Settings", exact: true }).click();
    for (const [label, value] of [["Master volume", "50"], ["Effects volume", "25"], ["Ambience volume", "35"], ["Voice volume", "65"]] as const) {
      await expect(dialog.getByLabel(label, { exact: true })).toHaveValue(value);
    }
    await expect(dialog.getByLabel("Reduced motion", { exact: true })).toBeChecked();
    await expect(dialog.getByLabel("Prefer fullscreen", { exact: true })).toBeChecked();
    await expect(host.locator(".fullscreen-status")).toContainText("Windowed");
    await pages[1]!.bringToFront();
    await pages[1]!.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(pages[1]!.getByLabel("Master volume", { exact: true })).toHaveValue("100");
    await pages[1]!.getByRole("button", { name: "Close Settings" }).click();
    await pages[1]!.getByRole("button", { name: "Leave Room", exact: true }).click();
    await expect(pages[1]!.getByRole("button", { name: "Create Room" })).toBeVisible();
    await host.bringToFront();
    await expect(host.locator(".occupancy")).toHaveText("3 / 10 Players");
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});

test("Reduced motion and fullscreen preferences survive refresh without claiming fullscreen activation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(GAME_URL);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Reduced motion", { exact: true }).check();
  await page.getByLabel("Prefer fullscreen", { exact: true }).check();
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect.poll(() => page.locator(".menu-card").evaluate(element => getComputedStyle(element, "::before").animationName)).toBe("none");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Reduced motion", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Prefer fullscreen", { exact: true })).toBeChecked();
  await expect(page.locator(".fullscreen-status")).toContainText("Windowed");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(page.locator(".fullscreen-status")).toHaveText("Fullscreen active.");
  await page.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByLabel("Reduced motion", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect.poll(() => page.locator(".menu-card").evaluate(element => getComputedStyle(element, "::before").animationName)).toBe("menu-light");
});

test("Players can override the browser's reduced-motion preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(GAME_URL);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Reduced motion", { exact: true })).toBeChecked();
  await page.getByLabel("Reduced motion", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect.poll(() => page.locator(".menu-card").evaluate(element => getComputedStyle(element, "::before").animationName)).toBe("menu-light");
});

test("Settings remain usable when storage and fullscreen are unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get: () => { throw new DOMException("Storage disabled", "SecurityError"); } });
    Object.defineProperty(document, "fullscreenEnabled", { get: () => false });
  });
  await page.goto(GAME_URL);
  const opener = page.getByRole("button", { name: "Settings", exact: true });
  await opener.click();
  await setVolume(page, "Master volume", 20);
  await page.getByLabel("Reduced motion", { exact: true }).check();
  await expect(page.getByRole("button", { name: "Enter fullscreen", exact: true })).toBeDisabled();
  await expect(page.locator(".fullscreen-status")).toHaveText("Fullscreen unavailable in this browser.");
  await page.getByRole("button", { name: "Close Settings" }).click();
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(page.getByLabel("Master volume", { exact: true })).toHaveValue("20");
  await page.screenshot({ path: test.info().outputPath("mobile-settings.png") });
  await page.reload();
  await opener.click();
  await expect(page.getByLabel("Master volume", { exact: true })).toHaveValue("100");
});
