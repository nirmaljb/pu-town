import { expect, test } from "@playwright/test";
import { Player } from "./player.js";

test("#26–29 #37–38 Night choices, Ghost Tasks, Forfeit transfer and Village verdict work across browsers", async ({ browser }) => {
  test.setTimeout(850_000);
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext()));
  try {
    const players = await Promise.all(contexts.map(async (context, index) => new Player(await context.newPage(), `Night Player ${index}`)));
    const host = players[0]!;
    for (const [index, player] of players.entries()) {
      await player.enter(index === 0 ? undefined : await host.page.locator(".active-code").innerText());
      await player.page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await host.page.bringToFront();
    await host.page.getByRole("button", { name: "Start Game", exact: true }).click();
    await host.phase("day");
    const mafia = players.find(player => player.latest("game_state")!.self.role === "mafia")!;
    const doctor = players.find(player => player.latest("game_state")!.self.role === "doctor")!;
    const sheriff = players.find(player => player.latest("game_state")!.self.role === "sheriff")!;
    const villagers = players.filter(player => player.latest("game_state")!.self.role === "villager");
    const choose = async (actor: Player, target: Player) => {
      await actor.page.bringToFront();
      await actor.page.locator(".target-list").getByRole("button", { name: target.name, exact: true }).click();
      await actor.page.getByRole("button", { name: "Set Night choice", exact: true }).click();
      await expect(actor.page.locator(".action-hint")).toContainText(`Current choice: ${target.name}`);
    };
    await mafia.phase("night", 185_000);
    await choose(mafia, villagers[0]!);
    await choose(mafia, sheriff);
    await choose(doctor, doctor);
    await choose(sheriff, mafia);
    await sheriff.page.reload();
    await sheriff.phase("night");
    await expect(sheriff.page.locator(".action-hint")).toContainText(mafia.name);
    await sheriff.phase("discussion", 25_000);
    expect(sheriff.latest("game_state")!.self.status).toBe("eliminated");
    expect(sheriff.latest("game_state")!.self.investigations).toHaveLength(1);
    expect(sheriff.latest("game_state")!.self.investigations![0]!.mafia).toBe(true);
    for (const player of players.filter(player => player !== sheriff)) expect(player.latest("game_state")!.self.investigations).toBeNull();
    await expect(sheriff.page.getByRole("textbox", { name: "Chat message" })).toBeDisabled();
    await expect(sheriff.page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await doctor.page.bringToFront();
    await doctor.page.getByRole("textbox", { name: "Chat message" }).fill("Townhall survivors can speak");
    await doctor.page.getByRole("button", { name: "Send", exact: true }).click();
    await sheriff.page.bringToFront();
    await expect(sheriff.page.locator(".chat-log")).toContainText("Townhall survivors can speak");
    await mafia.phase("voting", 95_000);
    for (const player of players.filter(player => player !== sheriff)) {
      await player.page.bringToFront();
      await player.page.getByRole("button", { name: "Skip — eliminate nobody", exact: true }).click();
      await player.page.getByRole("button", { name: "Confirm ballot", exact: true }).click();
    }
    await sheriff.page.bringToFront();
    await expect(sheriff.page.locator(".action-panel")).toBeHidden();
    await sheriff.phase("day", 40_000);
    const task = sheriff.latest("task_state")!.tasks.find(task => task.kind === "repair")!;
    await sheriff.page.locator(".task-interface summary").click();
    await sheriff.walkTo(task.x, task.y);
    await sheriff.page.locator(".task-interface li").filter({ hasText: task.name }).getByRole("button", { name: "Repair", exact: true }).click();
    await expect(sheriff.page.getByRole("button", { name: "Finish repair step", exact: true })).toBeEnabled({ timeout: 130_000 });
    await sheriff.page.getByRole("button", { name: "Finish repair step", exact: true }).click();
    await expect.poll(() => sheriff.latest("task_state")!.tasks.find(t => t.taskId === task.taskId)!.step).toBe(1);
    const ghostId = sheriff.latest("room_snapshot")!.selfPlayerId;
    for (const player of players.filter(player => player !== sheriff)) {
      expect(player.latest("field_state")!.players.some(avatar => avatar.playerId === ghostId)).toBe(false);
      expect(player.latest("task_state")!.tasks.some(t => t.taskId === task.taskId)).toBe(false);
    }
    await sheriff.page.reload();
    await sheriff.phase("day");
    await expect.poll(() => sheriff.latest("task_state")!.tasks.find(t => t.taskId === task.taskId)!.step).toBe(1);
    const leaving = villagers[0]!;
    const released = leaving.latest("task_state")!.tasks.map(task => task.taskId);
    await leaving.page.bringToFront();
    await leaving.page.getByRole("button", { name: "Leave Room", exact: true }).click();
    await expect(leaving.page.getByRole("button", { name: "Create Room", exact: true })).toBeVisible();
    await expect.poll(() => [doctor, villagers[1]!].flatMap(player => player.latest("task_state")!.tasks.map(task => task.taskId)).filter(id => released.includes(id)).length).toBe(3);
    expect(doctor.latest("task_state")!.total).toBe(12);
    await doctor.phase("night", 65_000);
    await choose(mafia, doctor);
    await choose(doctor, doctor);
    await doctor.phase("discussion", 25_000);
    expect(doctor.latest("game_state")!.self.status).toBe("living");
    await expect(doctor.page.locator(".game-announcement")).toContainText("Nobody died");
    await doctor.phase("voting", 95_000);
    for (const player of [mafia, doctor, villagers[1]!]) {
      await player.page.bringToFront();
      await player.page.locator(".target-list").getByRole("button", { name: mafia.name, exact: true }).click();
      await player.page.getByRole("button", { name: "Confirm ballot", exact: true }).click();
    }
    await doctor.phase("voting_result", 35_000);
    await expect(doctor.page.locator(".game-announcement")).toContainText("Mafia");
    await doctor.phase("finished", 10_000);
    expect(doctor.latest("game_state")!.winner).toBe("village");
    expect(doctor.latest("game_state")!.roles).toHaveLength(5);
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});

test("#36 Mafia parity ends the browser Game immediately after Forfeit", async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  try {
    const players = await Promise.all(contexts.map(async (context, index) => new Player(await context.newPage(), `Parity Player ${index}`)));
    const host = players[0]!;
    for (const [index, player] of players.entries()) {
      await player.enter(index === 0 ? undefined : await host.page.locator(".active-code").innerText());
      await player.page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await host.page.bringToFront();
    await host.page.getByRole("button", { name: "Start Game", exact: true }).click();
    await host.phase("day");
    const mafia = players.find(player => player.latest("game_state")!.self.role === "mafia")!;
    for (const player of players.filter(player => player !== mafia).slice(0, 2)) {
      await player.page.bringToFront();
      await player.page.getByRole("button", { name: "Leave Room", exact: true }).click();
      await expect(player.page.getByRole("button", { name: "Create Room", exact: true })).toBeVisible();
    }
    await mafia.phase("finished");
    expect(mafia.latest("game_state")!.winner).toBe("mafia");
    expect(mafia.latest("game_state")!.round).toBe(1);
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
