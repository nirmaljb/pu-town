import { expect, test } from "@playwright/test";
import { Player } from "./player.js";

test("#30 Keyboard walking reaches Task sites, the delivery return and every interior", async ({ page }) => {
  test.setTimeout(300_000);
  const player = new Player(page, "Town explorer");
  await player.enter();
  await page.getByRole("button", { name: "Solo Practice", exact: true }).click();
  await player.phase("day");
  for (const task of player.latest("task_state")!.tasks) await player.walkTo(task.x, task.y);
  for (const [x, y, area] of [[1280, 544, "Outdoors"], [576, 1056, "General Store"], [896, 1056, "Smithy"], [2240, 1056, "Inn"], [2016, 320, "Chapel"]] as const) {
    await player.walkTo(x, y);
    await expect(page.locator(".game-announcement")).toContainText(area);
  }
});
