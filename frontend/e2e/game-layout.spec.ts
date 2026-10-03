import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`independent Players enter, play on a centered map and Leave at ${viewport.width}px`, async ({ browser }) => {
    const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport })));
    try {
      const pages = await Promise.all(contexts.map(context => context.newPage()));
      const host = pages[0]!;
      // Observe the real wire boundary without adding production test APIs.
      type Position = { x: number; y: number; correction: number };
      type View = { phase?: string; self?: Position & { role?: string }; players?: { playerId: string; x: number; y: number }[] };
      const fields: (View | undefined)[] = [];
      const games: (View | undefined)[] = [];
      const fieldCounts = pages.map(() => 0);
      for (const [index, page] of pages.entries()) {
        page.on("websocket", socket => socket.on("framereceived", ({ payload }) => {
          const event = JSON.parse(String(payload)) as View & { type: string };
          if (event.type === "field_state") { fields[index] = event; fieldCounts[index]!++; }
          if (event.type === "game_state") games[index] = event;
        }));
      }
      for (const [index, page] of pages.entries()) {
        await page.bringToFront();
        await page.goto(`/?ws=ws://localhost:${process.env.PU_TOWN_E2E_BACKEND_PORT ?? "18081"}/ws/game`);
        const name = index === 0 ? "Host with a lengthy name" : `Player ${index + 1}`;
        await page.getByLabel("Display Name", { exact: true }).fill(name);
        await expect(page.getByLabel("Display Name", { exact: true })).toHaveValue(name);
        if (index === 0) {
          await page.getByRole("button", { name: "Create Room" }).click();
        } else {
          await page.getByLabel("Room Code", { exact: true }).fill(await host.locator(".active-code").innerText());
          await page.getByRole("button", { name: "Join Lobby" }).click();
        }
        await expect(page.locator(".room-bar")).toBeVisible();
        await expect(page.getByRole("button", { name: "Copy code", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Ready", exact: true }).click();
      }
      await expect(host.locator(".occupancy")).toHaveText("4 / 10 Players");
      await expect(host.getByRole("button", { name: "Start Game" })).toBeEnabled();
      await host.getByRole("button", { name: "Start Game" }).click();
      for (const page of pages) {
        await expect(page.locator(".game-banner")).toBeVisible();
        await expect(page.getByRole("button", { name: "Copy code", exact: true })).toBeHidden();
        await expect(page.getByRole("button", { name: "Leave Room", exact: true })).toBeVisible();
        await expect.poll(async () => page.locator("canvas").evaluate(canvas => {
          const box = canvas.getBoundingClientRect();
          return Math.abs(box.x + box.width / 2 - innerWidth / 2);
        })).toBeLessThan(2);
        const stage = await page.locator("#stage").boundingBox();
        expect(stage!.width).toBe(viewport.width);
        const controls = await page.getByRole("region", { name: "Game controls" }).boundingBox();
        expect(controls!.x).toBeGreaterThanOrEqual(stage!.x);
        expect(controls!.x + controls!.width).toBeLessThanOrEqual(stage!.x + stage!.width);
        expect(controls!.y).toBeGreaterThanOrEqual(stage!.y);
        expect(controls!.y + controls!.height).toBeLessThanOrEqual(stage!.y + stage!.height);
      }
      await host.bringToFront();
      await expect(host.locator(".game-phase")).toHaveText("Day · Explore the town", { timeout: 15_000 });
      await expect(host.locator(".role-card")).not.toHaveAttribute("open", "");
      await host.locator(".role-card summary").click();
      await expect(host.locator(".role-brief").first()).toBeVisible();
      await host.locator(".role-card summary").click();
      await expect(host.locator(".ability-bar")).toHaveCount(0);
      await expect.poll(() => fields[0]?.self?.y).toBeDefined();
      const start = { ...fields[0]!.self! };
      await host.keyboard.down("s");
      try {
        await expect.poll(() => fields[0]?.self?.y).toBeGreaterThan(start.y + 40);
      } finally {
        await host.keyboard.up("s");
      }
      // The clock is real: Day cannot be interrupted by an Emergency or Report.
      await expect(host.locator(".game-phase")).toHaveText("Night · Sleeping", { timeout: 185_000 });
      for (const page of pages) {
        await page.bringToFront();
        await expect(page.locator(".game-phase")).toHaveText("Night · Sleeping");
        await expect(page.locator("body")).toHaveClass(/sleeping/);
        await expect(page.getByRole("textbox", { name: "Chat message" })).toBeHidden();
      }
      await host.bringToFront();
      const sleeping = { ...fields[0]!.self! };
      const beforeNightFields = fieldCounts[0]!;
      await host.keyboard.down("s");
      try {
        await expect.poll(() => fieldCounts[0]).toBeGreaterThan(beforeNightFields + 3);
        expect(fields[0]!.self!.x).toBe(sleeping.x);
        expect(fields[0]!.self!.y).toBe(sleeping.y);
      } finally {
        await host.keyboard.up("s");
      }
      await host.screenshot({ path: test.info().outputPath("sleeping-night.png") });
      const role = games[0]!.self!.role;
      await host.reload();
      await expect(host.locator(".game-phase")).toHaveText("Night · Sleeping");
      await expect(host.locator("body")).toHaveClass(/sleeping/);
      expect(fields[0]!.self!.y).toBe(sleeping.y);
      expect(games[0]!.self!.role).toBe(role);
      await expect(host.locator(".game-phase")).toHaveText("Townhall · Discussion", { timeout: 25_000 });
      await host.getByRole("textbox", { name: "Chat message" }).fill("Meet in the Town Square");
      await host.getByRole("button", { name: "Send", exact: true }).click();
      for (const page of pages) {
        await page.bringToFront();
        await expect(page.locator(".chat-log")).toContainText("Meet in the Town Square");
        const banner = await page.locator(".game-banner").boundingBox();
        const role = await page.locator(".role-card").boundingBox();
        expect(role!.y).toBeGreaterThanOrEqual(banner!.y + banner!.height);
        const chat = await page.locator(".chat-panel").boundingBox();
        expect(chat!.x).toBeGreaterThanOrEqual(0);
        expect(chat!.x + chat!.width).toBeLessThanOrEqual(viewport.width);
        expect(chat!.y).toBeGreaterThanOrEqual(76);
        expect(chat!.y + chat!.height).toBeLessThanOrEqual(viewport.height);
      }
      await expect(host.locator(".game-phase")).toHaveText("Townhall · Voting", { timeout: 95_000 });
      if (viewport.width === 1280) await host.setViewportSize({ width: 844, height: 390 });
      await expect(host.getByRole("button", { name: "Confirm ballot" })).toBeDisabled();
      await host.getByRole("button", { name: "Skip — eliminate nobody" }).click();
      await host.getByRole("button", { name: "Confirm ballot" }).click();
      await expect(host.locator(".action-hint")).toHaveText("Locked in: Skip");
      const ballot = await host.locator(".action-panel").boundingBox();
      const chat = await host.locator(".chat-panel").boundingBox();
      expect(ballot!.y + ballot!.height).toBeLessThanOrEqual(chat!.y);
      if (viewport.width === 1280) {
        await host.screenshot({ path: test.info().outputPath("landscape-layout.png") });
        await host.setViewportSize(viewport);
      }
      await host.screenshot({ path: test.info().outputPath("game-layout.png") });
      await host.bringToFront();
      await expect(host.locator(".game-phase")).toHaveText("The verdict", { timeout: 35_000 });
      await expect(host.locator(".game-announcement")).toContainText("Nobody was eliminated");
      await expect(host.locator(".game-phase")).toHaveText("Day · Explore the town", { timeout: 10_000 });
      await expect.poll(() => fields[0]?.self?.y).toBe(start.y);
      await expect(host.locator(".game-round")).toHaveText("Round 2");
      await expect(host.locator("body")).not.toHaveClass(/sleeping/);
      await pages[1]!.bringToFront();
      await pages[1]!.getByRole("button", { name: "Leave Room", exact: true }).click();
      await expect(pages[1]!.getByRole("button", { name: "Create Room" })).toBeVisible();
      await expect(host.locator(".occupancy")).toHaveText("3 / 10 Players");
      await pages[1]!.getByRole("button", { name: "Create Room" }).click();
      await expect(pages[1]!.getByRole("button", { name: "Copy code", exact: true })).toBeVisible();
      await expect(pages[1]!.locator(".occupancy")).toHaveText("1 / 10 Players");
    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  });
}
