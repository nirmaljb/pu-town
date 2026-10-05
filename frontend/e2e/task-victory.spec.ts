import { expect, test } from "@playwright/test";
import { Player } from "./player.js";

test("#36 #56 Three Village browser Players finish their mixed Tasks and win immediately", async ({ browser }) => {
  test.setTimeout(6_000_000);
  const startedAt = Date.now();
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
  try {
    const players = await Promise.all(contexts.map(async (context, index) => new Player(await context.newPage(), `Task Victory ${index}`)));
    const host = players[0]!;
    for (const [index, player] of players.entries()) {
      await player.enter(index === 0 ? undefined : await host.page.locator(".active-code").innerText());
      await player.page.getByRole("button", { name: "Ready", exact: true }).click();
    }
    await host.page.bringToFront();
    await host.page.getByRole("button", { name: "Start Game", exact: true }).click();
    await host.phase("day");
    const village = players.filter(player => player.latest("game_state")!.self.role !== "mafia");
    expect(village).toHaveLength(3);
    for (let cycle = 0; cycle < 16 && !host.latest("game_state")!.winner; cycle++) {
      const round = host.latest("game_state")!.round;
      const opened: { player: Player; taskId: string; step: number; label: string; readyAt: number }[] = [];
      // Navigate with real keyboard input one browser at a time; interaction timers run together.
      for (const player of village) {
        if (host.latest("game_state")!.phase !== "day") break;
        const task = player.latest("task_state")!.tasks.find(task => task.step < task.steps);
        if (!task) continue;
        await player.page.bringToFront();
        if (!await player.page.locator(".task-interface details").evaluate(details => (details as HTMLDetailsElement).open)) await player.page.locator(".task-interface summary").click();
        await player.walkTo(task.x, task.y);
        if (host.latest("game_state")!.phase !== "day") break;
        const item = player.page.locator(".task-interface li").filter({ hasText: task.name });
        const start = task.kind === "repair" ? "Repair" : task.kind === "sequence" ? "Start sequence" : task.step % 2 === 0 ? "Collect" : "Deliver";
        await item.getByRole("button", { name: start, exact: true }).click();
        await expect.poll(() => player.latest("task_state")!.activeTaskId).toBe(task.taskId);
        const label = task.kind === "repair" ? "Finish repair step" : task.kind === "sequence" ? String(task.sequence[task.step]! + 1) : task.step % 2 === 0 ? "Pick up item" : "Deliver item";
        opened.push({ player, taskId: task.taskId, step: task.step, label, readyAt: Date.now() + player.latest("task_state")!.remainingMs! });
      }
      for (const interaction of opened) {
        await expect.poll(() => Date.now() >= interaction.readyAt || host.latest("game_state")!.phase !== "day", { timeout: 130_000 }).toBe(true);
        if (host.latest("game_state")!.phase !== "day") break;
        await interaction.player.page.bringToFront();
        await interaction.player.page.getByRole("button", { name: interaction.label, exact: true }).click();
        await expect.poll(() => interaction.player.latest("task_state")!.tasks.find(task => task.taskId === interaction.taskId)!.step).toBe(interaction.step + 1);
        if (village.every(player => player.latest("task_state")!.tasks.every(task => task.step === task.steps))) {
          await host.phase("finished");
          expect(host.latest("game_state")!.winner).toBe("village");
          expect(host.latest("task_state")!.completed).toBe(host.latest("task_state")!.total);
          expect(host.latest("game_state")!.round).toBe(round);
          console.log(`Immediate Task victory in round ${round}; ${Math.round((Date.now() - startedAt) / 1000)} real seconds with four browser Players.`);
          return;
        }
      }
      console.log(`Round ${round}: ${host.latest("task_state")!.completed}/${host.latest("task_state")!.total} assignments complete.`);
      await expect.poll(() => host.latest("game_state")!.winner !== null || host.latest("game_state")!.round > round && host.latest("game_state")!.phase === "day", { timeout: 340_000 }).toBe(true);
      await host.page.bringToFront();
    }
    throw new Error("The mixed Task workload did not produce a Village victory within sixteen real rounds.");
  } finally { await Promise.allSettled(contexts.map(context => context.close())); }
});
