import { expect, test } from "@playwright/test";
import { Player } from "./player.js";

test("#32–35 #41 Solo Practice completes all real Task types and retains separate Fake progress", async ({ page }) => {
  test.setTimeout(1_800_000);
  const player = new Player(page, "Task Practice");
  await player.enter();
  await page.getByRole("button", { name: "Solo Practice", exact: true }).click();
  await player.phase("day");
  await expect(page.getByRole("region", { name: "Tasks", exact: true })).toBeVisible();
  await page.locator(".task-interface summary").click();
  expect(player.latest("task_state")!.tasks.map(task => task.kind)).toEqual(["repair", "sequence", "delivery"]);
  for (const kind of ["repair", "sequence", "delivery"] as const) {
    let task = player.latest("task_state")!.tasks.find(task => task.kind === kind)!;
    while (task.step < task.steps) {
      const before = task.step;
      await player.walkTo(task.x, task.y);
      const item = page.locator(".task-interface li").filter({ hasText: task.name });
      const start = kind === "repair" ? "Repair" : kind === "sequence" ? "Start sequence" : before % 2 === 0 ? "Collect" : "Deliver";
      await item.getByRole("button", { name: start, exact: true }).click();
      await expect.poll(() => player.latest("task_state")!.activeTaskId).toBe(task.taskId);
      console.log(`${kind} stage ${before + 1}: following the real 120-second interaction.`);
      const finish = kind === "repair" ? "Finish repair step" : kind === "sequence" ? String(task.sequence[before]! + 1) : before % 2 === 0 ? "Pick up item" : "Deliver item";
      await expect(item.getByRole("button", { name: finish, exact: true })).toBeEnabled({ timeout: 130_000 });
      if (kind === "sequence" && before === 0) {
        await item.getByRole("button", { name: "1", exact: true }).click();
        await expect.poll(() => player.latest("error")?.code).toBe("invalid_task");
        expect(player.latest("task_state")!.tasks.find(t => t.taskId === task.taskId)!.step).toBe(0);
      }
      await item.getByRole("button", { name: finish, exact: true }).click();
      await expect.poll(() => player.latest("task_state")!.tasks.find(t => t.taskId === task.taskId)!.step).toBe(before + 1);
      if (before === 0) {
        await page.reload();
        await player.phase("day");
        await page.locator(".task-interface summary").click();
        await expect.poll(() => player.latest("task_state")!.tasks.find(t => t.taskId === task.taskId)!.step).toBe(1);
      }
      task = player.latest("task_state")!.tasks.find(t => t.taskId === task.taskId)!;
    }
    console.log(`${kind} completed through the browser.`);
  }
  expect(player.latest("task_state")!.completed).toBe(3);
  expect(player.latest("game_state")!.winner).toBeNull();
  await expect(page.locator(".game-phase")).toContainText("Solo Practice · Day");
  await page.getByRole("combobox", { name: "Preview Role", exact: true }).selectOption("mafia");
  await expect.poll(() => player.latest("task_state")!.tasks.every(task => task.fake)).toBe(true);
  for (const kind of ["repair", "sequence", "delivery"] as const) {
    const task = player.latest("task_state")!.tasks.find(task => task.kind === kind)!;
    await player.walkTo(task.x, task.y);
    const item = page.locator(".task-interface li").filter({ hasText: task.name });
    await item.getByRole("button", { name: kind === "repair" ? "Repair" : kind === "sequence" ? "Start sequence" : "Collect", exact: true }).click();
    const finish = kind === "repair" ? "Finish repair step" : kind === "sequence" ? "3" : "Pick up item";
    await expect(item.getByRole("button", { name: finish, exact: true })).toBeEnabled({ timeout: 130_000 });
    await item.getByRole("button", { name: finish, exact: true }).click();
    await expect.poll(() => player.latest("task_state")!.tasks.find(t => t.taskId === task.taskId)!.step).toBe(1);
    expect(player.latest("task_state")!.completed).toBe(3);
  }
  await page.getByRole("combobox", { name: "Preview Role", exact: true }).selectOption("villager");
  await expect.poll(() => player.latest("task_state")!.tasks.every(task => task.step === task.steps)).toBe(true);
  for (const phase of ["night", "discussion", "voting", "voting_result", "day"]) {
    await page.getByRole("button", { name: "Next phase", exact: true }).click();
    await player.phase(phase);
  }
  await player.phase("day");
  expect(player.latest("game_state")!.winner).toBeNull();
  expect(player.latest("task_state")!.completed).toBe(3);
});
