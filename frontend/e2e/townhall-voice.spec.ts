import { expect, test } from "@playwright/test";
import { GAME_URL } from "./environment.js";

test.skip(!process.env.PUTOWN_VOICE_KEY, "Start LiveKit and source its local.env to run real media acceptance.");

test("an eliminated Participant hears real Townhall audio, cannot publish, and recovers listening only", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ permissions: ["microphone"] })));
  try {
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    // Observe delivered PCM at the browser audio boundary, independently of labels
    // or mute controls. This changes no Game or media authorization.
    for (const page of pages) await page.addInitScript(() => {
      const observed: AnalyserNode[] = [];
      const original = AudioContext.prototype.createMediaStreamSource;
      AudioContext.prototype.createMediaStreamSource = function(stream) {
        const source = original.call(this, stream);
        const analyser = this.createAnalyser();
        source.connect(analyser); observed.push(analyser);
        return source;
      };
      Object.assign(window, { receivedVoicePeak: () => Math.max(0, ...observed.map(analyser => {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return Math.max(...samples.map(Math.abs));
      })) });
    });
    const grants = new Map<number, { token: string; canPublish: boolean }>();
    const phases: (string | undefined)[] = [];
    for (const [index, page] of pages.entries()) {
      page.on("websocket", socket => {
        if (!socket.url().includes("/ws/game")) return;
        socket.on("framereceived", frame => {
          const event = JSON.parse(String(frame.payload)) as { type: string; token: string; canPublish: boolean; phase?: string };
          if (event.type === "voice_state" && event.token) grants.set(index, event);
          if (event.type === "game_state") phases[index] = event.phase;
        });
      });
      await page.bringToFront();
      await page.goto(GAME_URL);
      await page.getByLabel("Display Name", { exact: true }).fill(`Voice Player ${index}`);
      if (index === 0) await page.getByRole("button", { name: "Create Room" }).click();
      else {
        await page.getByLabel("Room Code", { exact: true }).fill(await pages[0]!.locator(".active-code").innerText());
        await page.getByRole("button", { name: "Join Lobby" }).click();
      }
      await page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await pages[0]!.bringToFront();
    await pages[0]!.getByRole("button", { name: "Start Game" }).click();
    console.log("Five independent Players started; following real phase deadlines.");
    for (const page of pages) await expect(page.locator(".role-name")).not.toHaveText("");
    const roles = await Promise.all(pages.map(page => page.locator(".role-name").innerText()));
    const victimIndex = roles.indexOf("Villager");
    const victim = pages[victimIndex]!;
    const speakerIndex = roles.indexOf("Mafia");
    const speaker = pages[speakerIndex]!;
    await expect.poll(() => phases[speakerIndex], { timeout: 205_000 }).toBe("night");
    await speaker.bringToFront();
    await expect(speaker.locator(".game-phase")).toHaveText("Night · Sleeping");
    await speaker.locator(".target-list").getByRole("button", { name: `Voice Player ${victimIndex}`, exact: true }).click();
    await speaker.getByRole("button", { name: "Set Night choice" }).click();
    await expect.poll(() => phases[victimIndex], { timeout: 25_000 }).toBe("discussion");
    await victim.bringToFront();
    await expect(victim.locator(".game-phase")).toContainText("Townhall");
    await victim.getByRole("button", { name: "Join voice", exact: true }).click();
    await expect(victim.locator(".voice-controls [role=status]")).toHaveText("Listening only · eliminated", { timeout: 20_000 });
    console.log("Eliminated Participant joined receive-only Townhall voice.");
    await expect(victim.getByRole("button", { name: "Unmute microphone" })).toBeDisabled();
    expect(grants.get(victimIndex)?.canPublish).toBe(false);
    const oldToken = grants.get(victimIndex)!.token;
    await speaker.bringToFront();
    await speaker.getByRole("button", { name: "Join voice", exact: true }).click();
    await expect(speaker.getByRole("button", { name: "Unmute microphone" })).toBeEnabled({ timeout: 20_000 });
    await speaker.getByRole("button", { name: "Unmute microphone" }).click();
    await expect(speaker.locator(".voice-controls [role=status]")).toHaveText("Microphone on", { timeout: 15_000 });
    await victim.bringToFront();
    const peak = () => victim.evaluate(() => (window as unknown as { receivedVoicePeak(): number }).receivedVoicePeak());
    await expect.poll(peak, { timeout: 20_000 }).toBeGreaterThan(0.01);
    console.log("Eliminated browser received nonzero PCM from the living speaker.");
    await victim.reload();
    await expect(victim.locator(".game-banner")).toBeVisible();
    await expect(victim.locator(".voice-controls [role=status]")).toHaveText("Listening only · eliminated", { timeout: 20_000 });
    await expect.poll(peak, { timeout: 20_000 }).toBeGreaterThan(0.01);
    expect(grants.get(victimIndex)?.token).not.toBe(oldToken);
    // A modified client sends an audio AddTrack directly to the gateway. It is
    // closed without a publication acknowledgement; the living stream continues.
    const rejection = await victim.evaluate(async ({ token, endpoint }) => {
      return await new Promise<number>((resolve, reject) => {
        const url = new URL(endpoint); url.pathname = "/voice/rtc";
        url.search = new URLSearchParams({ access_token: token, protocol: "16", sdk: "js", auto_subscribe: "1" }).toString();
        const socket = new WebSocket(url); socket.binaryType = "arraybuffer";
        const timer = setTimeout(() => { socket.close(); reject(new Error("Publication rejection timed out")); }, 10_000);
        socket.onmessage = () => {
          socket.onmessage = () => {};
          socket.send(new Uint8Array([34, 9, 10, 5, 103, 104, 111, 115, 116, 24, 0]));
        };
        socket.onclose = event => { clearTimeout(timer); resolve(event.code); };
      });
    }, { token: grants.get(victimIndex)!.token, endpoint: new URL(GAME_URL, "http://localhost:5173").searchParams.get("ws")! });
    expect(rejection).toBe(4003);
    await speaker.bringToFront();
    await expect(speaker.locator(".voice-controls [role=status]")).toHaveText("Microphone on");
    // Establish a living speaker's stream before a Townhall elimination, then
    // prove its audio and credential are revoked rather than merely hidden.
    await speaker.getByRole("button", { name: "Mute microphone", exact: true }).click();
    const condemnedIndex = roles.indexOf("Doctor");
    const condemned = pages[condemnedIndex]!;
    await condemned.bringToFront();
    await condemned.getByRole("button", { name: "Join voice", exact: true }).click();
    await expect(condemned.getByRole("button", { name: "Unmute microphone" })).toBeEnabled({ timeout: 20_000 });
    await condemned.getByRole("button", { name: "Unmute microphone" }).click();
    const livingToken = grants.get(condemnedIndex)!.token;
    await expect(condemned.locator(".voice-controls [role=status]")).toHaveText("Microphone on", { timeout: 15_000 });
    await victim.bringToFront();
    if (await victim.getByRole("button", { name: "Join voice", exact: true }).isVisible()) await victim.getByRole("button", { name: "Join voice", exact: true }).click();
    await expect(victim.locator(".voice-controls [role=status]")).toHaveText("Listening only · eliminated", { timeout: 20_000 });
    await expect.poll(peak, { timeout: 20_000 }).toBeGreaterThan(0.01);
    await expect.poll(() => phases[speakerIndex], { timeout: 100_000 }).toBe("voting");
    for (const [index, page] of pages.entries()) if (index !== victimIndex) {
      await page.bringToFront();
      await page.locator(".target-list").getByRole("button", { name: `Voice Player ${condemnedIndex}`, exact: true }).click();
      await page.getByRole("button", { name: "Confirm ballot" }).click();
    }
    await expect.poll(() => phases[condemnedIndex], { timeout: 35_000 }).toBe("voting_result");
    await condemned.bringToFront();
    await expect(condemned.locator(".game-phase")).toHaveText("The verdict");
    await expect(condemned.locator(".voice-controls [role=status]")).toHaveText("Voice access ended");
    await victim.bringToFront();
    await expect.poll(peak, { timeout: 10_000 }).toBeLessThan(0.001);
    const retired = await victim.evaluate(async ({ token, endpoint }) => {
      const url = new URL(endpoint); url.pathname = "/voice/rtc/validate";
      url.protocol = "http:"; url.search = new URLSearchParams({ access_token: token }).toString();
      return (await fetch(url)).status;
    }, { token: livingToken, endpoint: new URL(GAME_URL, "http://localhost:5173").searchParams.get("ws")! });
    expect(retired).toBe(403);
    console.log("Elimination stopped the established stream and retired its living credential.");
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
