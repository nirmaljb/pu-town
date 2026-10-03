import { expect, test } from "@playwright/test";
import { GAME_URL } from "./environment.js";
import { setVolume } from "./volume-control.js";

declare global { interface Window { audioPeak: number } }

test.use({ actionTimeout: 10_000 });

test("Local previews route real Web Audio samples through saved master and category volumes", async ({ page }) => {
  // Observe the browser's output boundary, without exposing a Game test API.
  await page.addInitScript(() => {
    const output = window;
    output.audioPeak = 0;
    const original = AudioNode.prototype.connect;
    const connect = original as unknown as (this: AudioNode, destination: AudioNode | AudioParam, output?: number, input?: number) => AudioNode | void;
    AudioNode.prototype.connect = function(this: AudioNode, ...args: Parameters<typeof connect>) {
      if (args[0] instanceof AudioDestinationNode) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 1024;
        connect.call(this, analyser);
        connect.call(analyser, args[0]);
        const samples = new Float32Array(analyser.fftSize);
        window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += sample * sample;
          output.audioPeak = Math.max(output.audioPeak, Math.sqrt(sum / samples.length));
        }, 10);
        return args[0];
      }
      return connect.apply(this, args);
    } as typeof original;
  });
  await page.goto(GAME_URL);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const preview = async (category: string) => {
    await page.evaluate(() => { window.audioPeak = 0; });
    await page.getByRole("button", { name: `Preview ${category}`, exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("status", { name: "Settings feedback" })).toHaveText(`Playing ${category} preview locally.`);
    // Wait for the audible portion to finish before measuring the complete output.
    await page.waitForTimeout(800);
    return page.evaluate(() => window.audioPeak);
  };
  const full = await preview("effects");
  expect(full).toBeGreaterThan(0.08);
  await setVolume(page, "Effects volume", 25);
  await setVolume(page, "Master volume", 50);
  expect(await preview("effects")).toBeGreaterThan(0.01);
  expect(await preview("effects")).toBeLessThan(0.015);
  // A newly created bus uses its own level plus the already adjusted master.
  expect(await preview("ambience")).toBeGreaterThan(0.04);
  await setVolume(page, "Voice volume", 0);
  expect(await preview("voice")).toBeLessThan(0.000001);
  await setVolume(page, "Master volume", 0);
  expect(await preview("ambience")).toBeLessThan(0.000001);
  await setVolume(page, "Master volume", 50);
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  expect(await preview("effects")).toBeGreaterThan(0.01);
  expect(await preview("effects")).toBeLessThan(0.015);
});
