import { expect, test } from "@playwright/test";
import { Player } from "./player.js";
import { observeAudio } from "./audio-boundary.js";

test.skip(!process.env.PUTOWN_VOICE_KEY, "Source the voice environment for ten-browser actual media acceptance.");

test("#57 Ten browser Players hear authorized Townhall audio and lose it on Leave", async ({ browser }) => {
  test.setTimeout(500_000);
  const contexts = await Promise.all(Array.from({ length: 10 }, () => browser.newContext({ viewport: { width: 640, height: 720 }, permissions: ["microphone"] })));
  try {
    const players = await Promise.all(contexts.map(async (context, index) => {
      const page = await context.newPage(); await observeAudio(page); return new Player(page, `Capacity Player ${index}`);
    }));
    const speaker = players[0]!;
    for (const [index, player] of players.entries()) {
      await player.enter(index === 0 ? undefined : await speaker.page.locator(".active-code").innerText());
      await player.page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await speaker.page.bringToFront();
    await expect(speaker.page.locator(".occupancy")).toHaveText("10 / 10 Players");
    await speaker.page.getByRole("button", { name: "Start Game", exact: true }).click();
    await speaker.phase("night", 205_000);
    await expect(speaker.page.getByRole("button", { name: "Join voice", exact: true })).toBeDisabled();
    await speaker.phase("discussion", 25_000);
    for (const player of players) {
      await player.page.bringToFront();
      expect(player.latest("game_state")!.players).toHaveLength(10);
      expect(player.latest("game_state")!.roles).toBeNull();
      await player.page.getByRole("button", { name: "Join voice", exact: true }).click();
      await expect(player.page.locator(".voice-controls [role=status]")).toHaveText("Listening · microphone muted", { timeout: 20_000 });
    }
    await speaker.page.bringToFront();
    await speaker.page.getByRole("button", { name: "Unmute microphone", exact: true }).click();
    for (const listener of players.slice(1)) {
      await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 20_000 }).toBeGreaterThan(.01);
    }
    console.log("Ten independent browser Players connected; nine listeners received actual PCM.");
    const oldToken = speaker.latest("voice_state")!.token!;
    await speaker.page.getByRole("button", { name: "Leave Room", exact: true }).click();
    await expect(speaker.page.getByRole("button", { name: "Create Room", exact: true })).toBeVisible();
    for (const listener of players.slice(1)) {
      await expect.poll(() => listener.page.evaluate(() => window.browserAudio.raw), { timeout: 10_000 }).toBeLessThan(.001);
    }
    expect(await players[1]!.page.evaluate(async ({ token, port }) => (await fetch(`http://localhost:${port}/voice/rtc/validate?access_token=${encodeURIComponent(token)}`)).status,
      { token: oldToken, port: process.env.PU_TOWN_E2E_BACKEND_PORT ?? "18081" })).toBe(403);
    console.log("Leave stopped all nine receptions and retired the speaker's credential.");
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
