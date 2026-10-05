import { expect, test } from "@playwright/test";

// Observe the actual transport; no production test API or simulated Game state.
test("Players preview, confirm and recover private Townhall ballots while chat stays open", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  try {
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const host = pages[0]!;
    const roles: (string | undefined)[] = [];
    const phases: (string | undefined)[] = [];
    const submitted: unknown[][] = pages.map(() => []);
    for (const [index, page] of pages.entries()) {
      page.on("websocket", socket => {
        socket.on("framereceived", ({ payload }) => {
          const event = JSON.parse(String(payload)) as { type: string; phase?: string; self?: { role: string } };
          if (event.type === "game_state") { roles[index] = event.self!.role; phases[index] = event.phase; }
        });
        socket.on("framesent", ({ payload }) => {
          const event = JSON.parse(String(payload)) as { type: string };
          if (event.type === "meeting_vote") submitted[index]!.push(event);
        });
      });
      await page.bringToFront();
      await page.goto(`/?ws=ws://localhost:${process.env.PU_TOWN_E2E_BACKEND_PORT ?? "18081"}/ws/game`);
      const name = `Player ${index + 1}`;
      await page.getByLabel("Display Name", { exact: true }).fill(name);
      await expect(page.getByLabel("Display Name", { exact: true })).toHaveValue(name);
      if (index === 0) {
        await page.getByRole("button", { name: "Create Room" }).click();
      } else {
        await page.getByLabel("Room Code", { exact: true }).fill(await host.locator(".active-code").innerText());
        await page.getByRole("button", { name: "Join Lobby" }).click();
      }
      await expect(page.locator(".room-bar")).toBeVisible();
      await page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await host.bringToFront();
    await host.getByRole("button", { name: "Start Game" }).click();
    await expect.poll(() => phases[0], { timeout: 315_000 }).toBe("voting");
    await host.bringToFront();
    await expect(host.locator(".action-panel")).toBeVisible();
    await expect(host.getByRole("button", { name: "Confirm ballot" })).toBeDisabled();
    const target = host.locator(".target-list").getByRole("button", { name: "Player 2", exact: true });
    await target.focus();
    await host.keyboard.press("Enter");
    await expect(target).toHaveAttribute("aria-pressed", "true");
    await expect(target).toBeFocused();
    expect(submitted[0]).toHaveLength(0);
    await expect(host.getByRole("button", { name: "Confirm ballot" })).toBeEnabled();
    const skip = host.getByRole("button", { name: "Skip — eliminate nobody" });
    await skip.click();
    await expect(skip).toHaveAttribute("aria-pressed", "true");
    await expect(target).toHaveAttribute("aria-pressed", "false");
    expect(submitted[0]).toHaveLength(0);
    await host.getByRole("button", { name: "Confirm ballot" }).click();
    await expect(host.locator(".action-hint")).toHaveText("Locked in: Skip");
    await expect(skip).toBeDisabled();
    await expect(skip).toHaveAttribute("aria-pressed", "true");
    await expect(host.getByRole("button", { name: "Confirm ballot" })).toBeHidden();
    expect(submitted[0]).toHaveLength(1);

    const voter = pages[1]!;
    await voter.bringToFront();
    const departingIndex = [2, 3].find(index => roles[index] !== "mafia")!;
    const departingName = `Player ${departingIndex + 1}`;
    const disappearing = voter.locator(".target-list").getByRole("button", { name: departingName, exact: true });
    await disappearing.click();
    await expect(voter.getByRole("button", { name: "Confirm ballot" })).toBeEnabled();
    await pages[departingIndex]!.bringToFront();
    await pages[departingIndex]!.getByRole("button", { name: "Leave Room", exact: true }).click();
    await voter.bringToFront();
    await expect(disappearing).toHaveCount(0);
    await expect(voter.getByRole("button", { name: "Confirm ballot" })).toBeDisabled();
    expect(submitted[1]).toHaveLength(0);
    await voter.locator(".target-list").getByRole("button", { name: "Player 1", exact: true }).click();
    // An inbound chat must not replace the focused choice or discard its preview.
    const remaining = voter.locator(".target-list").getByRole("button", { name: "Player 1", exact: true });
    await remaining.focus();
    await host.bringToFront();
    await host.getByRole("textbox", { name: "Chat message" }).fill("We can still discuss during voting");
    await host.getByRole("button", { name: "Send", exact: true }).click();
    await voter.bringToFront();
    await expect(voter.locator(".chat-log")).toContainText("We can still discuss during voting");
    await expect(remaining).toBeFocused();
    await expect(remaining).toHaveAttribute("aria-pressed", "true");
    await voter.getByRole("button", { name: "Confirm ballot" }).click();
    await expect(voter.locator(".action-hint")).toHaveText("Locked in: Player 1");
    await voter.reload();
    await expect(voter.locator(".action-hint")).toHaveText("Locked in: Player 1");
    await expect(voter.getByRole("button", { name: "Confirm ballot" })).toBeHidden();
    await expect(voter.locator(".target-list").getByRole("button", { name: "Player 1", exact: true })).toBeDisabled();
    await expect(voter.locator(".chat-log")).toContainText("We can still discuss during voting");
    expect(submitted[1]).toHaveLength(1);
    for (const page of pages.filter((_, index) => index >= 2 && index !== departingIndex)) {
      await page.bringToFront();
      await expect(page.locator(".action-hint")).toHaveText("Select a Player, then confirm. A confirmed ballot is final.");
    }
    await host.bringToFront();
    const ballot = await host.locator(".action-panel").boundingBox();
    expect(Math.abs(ballot!.x + ballot!.width / 2 - 640)).toBeLessThan(2);
    await expect(host.locator(".game-phase")).toHaveText("The verdict", { timeout: 35_000 });
    await expect(host.locator(".game-announcement")).toContainText("Nobody was eliminated");
    await expect(host.locator(".action-panel")).toBeHidden();
    await host.locator(".results-panel summary").click();
    await expect(host.locator(".results-content")).toContainText("Player 1 → Skip");
    await expect(host.locator(".results-content")).toContainText("Player 2 → Player 1");
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
