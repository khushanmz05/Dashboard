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
let server, browser, database;
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
  // Test-only provider boundary: exercise real OAuth routes/cookies/storage while
  // replacing GitHub's token exchange and profile response. Never uses real keys.
  fs.writeFileSync(path.join(temporary, "provider-fixture.cjs"), `
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (String(url) === "https://github.com/login/oauth/access_token")
        return Response.json({access_token: "test-only-token"});
      if (String(url) === "https://api.github.com/user")
        return Response.json({id: 12345, login: "frontend-fixture"});
      if (!String(url).startsWith("http://127.0.0.1:"))
        throw new Error("Unexpected external request in test: " + url);
      return originalFetch(url, options);
    };
  `);
  server = spawn(process.execPath, ["--require", "./provider-fixture.cjs", "server/index.js"], {
    cwd: temporary,
    env: { ...process.env, PORT: port, GITHUB_CLIENT_ID: "fixture-client", GITHUB_CLIENT_SECRET: "fixture-secret", GITHUB_CALLBACK_URL: `${origin}/auth/github/callback` },
    stdio: "pipe",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/health`)).ok) break;
    } catch {}
    await sleep(100);
  }
  database = new (require("better-sqlite3"))(path.join(temporary, "data/dashboard.sqlite"));
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
    failWeather = false, failGithub = false, expireDataSession = false, malformedWeather = false;
  const widgetsById = new Map();
  await page.route(`${origin}/api/widgets`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const payload = await response.json();
    for (const widget of payload.widgets) widgetsById.set(widget.id, widget);
    return route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: JSON.stringify(payload),
    });
  });
  await page.route(`${origin}/api/widgets/*/data`, (route) => {
    if (expireDataSession) return route.continue();
    const widget = widgetsById.get(route.request().url().split("/").at(-2));
    if (!widget)
      return route.fulfill({
        status: 404,
        json: { error: "Widget not found" },
      });
    if (widget.service_name === "weather") {
      weatherRequests++;
      if (failWeather)
        return route.fulfill({
          status: 503,
          json: { error: "Weather unavailable" },
        });
      if (malformedWeather) return route.fulfill({ json: {data: {type: "weather", temperature: null}} });
      const city = widget.configuration.city;
      return route.fulfill({
        json: {
          data: {
            type: "weather",
            widget: widget.widget_name,
            city,
            temperature: city === "Barcelona" ? 23 : 17,
            precipitation: 0.4,
            weather_code: 2,
          },
        },
      });
    }
    if (widget.service_name === "github") {
      const connection = database.prepare("SELECT credentials_json FROM user_services WHERE service_name = 'github'").get();
      if (!connection?.credentials_json) return route.fulfill({status: 403, json: {error: "Connect GitHub before using GitHub widgets"}});
      if (failGithub) return route.fulfill({status: 401, json: {error: "GitHub connection is invalid. Reconnect GitHub."}});
      if (widget.widget_name === "recent_commits")
        return route.fulfill({
          json: {
            data: {
              type: "list",
              items: [
                {
                  title: "Improve keyboard navigation",
                  url: "https://github.com/example/project/commit/abc",
                  detail: "Alex",
                },
              ],
            },
          },
        });
      if (widget.widget_name === "open_issues")
        return route.fulfill({
          json: {
            data: {
              type: "metric",
              value: 18,
              unit: "",
              caption: "Open issues · pull requests excluded",
            },
          },
        });
      return route.fulfill({
        json: {
          data: {
            type: "metric",
            value: 4280,
            unit: "☆",
            caption: "People following this repository",
          },
        },
      });
    }
    if (widget.widget_name === "article_count")
      return route.fulfill({
        json: {
          data: {
            type: "metric",
            value: 2,
            unit: "",
            caption: "Articles currently available in this feed",
          },
        },
      });
    return route.fulfill({
      json: {
        data: {
          type: "list",
          items: [
            {
              title: "Designing a calmer workspace",
              url: "https://example.com/article",
              detail: "",
            },
            { title: "<img src=x onerror=alert(1)>", url: "javascript:alert(1)", detail: "<script>bad()</script>" },
          ],
        },
      },
    });
  });
  let oauthMode = "denied";
  await page.route("https://github.com/login/oauth/authorize?*", async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.searchParams.get("client_id"), "fixture-client");
    assert.equal(url.searchParams.get("redirect_uri"), `${origin}/auth/github/callback`);
    const callback = new URL(`${origin}/auth/github/callback`);
    callback.searchParams.set("state", url.searchParams.get("state"));
    callback.searchParams.set(oauthMode === "denied" ? "error" : "code", oauthMode === "denied" ? "access_denied" : "fixture-code");
    await route.fulfill({status: 302, headers: {location: callback.href}});
  });
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
  const confirmation = await page.locator("#verify-form input").inputValue();
  assert.ok(confirmation);
  assert.match(await page.locator("#verification-notice").innerText(), /does not send an email/);
  await page.locator("#verify-form input").fill("invalid-code");
  await page.locator("#verify-form button").click();
  await visible(page.getByText("Invalid or expired verification token", {exact: true}));
  database.prepare("UPDATE users SET verification_token_expires_at = 1 WHERE username = ?").run("frontend-test");
  await page.goto(`${origin}/?verify_token=${confirmation}`);
  await visible(page.locator("#verify-form"));
  assert.equal(new URL(page.url()).search, "");
  assert.equal(await page.locator("#verify-form input").inputValue(), confirmation);
  await page.locator("#verify-form button").click();
  await visible(page.getByText("Invalid or expired verification token", {exact: true}));
  database.prepare("UPDATE users SET verification_token_expires_at = ? WHERE username = ?").run(Math.floor(Date.now()/1000) + 3600, "frontend-test");
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
  await page.locator(".nav-item[data-view=services]").click();
  await page.locator("[data-enable=rss]").click();
  await page.waitForFunction(() => document.querySelector("[data-enable=rss]")?.textContent === "Disable service");
  await page.locator("[data-enable=rss]").click();
  await page.waitForFunction(() => document.querySelector("[data-enable=rss]")?.textContent === "Enable service");
  await page.locator("[data-enable=rss]").click();
  await page.locator("[data-enable=github]").click();
  await visible(page.locator('[data-service-card=github] [data-github-connect]'));
  assert.equal(await page.locator('[data-service-card=github] [data-add]').count(), 0);
  await page.reload();
  await page.locator(".nav-item[data-view=services]").click();
  assert.equal(await page.locator("[data-enable=rss]").innerText(), "Disable service");
  await page.route(`${origin}/auth/github/connect`, route => route.fulfill({status: 503, json: {error: "GitHub connection is not configured"}}));
  await page.locator("#github-connect").click();
  await visible(page.getByText("GitHub connection is not configured", {exact: true}));
  await page.unroute(`${origin}/auth/github/connect`);
  await page.locator("#github-connect").click();
  await visible(page.getByText("GitHub authorization was cancelled. You can try connecting again.", {exact: true}));
  assert.equal(new URL(page.url()).search, "");
  oauthMode = "connected";
  await page.locator("#github-connect").click();
  await visible(page.getByText("GitHub connected as @frontend-fixture. You can now add repository widgets.", {exact: true}));
  assert.equal(new URL(page.url()).search, "");
  assert.equal((await (await page.request.get(`${origin}/api/github`)).json()).connected, true);
  await page.locator("#github-disconnect").click();
  await page.getByRole("button", {name: "Keep connected"}).click();
  assert.equal((await (await page.request.get(`${origin}/api/github`)).json()).connected, true);
  await page.locator("[data-view=overview]").click();
  console.log("PASS server subscriptions, persistence, OAuth unavailable/denied/connected and disconnect cancellation");
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
    repository: "https://github.com/facebook/react.git",
    number: 3,
  });
  assert.equal([...widgetsById.values()].find(w => w.widget_name === "recent_commits").configuration.repository, "facebook/react");
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
  await page.locator(".nav-item[data-view=services]").click();
  await page.locator("[data-enable=rss]").click();
  await visible(page.getByText("Remove the 3 widgets using this service before disabling it", {exact: true}));
  assert.equal(await page.locator("[data-enable=rss]").innerText(), "Disable service");
  assert.equal(await page.locator("#services-message").getAttribute("data-kind"), "error");
  await page.locator("[data-view=overview]").click();
  malformedWeather = true;
  await page.locator(".widget").first().locator("[data-action=refresh]").click();
  await visible(page.locator(".widget").first().locator(".stale-note"));
  assert.match(await page.locator(".widget").first().innerText(), /23/);
  malformedWeather = false;
  await page.locator(".widget").first().locator("[data-action=refresh]").click();
  await page.locator(".stale-note").waitFor({state: "hidden"});
  console.log("PASS subscription conflict stays visible and malformed data preserves last valid value");
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
  failGithub = true;
  const githubCard = page.locator('.widget').filter({has: page.locator('.service-icon.github')}).first();
  await githubCard.locator('[data-action=refresh]').click();
  await visible(githubCard.locator('[data-github-connect]'));
  await visible(page.locator("#dashboard-view"));
  assert.match(await githubCard.innerText(), /Reconnect GitHub/);
  await page.locator(".nav-item[data-view=services]").click();
  await visible(page.getByText("Connection needs attention. Reconnect to resume updates.", {exact: true}));
  failGithub = false;
  await page.locator("#github-connect").click();
  await visible(page.getByText("GitHub connected as @frontend-fixture. You can now add repository widgets.", {exact: true}));
  await page.locator("#github-disconnect").click();
  await page.locator("#disconnect-form .danger").click();
  await visible(page.getByText("GitHub disconnected. Reconnect it to resume widget updates.", {exact: true}));
  assert.equal((await (await page.request.get(`${origin}/api/github`)).json()).connected, false);
  assert.equal((await (await page.request.get(`${origin}/api/widgets`)).json()).widgets.length, 9);
  await page.locator("[data-view=overview]").click();
  await visible(githubCard.locator('[data-github-connect]'));
  await page.locator(".nav-item[data-view=services]").click();
  await page.locator("#github-connect").click();
  await visible(page.getByText("GitHub connected as @frontend-fixture. You can now add repository widgets.", {exact: true}));
  await page.locator("[data-view=overview]").click();
  await page.waitForFunction(() => !document.querySelector('.widget-body[aria-busy=true]'));
  console.log("PASS revoked GitHub token preserves Dashboard session, reconnect and disconnect preserve widgets");
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
  await page.locator(".nav-item[data-view=services]").click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  if (screenshotDirectory) await page.screenshot({path: path.join(screenshotDirectory, "services-mobile.png"), fullPage: true});
  await page.locator("#github-disconnect").click();
  if (screenshotDirectory) await page.screenshot({path: path.join(screenshotDirectory, "disconnect-mobile.png")});
  await page.getByRole("button", {name: "Keep connected"}).click();
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
  expireDataSession = true;
  await page.locator(".widget").first().locator("[data-action=refresh]").click();
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
    if (database) database.close();
    if (server && server.exitCode === null) {
      server.kill();
      await new Promise((resolve) => server.once("exit", resolve));
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  });
