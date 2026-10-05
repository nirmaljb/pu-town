import { expect, test } from "@playwright/test";
import { Player } from "./player.js";

test("Task countdowns preserve keyboard focus and do not cover chat or voice", async ({ page }) => {
  await page.setViewportSize({ width: 550, height: 804 });
  const player = new Player(page, "Task keyboard");
  await player.enter();
  await page.getByRole("button", { name: "Solo Practice", exact: true }).click();
  await player.phase("day");
  const ledger = page.getByRole("region", { name: "Tasks", exact: true });
  await expect(ledger).toBeVisible();
  const summary = ledger.locator("summary");
  if (await summary.count()) await summary.click();
  await ledger.getByRole("button", { name: "Repair", exact: true }).click();
  const close = ledger.getByRole("button", { name: "Close interaction", exact: true });
  await close.focus();
  await page.waitForTimeout(1500);
  await expect(close).toBeFocused();
  const tasks = await ledger.boundingBox(), chat = await page.locator(".chat-panel").boundingBox(), voice = await page.locator(".voice-controls").boundingBox();
  expect(tasks!.y + tasks!.height).toBeLessThanOrEqual(chat!.y);
  expect(chat!.y + chat!.height).toBeLessThanOrEqual(voice!.y);
  await page.screenshot({ path: test.info().outputPath("task-ledger.png") });
});

test("#23 A wrapped Room bar keeps Settings and Leave Room above the phase banner", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const player = new Player(page, "Phone Player");
  await player.enter();
  await page.getByRole("button", { name: "Solo Practice", exact: true }).click();
  await player.phase("day");
  const header = await page.locator(".room-bar").boundingBox();
  await expect.poll(async () => (await page.locator(".game-banner").boundingBox())!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close Settings", exact: true }).click();
  await page.getByRole("button", { name: "Leave Room", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create Room", exact: true })).toBeVisible();
});
