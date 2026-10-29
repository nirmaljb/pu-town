// Four Players, each in their own isolated browser, play one whole Game through this computer's
// network address — the same path the other computers on the network take.
//
// Needs both servers running (`python run.py` from the repository root), then:
//
//   npm run test:e2e
//
// PU_TOWN_URL overrides the page address, e.g. PU_TOWN_URL=https://192.168.1.5:5173/
// (run.py serves https so that voice chat may use a microphone; --http serves plain http).
// The Game runs on the server's real clock, so this takes about three minutes.
import test from "node:test";
import assert from "node:assert/strict";
import { networkInterfaces } from "node:os";
import { chromium } from "playwright";
import { BUTTON_X, BUTTON_Y } from "../dist/room-rules.js";

const VIRTUAL_ADAPTER = /vmware|virtualbox|vethernet|wsl|hyper-v|docker|loopback|tailscale|zerotier/i;

/** This computer's address on the local network, as another computer would use it. */
function networkAddress() {
  const candidates = Object.entries(networkInterfaces())
    .flatMap(([name, addresses]) => (addresses ?? []).map(address => ({ name, ...address })))
    .filter(a => a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254."));
  return (candidates.find(a => !VIRTUAL_ADAPTER.test(a.name)) ?? candidates[0])?.address ?? "localhost";
}

const PAGE_URL = process.env.PU_TOWN_URL ?? `https://${networkAddress()}:5173/`;
const BACKEND_URL = `http://${new URL(PAGE_URL).hostname}:8080`;
const NAMES = ["Asha", "Bodhi", "Chen", "Dara"];

/** One Player: their page and every Game message the server sent them, decoded from the wire. */
async function openPlayer(browser, name) {
  // run.py's certificate is self-signed; a real Player accepts it once in the browser.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true, permissions: ["microphone"] });
  const page = await context.newPage();
  // Keeps every voice connection the page opens, so the test can ask whether audio flows.
  await page.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    window.__voiceConnections = [];
    window.RTCPeerConnection = class extends Native {
      constructor(...args) { super(...args); window.__voiceConnections.push(this); }
    };
  });
  const player = { name, page, errors: [], gameStates: [], fieldStates: [] };
  page.on("pageerror", error => player.errors.push(error.message));
  page.on("websocket", socket => socket.on("framereceived", frame => {
    let message;
    try { message = JSON.parse(String(frame.payload)); } catch { return; }
    if (message.type === "game_state") player.gameStates.push(message);
    if (message.type === "field_state") player.fieldStates.push(message);
  }));
  await page.goto(PAGE_URL);
  return player;
}

const phaseOf = player => player.page.locator(".game-phase");
const lastGame = player => player.gameStates.at(-1);

/**
 * Brings a Player's page to the front and focuses the town. A browser only runs animation
 * frames — and so the Game's walking loop — for the page in front, like a real window.
 */
async function focus(player) {
  await player.page.bringToFront();
  await player.page.locator("canvas").click({ position: { x: 640, y: 300 } });
}

/** Walks a Player with the arrow keys until the server places them within `near` of (x, y). */
async function walkTo(player, x, y, near) {
  await focus(player);
  const keyboard = player.page.keyboard;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const self = player.fieldStates.at(-1).self;
    const dx = x - self.x;
    const dy = y - self.y;
    if (Math.hypot(dx, dy) <= near) return;
    const keys = [];
    if (Math.abs(dx) > near / 2) keys.push(dx > 0 ? "ArrowRight" : "ArrowLeft");
    if (Math.abs(dy) > near / 2) keys.push(dy > 0 ? "ArrowDown" : "ArrowUp");
    // Hold long enough for several frames: a headless browser running four Games draws few.
    for (const key of keys) await keyboard.down(key);
    await player.page.waitForTimeout(500);
    for (const key of keys) await keyboard.up(key);
    await player.page.waitForTimeout(200);
  }
  const self = player.fieldStates.at(-1).self;
  assert.fail(`${player.name} could not walk to (${x}, ${y}); stopped at (${self.x}, ${self.y})`);
}

async function waitForPhase(players, title, timeout) {
  await Promise.all(players.map(player =>
    phaseOf(player).filter({ hasText: title }).waitFor({ timeout })));
}

