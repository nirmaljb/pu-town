import { expect, test } from "@playwright/test";
import { Player } from "./player.js";
import { observeAudio } from "./audio-boundary.js";

test.skip(!process.env.PUTOWN_VOICE_KEY, "Source the voice environment to verify actual Day audio.");

test("#31 #48 #55 Day voice fades per listener, text stays private and refresh retires old media", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ permissions: ["microphone"] })));
  try {
    const players = await Promise.all(contexts.map(async (context, index) => {
      const page = await context.newPage(); await observeAudio(page); return new Player(page, `Day Voice ${index}`);
    }));
    const speaker = players[0]!, near = players[1]!, faded = players[2]!, far = players[3]!;
    for (const [index, player] of players.entries()) {
      await player.enter(index === 0 ? undefined : await speaker.page.locator(".active-code").innerText());
      await player.page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await speaker.page.bringToFront();
    await speaker.page.getByRole("button", { name: "Start Game", exact: true }).click();
    await speaker.phase("day");
    const positions = [[1280, 742], [1280, 742], [1385, 742], [1500, 742]];
    for (const [index, player] of players.entries()) await player.walkTo(...positions[index]! as [number, number]);
    for (const player of players) {
      await player.page.bringToFront();
      await player.page.getByRole("button", { name: "Join voice", exact: true }).click();
      await expect(player.page.locator(".voice-controls [role=status]")).toHaveText("Listening · microphone muted", { timeout: 20_000 });
    }
    await speaker.page.bringToFront();
    await speaker.page.getByRole("button", { name: "Unmute microphone", exact: true }).click();
    await expect(speaker.page.locator(".voice-controls [role=status]")).toHaveText("Microphone on", { timeout: 15_000 });
    const speakerId = speaker.latest("room_snapshot")!.selfPlayerId;
    for (const player of [near, faded]) {
      await player.page.bringToFront();
      await expect.poll(() => player.page.evaluate(() => window.browserAudio.raw), { timeout: 20_000 }).toBeGreaterThan(.01);
    }
    expect(near.latest("voice_peers")!.peers.find(peer => peer.playerId === speakerId)!.gain).toBe(1);
    expect(faded.latest("voice_peers")!.peers.find(peer => peer.playerId === speakerId)!.gain).toBeGreaterThan(0);
    expect(faded.latest("voice_peers")!.peers.find(peer => peer.playerId === speakerId)!.gain).toBeLessThan(.9);
    expect(far.latest("voice_peers")!.peers.some(peer => peer.playerId === speakerId)).toBe(false);
    await far.page.bringToFront();
    await expect.poll(() => far.page.evaluate(() => window.browserAudio.raw)).toBeLessThan(.001);
    await speaker.page.bringToFront();
    await speaker.page.getByRole("textbox", { name: "Chat message" }).fill("Only nearby listeners hear this");
    await speaker.page.getByRole("button", { name: "Send", exact: true }).click();
    await near.page.bringToFront();
    await expect(near.page.locator(".chat-log")).toContainText("Only nearby listeners hear this");
    await far.page.bringToFront();
    await expect(far.page.locator(".chat-log")).not.toContainText("Only nearby listeners hear this");
    const oldToken = near.latest("voice_state")!.token!;
    await near.page.reload();
    await near.phase("day");
    await expect(near.page.locator(".voice-controls [role=status]")).toHaveText("Listening · microphone muted", { timeout: 20_000 });
    await expect.poll(() => near.page.evaluate(() => window.browserAudio.raw), { timeout: 20_000 }).toBeGreaterThan(.01);
    expect(near.latest("voice_state")!.token).not.toBe(oldToken);
    expect(await near.page.evaluate(async ({ token, port }) => (await fetch(`http://localhost:${port}/voice/rtc/validate?access_token=${encodeURIComponent(token)}`)).status,
      { token: oldToken, port: process.env.PU_TOWN_E2E_BACKEND_PORT ?? "18081" })).toBe(403);
    await far.walkTo(1280, 742);
    await expect.poll(() => far.page.evaluate(() => window.browserAudio.raw), { timeout: 20_000 }).toBeGreaterThan(.01);
    await expect(far.page.locator(".chat-log")).not.toContainText("Only nearby listeners hear this");
    await far.page.reload();
    await far.phase("day");
    await expect(far.page.locator(".chat-log")).not.toContainText("Only nearby listeners hear this");
    await speaker.page.bringToFront();
    await speaker.page.getByRole("button", { name: "Leave voice", exact: true }).click();
    await near.page.bringToFront();
    await expect.poll(() => near.page.evaluate(() => window.browserAudio.raw), { timeout: 10_000 }).toBeLessThan(.001);
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
