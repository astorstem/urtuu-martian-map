import { test, expect } from "@playwright/test";
test("plans and exports a deterministic Gobi laboratory mission", async ({
  page,
}) => {
  await page.route(/^https:\/\/(trek\.nasa\.gov|tiles\.maps\.eox\.at)/, (r) =>
    r.abort(),
  );
  await page.goto("/");
  await expect(page.locator(".ol-viewport")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Arsia Mons / MARS" }),
  ).toBeVisible();
  await page.getByLabel("Environment", { exact: true }).selectOption("khermen");
  await page.getByLabel("Synthetic laboratory", { exact: true }).check();
  await page.getByLabel("Slope analysis", { exact: true }).check();
  await page
    .getByRole("button", { name: "Demo waypoints", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate terrain route" }).click();
  await expect(page.getByRole("status")).toContainText("A* proposed");
  await page.getByRole("button", { name: "Network", exact: true }).click();
  await page.getByRole("button", { name: "Auto Deploy Өртөө" }).click();
  await expect(page.getByRole("button", { name: /URT-H 01/ })).toBeVisible();
  await page.getByLabel("Nominal radio range").check();
  await page.getByLabel("Play mission", { exact: true }).click();
  await expect(page.getByLabel("Pause mission", { exact: true })).toBeVisible();
  await page.getByLabel("Pause mission", { exact: true }).click();
  await page.getByRole("button", { name: "Safety", exact: true }).click();
  await page.getByRole("button", { name: "Trigger simulated dust" }).click();
  await expect(page.getByLabel("Dust scenario")).toHaveValue("local");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("restored");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("urtuu-khermen.json");
  await page.screenshot({
    path: "test-results/mission-control.png",
    fullPage: true,
  });
});
test("missing DEM is explicit and cannot generate a terrain route", async ({
  page,
}) => {
  await page.route("**/geodata/*.json", (r) =>
    r.fulfill({ status: 404, body: "Unavailable" }),
  );
  await page.route(/^https:\/\/trek\.nasa\.gov/, (r) => r.abort());
  await page.goto("/");
  await expect(page.locator(".ol-viewport")).toBeVisible();
  await page.getByRole("button", { name: "Generate terrain route" }).click();
  await expect(page.getByRole("status")).toContainText("Load a numerical DEM");
  await page.getByRole("button", { name: "3D Terrain", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No numerical DEM for Arsia Mons" }),
  ).toBeVisible();
});
test("renders synthetic 3D terrain and supports keyboard dialog exit", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https:\/\/trek\.nasa\.gov/, (r) => r.abort());
  await page.goto("/");
  await expect(page.locator(".ol-viewport")).toBeVisible();
  await page.getByLabel("Synthetic laboratory", { exact: true }).check();
  await page
    .getByRole("button", { name: "Demo waypoints", exact: true })
    .click();
  await page.getByRole("button", { name: "Generate terrain route" }).click();
  await page.getByRole("button", { name: "3D Terrain", exact: true }).click();
  await expect(page.locator(".terrain-canvas canvas")).toBeVisible();
  await page.getByLabel("Vertical exaggeration").fill("3");
  await page
    .getByRole("button", { name: "Route flyover", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Stop flyover" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Data & provenance" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(errors).toEqual([]);
});
