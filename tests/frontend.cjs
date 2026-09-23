/* Run with npm run test:frontend. Uses an isolated SQLite database and mocked
 * external providers; does not alter your accounts or need internet/API keys. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-ui-"));
const port = process.env.TEST_PORT || 8187;
const origin = `http://127.0.0.1:${port}`;
const screenshotDirectory = process.env.SCREENSHOT_DIR;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server, browser;
async function visible(locator) {
  await locator.waitFor({ state: "visible" });
}
(async () => {
  fs.cpSync(path.join(root, "server"), path.join(temporary, "server"), {
    recursive: true,
  });
  fs.cpSync(path.join(root, "public"), path.join(temporary, "public"), {
    recursive: true,
  });
  fs.symlinkSync(
    path.join(root, "node_modules"),
    path.join(temporary, "node_modules"),
    "junction",
  );
  server = spawn(process.execPath, ["server/index.js"], {
    cwd: temporary,
    env: { ...process.env, PORT: port },
    stdio: "pipe",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let weatherRequests = 0,
    failWeather = false;
  await page.route("https://geocoding-api.open-meteo.com/**", (route) => {
    const city = new URL(route.request().url()).searchParams.get("name");
    return route.fulfill({
      json: {
        results: [
          {
            name: city,
            country: city === "Barcelona" ? "Spain" : "Japan",
            latitude: city === "Barcelona" ? 41 : 35,
            longitude: 2,
          },
        ],
      },
    });
  });
  await page.route("https://api.open-meteo.com/**", (route) => {
    weatherRequests++;
    if (failWeather)
      return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    return route.fulfill({
      json: {
        current: {
          temperature_2m: route.request().url().includes("latitude=41")
            ? 23
            : 17,
          precipitation: 0.4,
          weather_code: 2,
        },
      },
    });
  });
  await page.route("https://api.github.com/**", (route) => {
    const url = route.request().url();
    if (url.includes("/commits"))
      return route.fulfill({
        json: [
          {
            commit: {
              message: "Improve keyboard navigation",
              author: { name: "Alex" },
            },
            html_url: "https://github.com/example/project/commit/abc",
            sha: "abc1234",
          },
        ],
      });
    if (url.includes("/search/issues"))
      return route.fulfill({ json: { total_count: 18 } });
    return route.fulfill({ json: { stargazers_count: 4280 } });
  });
  await page.route("https://example.com/feed.xml", (route) =>
    route.fulfill({
      contentType: "application/xml",
      body: '<rss version="2.0"><channel><title>News</title><item><title>Designing a calmer workspace</title><link>https://example.com/article</link></item><item><title>&lt;img src=x onerror=alert(1)&gt;</title><link>javascript:alert(1)</link></item></channel></rss>',
    }),
  );
  await page.goto(origin);
  await visible(page.locator("#login-form"));
  if (screenshotDirectory) {
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(screenshotDirectory, "login.png"),
      fullPage: true,
    });
  }
  await page.locator("#show-register").click();
  await page.locator("#register-form [name=username]").fill("frontend-test");
  await page
    .locator("#register-form [name=email]")
    .fill("frontend@example.com");
  await page.locator("#register-form [name=password]").fill("Frontend123!");
  await page.locator("#register-form button").click();
  await visible(page.locator("#verify-form"));
  assert.ok(await page.locator("#verify-form input").inputValue());
  // Unconfirmed accounts cannot access the dashboard.
  const denied = await page.request.post(`${origin}/auth/login`, {
    data: { username: "frontend-test", password: "Frontend123!" },
  });
  assert.equal(denied.status(), 403);
  await page.locator("#verify-form button").click();
  await visible(page.locator("#login-form"));
  await page.locator("#login-form [name=username]").fill("frontend-test");
  await page.locator("#login-form [name=password]").fill("Frontend123!");
  await page.locator("#login-form button").click();
  await visible(page.locator("#dashboard-view"));
  await visible(page.getByText("Start with what matters"));
  console.log("PASS registration, confirmation, login, empty state");
  await page.locator("[data-view=services]").click();
  await page.locator("[data-enable=github]").click();
  await page.locator("[data-enable=rss]").click();
  await page.locator("[data-view=overview]").click();
  async function add(service, widget, config, refresh = "300") {
    await page.locator(".page-heading [data-add]").first().click();
    await page.locator("#service").selectOption(service);
    await page.locator("#widget").selectOption(widget);
    for (const [key, value] of Object.entries(config))
      await page.locator(`[data-param=${key}]`).fill(String(value));
    await page.locator("#refresh-rate").selectOption(refresh);
    await page.locator("#save-widget").click();
    await page.locator("#widget-dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() => !document.querySelector(".loading"));
  }
  await add("weather", "city_temperature", { city: "Barcelona" }, "10");
  await add("weather", "city_temperature", { city: "Tokyo" });
  assert.match(await page.locator(".widget-body").nth(0).innerText(), /23/);
  assert.match(await page.locator(".widget-body").nth(1).innerText(), /17/);
  await add("weather", "weather_condition", { city: "Barcelona" });
  await add("weather", "precipitation", { city: "Barcelona" });
  await add("github", "recent_commits", {
    repository: "facebook/react",
    number: 3,
  });
  await add("github", "open_issues", { repository: "facebook/react" });
  await add("github", "repository_stars", { repository: "facebook/react" });
  await add("rss", "article_list", {
    link: "https://example.com/feed.xml",
    number: 3,
  });
  await add("rss", "article_count", { link: "https://example.com/feed.xml" });
  await add("rss", "latest_article", { link: "https://example.com/feed.xml" });
  assert.equal(await page.locator(".widget").count(), 10);
  assert.equal(await page.locator(".widget-body img").count(), 0);
  assert.equal(
    await page.locator('.widget-body a[href^="javascript:"]').count(),
    0,
  );
  assert.match(await page.locator("#widget-grid").innerText(), /4,280/);
  assert.match(await page.locator("#widget-grid").innerText(), /18/);
  assert.match(await page.locator("#widget-grid").innerText(), /0.4/);
  console.log(
    "PASS all nine data renderers, independent configurations, safe RSS text and URLs",
  );
  // Use clock simulation to prove the 10-second widget refreshes independently.
  await page.clock.install();
  await page
    .locator(".widget")
    .first()
    .locator("[data-action=refresh]")
    .click();
  await page.waitForFunction(
    () => !document.querySelector(".widget-body[aria-busy=true]"),
  );
  const before = weatherRequests;
  await page.clock.fastForward(11000);
  await page.waitForFunction(
    () => !document.querySelector(".widget-body[aria-busy=true]"),
  );
  assert.equal(weatherRequests, before + 1);
  await page.clock.resume();
  failWeather = true;
  await page
    .locator(".widget")
    .first()
    .locator("[data-action=refresh]")
    .click();
  await visible(page.locator(".widget").first().locator(".stale-note"));
  assert.match(await page.locator(".widget").first().innerText(), /23/);
  failWeather = false;
  await page
    .locator(".widget")
    .first()
    .locator("[data-action=refresh]")
    .click();
  await page.locator(".stale-note").waitFor({ state: "hidden" });
  console.log(
    "PASS independent timer, failure state, retained last data and retry",
  );
  await page.locator("[data-filter=github]").click();
  assert.equal(await page.locator(".widget").count(), 3);
  await page.locator("[data-filter=all]").click();
  const firstId = await page
    .locator(".widget")
    .first()
    .getAttribute("data-widget-id");
  await page.locator(".widget").nth(1).locator("[data-action=up]").click();
  await page.waitForFunction(
    (id) => document.querySelectorAll(".widget")[1]?.dataset.widgetId === id,
    firstId,
  );
  await page.reload();
  await visible(page.locator(".widget").first());
  assert.equal(
    await page.locator(".widget").nth(1).getAttribute("data-widget-id"),
    firstId,
  );
  // Desktop drag and drop uses the same persisted ordering path.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await page
    .locator(".widget")
    .first()
    .locator("[data-drag]")
    .dispatchEvent("dragstart", { dataTransfer: transfer });
  await page
    .locator(".widget")
    .nth(1)
    .dispatchEvent("drop", { dataTransfer: transfer });
  await page.waitForFunction(
    (id) => document.querySelector(".widget")?.dataset.widgetId === id,
    firstId,
  );
  await page.locator(".widget").first().locator("[data-action=edit]").click();
  await page.locator("[data-param=city]").fill("Tokyo");
  await page.locator("#save-widget").click();
  await page.locator("#widget-dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(
    () =>
      document.querySelector(".widget .widget-context")?.textContent ===
      "Tokyo",
  );
  // Cancel edit and delete do not mutate data.
  await page.locator(".widget").first().locator("[data-action=edit]").click();
  await page.locator("[data-param=city]").fill("Cancel this");
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator(".widget-context").first().innerText(),
    "Tokyo",
  );
  await page.locator(".widget").first().locator("[data-action=delete]").click();
  await page.getByRole("button", { name: "Keep widget" }).click();
  assert.equal(await page.locator(".widget").count(), 10);
  await page.locator(".widget").nth(1).locator("[data-action=delete]").click();
  await page.locator("#delete-form .danger").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".widget").length === 9,
  );
  await page.reload();
  await visible(page.locator(".widget").first());
  assert.equal(await page.locator(".widget").count(), 9);
  console.log(
    "PASS filters, keyboard/button ordering, drag/drop, persistence, edit/cancel, delete/204",
  );
  if (screenshotDirectory)
    await page.screenshot({
      path: path.join(screenshotDirectory, "dashboard.png"),
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.locator(".page-heading [data-add]").first().click();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement.closest("dialog")?.id),
    "widget-dialog",
  );
  await page.keyboard.press("Escape");
  if (screenshotDirectory)
    await page.screenshot({
      path: path.join(screenshotDirectory, "mobile.png"),
      fullPage: true,
    });
  await page.locator("[data-view=services]").click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.locator("[data-view=account]").click();
  await visible(page.locator("#profile-email"));
  await page.locator("#logout-button").click();
  await visible(page.locator("#auth-view"));
  assert.equal(await page.locator(".widget").count(), 0);
  await page.locator("#login-form [name=username]").fill("frontend-test");
  await page.locator("#login-form [name=password]").fill("Frontend123!");
  await page.locator("#login-form button").click();
  await visible(page.locator("#dashboard-view"));
  await page.context().clearCookies();
  await page.locator(".widget").first().locator("[data-action=delete]").click();
  await page.locator("#delete-form .danger").click();
  await visible(page.locator("#auth-view"));
  assert.match(
    await page.locator("#auth-message").innerText(),
    /session has expired/,
  );
  assert.equal(await page.locator("dialog[open]").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS mobile layout, dialog keyboard access, profile, logout and session expiry",
  );
  console.log(
    "All frontend integration checks passed. External provider data was mocked.",
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  });
