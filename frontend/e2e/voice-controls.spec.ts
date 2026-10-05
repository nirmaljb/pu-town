import { expect, test } from "@playwright/test";
import { Player } from "./player.js";
import { observeAudio } from "./audio-boundary.js";

test.skip(!process.env.PUTOWN_VOICE_KEY, "Source the local voice environment for actual media checks.");

test("#50–53 Real push-to-talk releases, local tests stay private and speaking ducks output", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ permissions: ["microphone"] })));
  try {
    const players = await Promise.all(contexts.map(async (context, index) => {
      const page = await context.newPage(); await observeAudio(page); return new Player(page, `Talk Player ${index}`);
    }));
    const speaker = players[0]!, listener = players[1]!;
    for (const [index, player] of players.entries()) {
      await player.enter(index === 0 ? undefined : await speaker.page.locator(".active-code").innerText());
      await player.page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await speaker.page.bringToFront();
    await speaker.page.getByRole("button", { name: "Start Game", exact: true }).click();
    await speaker.phase("day");
    for (const player of [speaker, listener]) {
      await player.walkTo(1280, 742);
      await player.page.getByRole("button", { name: "Join voice", exact: true }).click();
      await expect(player.page.locator(".voice-controls [role=status]")).toHaveText("Listening · microphone muted", { timeout: 20_000 });
    }
    await speaker.page.bringToFront();
    await speaker.page.getByRole("button", { name: "Settings", exact: true }).click();
    await speaker.page.getByLabel("Speaking mode", { exact: true }).selectOption("push-to-talk");
    await speaker.page.getByRole("button", { name: "Close Settings", exact: true }).click();
    await speaker.page.getByRole("button", { name: "Enable push to talk", exact: true }).click();
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw)).toBeLessThan(.001);
    // Read decoded PCM from the other browser without stealing keyboard focus.
    await speaker.page.locator("canvas").click();
    await speaker.page.keyboard.down("v");
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 15_000 }).toBeGreaterThan(.01);
    await speaker.page.keyboard.up("v");
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 10_000 }).toBeLessThan(.001);
    await speaker.page.keyboard.down("v");
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw)).toBeGreaterThan(.01);
    await speaker.page.getByRole("textbox", { name: "Chat message" }).focus();
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 10_000 }).toBeLessThan(.001);
    await speaker.page.keyboard.up("v");
    await speaker.page.getByRole("textbox", { name: "Chat message" }).press("v");
    await expect(speaker.page.getByRole("textbox", { name: "Chat message" })).toHaveValue("v");
    expect(await listener.page.evaluate(() => window.browserAudio.raw)).toBeLessThan(.001);
    await speaker.page.getByRole("button", { name: "Settings", exact: true }).click();
    await speaker.page.getByLabel("Speaking mode", { exact: true }).selectOption("open");
    await speaker.page.getByRole("button", { name: "Test microphone locally", exact: true }).click();
    await expect.poll(() => speaker.page.getByRole("meter", { name: "Local microphone input level" }).evaluate(meter => (meter as HTMLMeterElement).value)).toBeGreaterThan(.01);
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 10_000 }).toBeLessThan(.001);
    await speaker.page.getByRole("button", { name: "Stop local test", exact: true }).click();
    await speaker.page.getByRole("button", { name: "Close Settings", exact: true }).click();
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 15_000 }).toBeGreaterThan(.01);
    // The speaking browser has no remote publisher, so its output contains only
    // the real previews. Compare their amplitude before and after microphone mute.
    await speaker.page.getByRole("button", { name: "Settings", exact: true }).click();
    // Activity notification and the mixer ramp follow capture asynchronously.
    await speaker.page.waitForTimeout(1500);
    const preview = async (category: string) => {
      await speaker.page.evaluate(() => { window.browserAudio.peak = 0; });
      await speaker.page.getByRole("button", { name: `Preview ${category}`, exact: true }).click();
      await speaker.page.waitForTimeout(800);
      return speaker.page.evaluate(() => window.browserAudio.peak);
    };
    // Detected speech activity can pause: require a complete
    // attenuated preview during a speaking interval, rather than a pause edge.
    for (const category of ["effects", "ambience"]) await expect(async () => {
      const ducked = await preview(category);
      expect(ducked).toBeGreaterThan(.02);
      expect(ducked).toBeLessThan(.04);
    }).toPass({ timeout: 15_000, intervals: [500] });
    expect(await listener.page.evaluate(() => window.browserAudio.raw)).toBeGreaterThan(.01);
    await speaker.page.getByRole("button", { name: "Close Settings", exact: true }).click();
    await speaker.page.getByRole("button", { name: "Mute microphone", exact: true }).click();
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 10_000 }).toBeLessThan(.001);
    await speaker.page.getByRole("button", { name: "Settings", exact: true }).click();
    await speaker.page.waitForTimeout(1000);
    expect(await preview("effects")).toBeGreaterThan(.08);
    expect(await preview("ambience")).toBeGreaterThan(.08);
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
