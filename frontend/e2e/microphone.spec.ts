import { expect, test } from "@playwright/test";
import { GAME_URL } from "./environment.js";

test.skip(!process.env.PUTOWN_VOICE_KEY, "Source the local voice environment for synthetic microphone input.");

test("#50–52 Settings tests real microphone input locally and retains device, mode, key and suppression", async ({ page }) => {
  await page.goto(GAME_URL);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Test microphone locally", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop local test", exact: true })).toBeVisible();
  await expect.poll(() => page.getByRole("meter", { name: "Local microphone input level" }).evaluate(meter => (meter as HTMLMeterElement).value)).toBeGreaterThan(.01);
  const devices = page.getByLabel("Input device", { exact: true });
  await expect.poll(() => devices.locator("option").count()).toBeGreaterThan(1);
  const id = await devices.locator("option").nth(1).getAttribute("value");
  await devices.selectOption(id!);
  await page.getByLabel("Speaking mode", { exact: true }).selectOption("push-to-talk");
  await page.getByRole("button", { name: "Push-to-talk key", exact: true }).click();
  await page.keyboard.press("v");
  await expect(page.getByRole("button", { name: "Push-to-talk key", exact: true })).toHaveText("KeyV");
  await page.getByLabel("Microphone noise suppression", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Close Settings", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(devices).toHaveValue(id!);
  await expect(page.getByLabel("Speaking mode", { exact: true })).toHaveValue("push-to-talk");
  await expect(page.getByRole("button", { name: "Push-to-talk key", exact: true })).toHaveText("KeyV");
  await expect(page.getByLabel("Microphone noise suppression", { exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Test microphone locally", exact: true })).toBeVisible();
});

