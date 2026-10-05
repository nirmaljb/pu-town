import { expect, test } from "@playwright/test";
import { Player } from "./player.js";

test("#39–40 Solo Practice previews every Role, sleeping choices and ballots without competitive Players", async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const host = new Player(await contexts[0]!.newPage(), "Practice Host");
    const guest = new Player(await contexts[1]!.newPage(), "Practice Guest");
    await host.enter();
    await expect(host.page.getByRole("button", { name: "Start Game", exact: true })).toBeDisabled();
    await guest.enter(await host.page.locator(".active-code").innerText());
    await expect(guest.page.getByRole("button", { name: "Solo Practice", exact: true })).toBeHidden();
    await host.page.bringToFront();
    await expect(host.page.getByRole("button", { name: "Solo Practice", exact: true })).toBeHidden();
    await guest.page.getByRole("button", { name: "Leave Room", exact: true }).click();
    await host.page.bringToFront();
    await host.page.getByRole("button", { name: "Solo Practice", exact: true }).click();
    await host.phase("day");
    expect(host.latest("game_state")!.players).toHaveLength(1);
    await expect(host.page.locator(".game-countdown")).toHaveText("Advance when ready");
    const position = host.latest("field_state")!.self;
    await host.walkAxis("y", position.y + 55);
    await host.page.getByRole("button", { name: "Next phase", exact: true }).click();
    await host.phase("night");
    await expect(host.page.locator("body")).toHaveClass(/sleeping/);
    const sleeping = host.latest("field_state")!.self.y;
    await host.page.keyboard.down("s");
    await host.page.waitForTimeout(500);
    await host.page.keyboard.up("s");
    expect(host.latest("field_state")!.self.y).toBe(sleeping);
    for (const role of ["mafia", "doctor", "sheriff"] as const) {
      await host.page.getByRole("combobox", { name: "Preview Role", exact: true }).selectOption(role);
      await expect.poll(() => host.latest("game_state")!.self.role).toBe(role);
      await expect(host.page.locator(".action-title")).toContainText(role === "mafia" ? "victim" : role === "doctor" ? "protection" : "investigation");
      const target = host.page.locator(".target-list button").first();
      const name = await target.innerText();
      await target.click();
      await host.page.getByRole("button", { name: "Set Night choice", exact: true }).click();
      await expect(host.page.locator(".action-hint")).toContainText(`Current choice: ${name}`);
    }
    await host.page.reload();
    await host.phase("night");
    await expect(host.page.getByRole("combobox", { name: "Preview Role", exact: true })).toHaveValue("sheriff");
    await expect(host.page.locator(".action-hint")).not.toContainText("Current choice: Nobody");
    await host.page.getByRole("button", { name: "Next phase", exact: true }).click();
    await host.phase("discussion");
    expect(host.latest("game_state")!.self.investigations).toHaveLength(1);
    await host.page.getByRole("button", { name: "Next phase", exact: true }).click();
    await host.phase("voting");
    await host.page.locator(".target-list button").first().click();
    await host.page.getByRole("button", { name: "Confirm ballot", exact: true }).click();
    await expect(host.page.locator(".action-hint")).toContainText("Locked in:");
    await host.page.getByRole("button", { name: "Next phase", exact: true }).click();
    await host.phase("voting_result");
    await expect(host.page.locator(".game-announcement")).toContainText("Role");
    await host.page.getByRole("button", { name: "Next phase", exact: true }).click();
    await host.phase("day");
    expect(host.latest("game_state")!.winner).toBeNull();
    expect(host.latest("game_state")!.players).toHaveLength(1);
    await host.page.getByRole("button", { name: "Leave Room", exact: true }).click();
    await expect(host.page.getByRole("button", { name: "Create Room", exact: true })).toBeVisible();
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
