import { expect, test } from "@playwright/test";
import { Player } from "./player.js";
import { observeAudio } from "./audio-boundary.js";

declare global { interface Window { playedToneFrequencies: number[] } }

test("#30 #44–45 Keyboard walking reaches interiors and produces actual movement and phase audio", async ({ page }) => {
  test.setTimeout(300_000);
  await observeAudio(page);
  await page.addInitScript(() => {
    window.playedToneFrequencies = [];
    const frequencies = new WeakSet<AudioParam>();
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      const oscillator = createOscillator.call(this);
      frequencies.add(oscillator.frequency);
      return oscillator;
    };
    const schedule = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function(value: number, startTime: number) {
      if (frequencies.has(this)) window.playedToneFrequencies.push(value);
      return schedule.call(this, value, startTime);
    };
  });
  const player = new Player(page, "Town explorer");
  await player.enter();
  await page.getByRole("button", { name: "Solo Practice", exact: true }).click();
  await player.phase("day");
  await page.evaluate(() => { window.browserAudio.peak = 0; });
  for (const task of player.latest("task_state")!.tasks) await player.walkTo(task.x, task.y);
  for (const [x, y, area] of [[1280, 544, "Outdoors"], [576, 1056, "General Store"], [896, 1056, "Smithy"], [2240, 1056, "Inn"], [2016, 320, "Chapel"]] as const) {
    await player.walkTo(x, y);
    await expect(page.locator(".game-announcement")).toContainText(area);
  }
  expect(await page.evaluate(() => window.browserAudio.peak)).toBeGreaterThan(.001);
  const movementTones = await page.evaluate(() => window.playedToneFrequencies);
  expect(movementTones).toContain(90);
  expect(movementTones).toContain(280);
  expect(movementTones).toContain(220);
  await page.evaluate(() => { window.browserAudio.peak = 0; window.playedToneFrequencies = []; });
  await page.getByRole("button", { name: "Next phase", exact: true }).click();
  await player.phase("night");
  await expect.poll(() => page.evaluate(() => window.playedToneFrequencies)).toContain(330);
  await expect.poll(() => page.evaluate(() => window.browserAudio.peak)).toBeGreaterThan(.001);
});
