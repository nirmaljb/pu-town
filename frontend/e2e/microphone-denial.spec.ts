import { expect, test } from "@playwright/test";
import { GAME_URL } from "./environment.js";

test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream"] } });
test("#50 denied microphone permission leaves Settings and Room entry usable", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Browser.setPermission", { permission: { name: "microphone" }, setting: "denied", origin: "http://localhost:5173" });
  await page.goto(GAME_URL);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Test microphone locally", exact: true }).click();
  await expect(page.locator(".microphone-status")).toContainText(/unavailable|denied/i);
  await page.getByRole("button", { name: "Close Settings", exact: true }).click();
  await page.getByLabel("Display Name", { exact: true }).fill("Permission denied");
  await page.getByRole("button", { name: "Create Room", exact: true }).click();
  await expect(page.getByRole("button", { name: "Solo Practice", exact: true })).toBeVisible();
});
