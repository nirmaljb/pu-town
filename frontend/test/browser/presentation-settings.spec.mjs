import { test, expect } from "@playwright/test";

async function openSettings(page) {
  await page.bringToFront();
  await page.getByRole("button", { name: "Display settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Display settings" })).toBeVisible();
}

async function enterRoom(page, name, code, navigate = true) {
  await page.bringToFront();
  if (navigate) await page.goto(test.info().project.use.baseURL);
  await page.getByLabel("Display Name", { exact: true }).fill(name);
  await expect(page.getByLabel("Display Name", { exact: true })).toHaveValue(name);
  if (code) {
    await page.getByLabel("Room Code", { exact: true }).fill(code);
    await page.getByRole("button", { name: "Join Lobby", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Create Room", exact: true }).click();
  }
  await expect(page.locator(".active-code")).toHaveText(/[A-Z2-9]{6}/);
  return page.locator(".active-code").innerText();
}

test("fullscreen preference survives refresh and only a click activates the browser", async ({ page }) => {
  await page.goto(test.info().project.use.baseURL);
  await openSettings(page);
  await page.getByLabel("Prefer fullscreen", { exact: true }).check();
  await expect(page.locator(".fullscreen-status")).toContainText("Click Enter fullscreen");
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  await expect(page.locator(".fullscreen-status")).toHaveText("Fullscreen is active.");
  // An external browser exit must update status while retaining the preference.
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.getByRole("button", { name: "Enter fullscreen", exact: true })).toBeVisible();
  await expect(page.getByLabel("Prefer fullscreen", { exact: true })).toBeChecked();
  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel("Prefer fullscreen", { exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await expect(page.locator(".fullscreen-status")).toContainText("Click Enter fullscreen");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Display settings" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Display settings", exact: true })).toBeFocused();
});

test("system motion follows OS changes and explicit choices override it", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pu-town.presentation", "invalid json"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(test.info().project.use.baseURL);
  await openSettings(page);
  const motion = page.getByLabel("Motion", { exact: true });
  const animation = () => page.locator(".menu-card").evaluate(element => getComputedStyle(element, "::before").animationName);
  await expect(motion).toHaveValue("system");
  await expect.poll(animation).toBe("none");
  await motion.selectOption("full");
  await expect.poll(animation).toBe("menu-light");
  await motion.selectOption("reduce");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(animation).toBe("none");
  await motion.selectOption("system");
  await expect.poll(animation).toBe("menu-light");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(animation).toBe("none");
});

test("unsupported fullscreen and unavailable storage leave motion controls usable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "fullscreenEnabled", { get: () => false });
    Storage.prototype.getItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
  });
  await page.goto(test.info().project.use.baseURL);
  await openSettings(page);
  await expect(page.getByRole("button", { name: "Enter fullscreen", exact: true })).toBeDisabled();
  await expect(page.locator(".fullscreen-status")).toHaveText("Fullscreen is unavailable in this browser.");
  await page.getByLabel("Motion", { exact: true }).selectOption("reduce");
  await expect.poll(() => page.locator(".menu-card").evaluate(element =>
    getComputedStyle(element, "::before").animationName)).toBe("none");
});

test("a rejected fullscreen request explains how to retry without claiming activation", async ({ page }) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.reject(new DOMException("Denied", "NotAllowedError"));
  });
  await page.goto(test.info().project.use.baseURL);
  await openSettings(page);
  await page.getByLabel("Prefer fullscreen", { exact: true }).check();
  await page.getByRole("button", { name: "Enter fullscreen", exact: true }).click();
  await expect(page.locator(".fullscreen-status")).toContainText("could not be changed");
  await expect(page.getByRole("button", { name: "Enter fullscreen", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await page.setViewportSize({ width: 360, height: 640 });
  const panel = await page.getByRole("dialog", { name: "Display settings" }).boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(360);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(640);
  await page.screenshot({ path: test.info().outputPath("display-settings.png") });
});

test("independent Players remember reduced motion without interrupting a Game or Leave", async ({ browser }) => {
  test.setTimeout(120_000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  try {
    for (const context of contexts) context.setDefaultTimeout(10_000);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    await pages[0].goto(test.info().project.use.baseURL);
    await expect(pages[0].getByRole("button", { name: "Display settings", exact: true })).toBeVisible();
    const code = await enterRoom(pages[0], "Host", undefined, false);
    for (let i = 1; i < pages.length; i++) await enterRoom(pages[i], `Player ${i + 1}`, code);
    await openSettings(pages[0]);
    await pages[0].getByLabel("Motion", { exact: true }).selectOption("reduce");
    await expect.poll(() => pages[0].locator(".menu-card").evaluate(element =>
      getComputedStyle(element, "::before").animationName)).toBe("none");
    await pages[0].getByRole("button", { name: "Close display settings" }).click();
    await pages[0].reload();
    await expect(pages[0].locator(".active-code")).toHaveText(code);
    await openSettings(pages[0]);
    await expect(pages[0].getByLabel("Motion", { exact: true })).toHaveValue("reduce");
    await pages[0].getByRole("button", { name: "Close display settings" }).click();
    await openSettings(pages[1]);
    await expect(pages[1].getByLabel("Motion", { exact: true })).toHaveValue("system");
    await pages[1].getByRole("button", { name: "Close display settings" }).click();
    for (const page of pages) {
      await page.bringToFront();
      await page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await pages[0].bringToFront();
    await pages[0].getByRole("button", { name: "Start Game", exact: true }).click();
    for (const page of pages) await expect(page.locator(".game-banner")).toBeVisible();
    await openSettings(pages[0]);
    await expect(pages[0].getByLabel("Motion", { exact: true })).toHaveValue("reduce");
    const before = await pages[0].locator(".game-countdown").innerText();
    await expect.poll(() => pages[0].locator(".game-countdown").innerText()).not.toBe(before);
    await expect.poll(() => pages[0].locator(".outcome-card").evaluate(element =>
      getComputedStyle(element).animationName)).toBe("none");
    await pages[0].getByLabel("Motion", { exact: true }).selectOption("full");
    await expect.poll(() => pages[0].locator(".outcome-card").evaluate(element =>
      getComputedStyle(element).animationName)).toBe("outcome-in");
    await pages[0].getByRole("button", { name: "Close display settings" }).click();
    for (const page of pages) {
      await page.getByRole("button", { name: "Leave Room", exact: true }).click();
      await expect(page.getByRole("button", { name: "Create Room", exact: true })).toBeVisible();
    }
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()));
  }
});

