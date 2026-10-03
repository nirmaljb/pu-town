import { expect, type Page } from "@playwright/test";

/** Range controls accept keyboard gestures rather than text-field fill(). */
export async function setVolume(page: Page, label: string, value: number): Promise<void> {
  const slider = page.getByRole("slider", { name: label, exact: true });
  await slider.focus();
  await slider.press(value <= 50 ? "Home" : "End");
  const steps = value <= 50 ? value : 100 - value;
  for (let step = 0; step < Math.floor(steps / 10); step++) await slider.press(value <= 50 ? "PageUp" : "PageDown");
  for (let step = 0; step < steps % 10; step++) await slider.press(value <= 50 ? "ArrowRight" : "ArrowLeft");
  await expect(slider).toHaveValue(String(value));
}
