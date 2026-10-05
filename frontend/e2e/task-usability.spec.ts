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