test("four computers play a whole Game over the network", { timeout: 300_000 }, async t => {
  const health = await fetch(`${BACKEND_URL}/health`).catch(() => null);
  assert.ok(health?.ok, `The backend is not reachable at ${BACKEND_URL}. Start it with \`python run.py\`.`);

  // A fake microphone plays a steady tone, so audio can be measured arriving at each peer.
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  t.after(() => browser.close());
  const players = [];
  for (const name of NAMES) players.push(await openPlayer(browser, name));
  const [host, ...guests] = players;
  const byRole = {};
  let failed = false;
  const step = async (name, body) => {
    if (failed) return t.test(name, { skip: "an earlier step failed" });
    await t.test(name, async () => {
      try { await body(); } catch (error) { failed = true; throw error; }
    });
  };

  await step("the page loads from the network address and reaches the backend", async () => {
    assert.equal(await host.page.locator("#entry-title").textContent(), "PU Town");
  });

  let roomCode = "";
  await step("one Player creates a Room and three join it with its code", async () => {
    await host.page.fill("#display-name", host.name);
    await host.page.click('button[value="create"]');
    await host.page.locator(".active-code").filter({ hasText: /^\w{6}$/ }).waitFor({ timeout: 15_000 });
    roomCode = (await host.page.locator(".active-code").textContent()).trim();
    for (const guest of guests) {
      await guest.page.fill("#display-name", guest.name);
      await guest.page.fill("#room-code", roomCode);
      await guest.page.click('button[value="join"]');
      await guest.page.locator(".active-code").filter({ hasText: roomCode }).waitFor({ timeout: 15_000 });
    }
    for (const player of players) {
      await player.page.locator(".occupancy").filter({ hasText: "4 / 10" }).waitFor({ timeout: 10_000 });
    }
  });

  await step("everyone who joins voice hears everyone else in the Lobby, browser to browser", async () => {
    for (const player of players) await player.page.click(".voice-toggle");
    for (const player of players) {
      await player.page.locator(".voice-toggle").filter({ hasText: "Live" }).waitFor({ timeout: 10_000 });
      await player.page.waitForFunction(async () => {
        const live = window.__voiceConnections.filter(pc => pc.connectionState === "connected");
        if (live.length !== 3) return false;
        for (const pc of live) {
          let bytes = 0;
          (await pc.getStats()).forEach(report => { if (report.type === "inbound-rtp" && report.kind === "audio") bytes += report.bytesReceived; });
          if (bytes === 0) return false;
        }
        return true;
      }, null, { timeout: 20_000, polling: 500 });
    }
  });

  await step("the Host can start only once everyone is Ready", async () => {
    const start = host.page.locator(".start-game");
    for (const player of players.slice(0, 3)) await player.page.click(".ready-toggle");
    await host.page.waitForTimeout(500);
    assert.equal(await start.isDisabled(), true, "Start must wait for the last Player to be Ready");
    await players[3].page.click(".ready-toggle");
    await host.page.locator(".start-game:not([disabled])").click({ timeout: 10_000 });
  });

  await step("each Player privately receives exactly one Role of the default deal", async () => {
    await waitForPhase(players, "Your role", 15_000);
    for (const player of players) {
      await player.page.locator(".role-name").filter({ hasText: /\w/ }).waitFor({ timeout: 10_000 });
      player.role = (await player.page.locator(".role-name").textContent()).trim().toLowerCase();
      byRole[player.role] = player;
    }
    assert.deepEqual(players.map(p => p.role).sort(), ["doctor", "mafia", "sheriff", "villager"]);
  });

  await step("the server tells nobody else who the Mafia are", async () => {
    for (const player of players) {
      const self = lastGame(player).self;
      assert.equal(self.role, player.role, `${player.name}'s screen matches what the server sent`);
      assert.equal(lastGame(player).roles, null, "every Role stays hidden until the Game ends");
      if (player.role === "mafia") assert.ok(Array.isArray(self.mafiaTeam));
      else assert.equal(self.mafiaTeam, null, `${player.name} must not receive the Mafia team`);
      for (const message of player.gameStates) {
        assert.equal(message.roles, null, `${player.name} received a Role reveal mid-Game`);
      }
    }
  });

  await step("the Roam starts for everyone at the same time", async () => {
    await waitForPhase(players, "Roam the town", 20_000);
  });

  await step("a Player walks and the server accepts their steps and shows them to the others", async () => {
    const walker = byRole.villager;
    const watchers = players.filter(p => p !== walker);
    const playerId = lastGame(walker).players.find(p => p.displayName === walker.name).playerId;
    const seenX = watcher => watcher.fieldStates.at(-1)?.players.find(p => p.playerId === playerId)?.x;
    const startX = walker.fieldStates.at(-1).self.x;
    const watchersStartX = watchers.map(seenX);
    await focus(walker);
    await walker.page.keyboard.down("ArrowRight");
    await walker.page.waitForTimeout(900);
    await walker.page.keyboard.up("ArrowRight");
    await walker.page.waitForTimeout(600);
    const endX = walker.fieldStates.at(-1).self.x;
    assert.ok(endX > startX + 50, `the server moved ${walker.name} from x=${startX} only to x=${endX}`);
    const followed = watchers.filter((watcher, i) =>
      watchersStartX[i] !== undefined && seenX(watcher) !== undefined && seenX(watcher) > watchersStartX[i] + 50);
    assert.ok(followed.length > 0, "at least one other Player watched the step happen");
    await walker.page.keyboard.down("ArrowLeft");
    await walker.page.waitForTimeout(900);
    await walker.page.keyboard.up("ArrowLeft");
  });

  await step("an Emergency Meeting at the button calls everyone to the table", async () => {
    const caller = byRole.sheriff;
    // Every Seat is further from the button than the Emergency range, so walk there first.
    await walkTo(caller, BUTTON_X, BUTTON_Y, 100);
    // Abilities wait out the Roam's opening cooldown; keep pressing until the Meeting is called.
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && lastGame(caller).phase === "roam") {
      await caller.page.keyboard.press("f");
      await caller.page.waitForTimeout(1_000);
    }
    await waitForPhase(players, "Meeting called!", 5_000);
    for (const player of players) {
      assert.equal(lastGame(player).outcome.kind, "emergency");
    }
  });

  await step("public chat in the Discussion reaches every Player", async () => {
    await waitForPhase(players, "Meeting · Discussion", 15_000);
    const speaker = byRole.doctor;
    await speaker.page.bringToFront();
    await speaker.page.fill(".chat-input", `I think it's ${byRole.mafia.name}`);
    await speaker.page.press(".chat-input", "Enter");
    for (const player of players) {
      await player.page.locator(".chat-log").filter({ hasText: `I think it's ${byRole.mafia.name}` })
        .waitFor({ timeout: 10_000 });
    }
  });

  await step("a Player who refreshes mid-Game gets their Role and the chat back", async () => {
    const villager = byRole.villager;
    await villager.page.bringToFront();
    await villager.page.reload();
    await villager.page.locator(".role-name").filter({ hasText: "Villager" }).waitFor({ timeout: 20_000 });
    await villager.page.locator(".chat-log").filter({ hasText: `I think it's ${byRole.mafia.name}` })
      .waitFor({ timeout: 10_000 });
    await phaseOf(villager).filter({ hasText: "Meeting · Discussion" }).waitFor({ timeout: 10_000 });
  });

  await step("the Village votes the Mafia out", async () => {
    await waitForPhase(players, "Meeting · Voting", 100_000);
    for (const player of players) {
      await player.page.bringToFront();
      const ballot = player.page.locator(".action-panel");
      await ballot.waitFor({ state: "visible", timeout: 10_000 });
      const choice = player.role === "mafia" ? "Skip — eliminate nobody" : byRole.mafia.name;
      await ballot.getByRole("button", { name: choice, exact: true }).click();
      await player.page.click(".confirm-action");
      await player.page.locator(".action-hint").filter({ hasText: "Locked in" }).waitFor({ timeout: 10_000 });
    }
    await waitForPhase(players, "The verdict", 40_000);
    for (const player of players) {
      const outcome = lastGame(player).outcome;
      assert.equal(outcome.eliminatedMafia, true);
      assert.equal(lastGame(player).ballots.length, 4, "every ballot is shown with the result");
      await player.page.locator(".outcome-verdict").filter({ hasText: "They were Mafia." }).waitFor({ timeout: 5_000 });
    }
  });

  await step("the Village wins and every Role is revealed to everyone", async () => {
    await waitForPhase(players, "Game over", 15_000);
    for (const player of players) {
      assert.equal(lastGame(player).winner, "village");
      assert.equal(await player.page.locator(".game-announcement").textContent(), "The Village wins.");
      const reveal = player.page.locator(".results-panel li").filter({ hasText: " — " });
      assert.equal(await reveal.count(), 4);
      assert.match(await player.page.locator(".results-panel").textContent(), new RegExp(`${byRole.mafia.name} — Mafia`));
    }
  });

  await step("no page threw an error", async () => {
    assert.deepEqual(players.flatMap(p => p.errors.map(e => `${p.name}: ${e}`)), []);
  });
});
