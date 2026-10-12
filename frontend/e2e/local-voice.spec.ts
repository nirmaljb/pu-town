import { expect, test } from "@playwright/test";
import { Player } from "./player.js";
import { observeAudio } from "./audio-boundary.js";
import { GAME_URL } from "./environment.js";

test.skip(!process.env.PUTOWN_VOICE_KEY, "Start LiveKit and source its backend environment.");

test("local voice receives audio, mutes and restores listening after refresh", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ permissions: ["microphone"] })));
  try {
    const players = await Promise.all(contexts.map(async (context, index) => {
      const page = await context.newPage();
      await observeAudio(page);
      return new Player(page, `Local voice ${index}`);
    }));
    const speaker = players[0]!, listener = players[1]!;
    for (const [index, player] of players.entries()) {
      await player.page.goto(GAME_URL);
      await player.page.locator(`[data-entry="${index === 0 ? "create" : "join"}"]`).click();
      await player.page.getByLabel("Display Name", { exact: true }).fill(player.name);
      if (index !== 0) await player.page.getByLabel("Room Code", { exact: true }).fill(speaker.latest("room_snapshot")!.roomId);
      await player.page.locator(".enter-room").click();
      await expect(player.page.getByRole("button", { name: "Room menu", exact: true })).toBeVisible();
      await player.page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await speaker.page.getByRole("button", { name: "Start Game", exact: true }).click();
    await speaker.phase("day");
    await listener.phase("day");
    await expect.poll(() => speaker.latest("field_state")?.self).toBeDefined();
    const position = speaker.latest("field_state")!.self;
    await listener.walkTo(position.x, position.y);
    for (const player of [speaker, listener]) {
      await player.page.bringToFront();
      await player.page.getByRole("button", { name: "Join voice", exact: true }).click();
      await expect(player.page.locator(".voice-controls [role=status]")).toHaveText("Listening · microphone muted", { timeout: 20_000 });
    }
    await speaker.page.bringToFront();
    await speaker.page.getByRole("button", { name: "Unmute microphone", exact: true }).click();
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 20_000 }).toBeGreaterThan(.01);
    await speaker.page.getByRole("button", { name: "Mute microphone", exact: true }).click();
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 10_000 }).toBeLessThan(.001);
    await speaker.page.getByRole("button", { name: "Unmute microphone", exact: true }).click();
    await listener.page.reload();
    await listener.phase("day");
    await expect(listener.page.locator(".voice-controls [role=status]")).toHaveText("Listening · microphone muted", { timeout: 20_000 });
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 20_000 }).toBeGreaterThan(.01);
    await speaker.page.bringToFront();
    await speaker.page.getByRole("button", { name: "Leave voice", exact: true }).click();
    await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 10_000 }).toBeLessThan(.001);
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
