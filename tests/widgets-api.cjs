/* Run with: node tests/widgets-api.cjs
 * Standalone Node HTTP API regression test for widget creation/update.
 * Uses an isolated copy of the server and a temporary SQLite database;
 * does not touch your real accounts or data. No browser/Playwright needed. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-api-"));
const port = process.env.TEST_PORT || 8188;
const origin = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let server;
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL - ${name}`);
    console.log(`  ${error.message}`);
  }
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function storeCookies(jar, response) {
  const raw = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : response.headers.get("set-cookie")
      ? [response.headers.get("set-cookie")]
      : [];
  for (const entry of raw) {
    const [pair] = entry.split(";");
    const [name, value] = pair.split("=");
    jar[name] = value;
  }
}

async function request(jar, method, pathname, body) {
  const response = await fetch(`${origin}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  storeCookies(jar, response);
  const status = response.status;
  let json = null;
  if (status !== 204) {
    try {
      json = await response.json();
    } catch {
      json = null;
    }
  }
  return { status, json };
}

let userCounter = 0;
async function createUser() {
  userCounter++;
  const jar = {};
  const username = `user${userCounter}_${Date.now()}`;
  const email = `${username}@example.com`;
  const password = "password123";
  const register = await request(jar, "POST", "/auth/register", {
    username,
    email,
    password,
  });
  assert.equal(register.status, 201);
  const verify = await request(jar, "POST", "/auth/verify", {
    token: register.json.verification_token,
  });
  assert.equal(verify.status, 200);
  const login = await request(jar, "POST", "/auth/login", {
    username,
    password,
  });
  assert.equal(login.status, 200);
  return jar;
}

async function enableService(jar, name) {
  const result = await request(jar, "POST", `/api/services/${name}/enable`);
  assert.ok([200, 201].includes(result.status), `enable ${name} failed`);
}

async function createWidget(jar, payload) {
  return request(jar, "POST", "/api/widgets", payload);
}

(async () => {
  fs.cpSync(path.join(root, "server"), path.join(temporary, "server"), {
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
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(100);
  }
  if (!ready) throw new Error("Server did not become ready");

  // --- Creation: required params, types, refresh rate -----------------
  await test("create requires service_name and widget_name", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      configuration: { city: "Paris" },
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects unknown service/widget combination", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "not_a_real_widget",
      configuration: { city: "Paris" },
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects missing required string parameter", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: {},
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects wrong parameter type", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: 12345 },
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects blank/whitespace-only string parameter", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "   " },
    });
    assert.equal(result.status, 400);
  });

  await test("create trims string parameters and discards undeclared ones", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "  Paris  ", nonsense_field: "should not persist" },
    });
    assert.equal(result.status, 201);
    assert.equal(result.json.widget.configuration.city, "Paris");
    assert.equal(result.json.widget.configuration.nonsense_field, undefined);
  });

  await test("create rejects out-of-range integer parameter (article count > 20)", async () => {
    const jar = await createUser();
    await enableService(jar, "rss");
    const result = await createWidget(jar, {
      service_name: "rss",
      widget_name: "article_list",
      configuration: { link: "https://example.com/feed.xml", number: 500 },
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects integer parameter below minimum (0)", async () => {
    const jar = await createUser();
    await enableService(jar, "rss");
    const result = await createWidget(jar, {
      service_name: "rss",
      widget_name: "article_list",
      configuration: { link: "https://example.com/feed.xml", number: 0 },
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects malformed GitHub repository (not owner/name)", async () => {
    const jar = await createUser();
    await enableService(jar, "github");
    const result = await createWidget(jar, {
      service_name: "github",
      widget_name: "open_issues",
      configuration: { repository: "not-a-valid-format!!" },
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects non-http(s) RSS link scheme", async () => {
    const jar = await createUser();
    await enableService(jar, "rss");
    const result = await createWidget(jar, {
      service_name: "rss",
      widget_name: "article_count",
      configuration: { link: "ftp://example.com/feed.xml" },
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects malformed RSS link (not a URL at all)", async () => {
    const jar = await createUser();
    await enableService(jar, "rss");
    const result = await createWidget(jar, {
      service_name: "rss",
      widget_name: "article_count",
      configuration: { link: "not a url" },
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects refresh_rate below 10 seconds", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
      refresh_rate: 5,
    });
    assert.equal(result.status, 400);
  });

  await test("create rejects fractional refresh_rate", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
      refresh_rate: 10.5,
    });
    assert.equal(result.status, 400);
  });

  await test("create accepts a valid widget and defaults refresh_rate to 60", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    assert.equal(result.status, 201);
    assert.equal(result.json.widget.refresh_rate, 60);
  });

  await test("create rejects widgets for a disabled service", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "github",
      widget_name: "open_issues",
      configuration: { repository: "facebook/react" },
    });
    assert.equal(result.status, 403);
  });

  // --- PATCH: cannot bypass configuration validation -------------------
  await test("PATCH with only configuration still validates required/typed params", async () => {
    const jar = await createUser();
    const created = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const result = await request(jar, "PATCH", `/api/widgets/${id}`, {
      configuration: { city: 12345 },
    });
    assert.equal(
      result.status,
      400,
      "PATCH accepted a wrong-typed configuration value without service_name/widget_name in the body",
    );
  });

  await test("PATCH with only configuration discards undeclared fields", async () => {
    const jar = await createUser();
    const created = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const result = await request(jar, "PATCH", `/api/widgets/${id}`, {
      configuration: { city: "Lyon", totally_unrelated_field: "whatever" },
    });
    assert.equal(result.status, 200);
    assert.equal(result.json.widget.configuration.city, "Lyon");
    assert.equal(
      result.json.widget.configuration.totally_unrelated_field,
      undefined,
    );
  });

  await test("PATCH with only configuration enforces numeric bounds", async () => {
    const jar = await createUser();
    await enableService(jar, "rss");
    const created = await createWidget(jar, {
      service_name: "rss",
      widget_name: "article_list",
      configuration: { link: "https://example.com/feed.xml", number: 5 },
    });
    const id = created.json.widget.id;
    const result = await request(jar, "PATCH", `/api/widgets/${id}`, {
      configuration: { link: "https://example.com/feed.xml", number: 500 },
    });
    assert.equal(result.status, 400);
  });

  await test("PATCH with only configuration enforces repository pattern", async () => {
    const jar = await createUser();
    await enableService(jar, "github");
    const created = await createWidget(jar, {
      service_name: "github",
      widget_name: "open_issues",
      configuration: { repository: "facebook/react" },
    });
    const id = created.json.widget.id;
    const result = await request(jar, "PATCH", `/api/widgets/${id}`, {
      configuration: { repository: "not-valid!!" },
    });
    assert.equal(result.status, 400);
  });

  await test("PATCH changing widget type without new configuration is rejected", async () => {
    const jar = await createUser();
    await enableService(jar, "github");
    const created = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const result = await request(jar, "PATCH", `/api/widgets/${id}`, {
      service_name: "github",
      widget_name: "open_issues",
    });
    assert.equal(
      result.status,
      400,
      "changing widget type kept the old (incompatible) configuration",
    );
  });

  await test("PATCH changing widget type with matching configuration succeeds", async () => {
    const jar = await createUser();
    await enableService(jar, "github");
    const created = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const result = await request(jar, "PATCH", `/api/widgets/${id}`, {
      service_name: "github",
      widget_name: "open_issues",
      configuration: { repository: "facebook/react" },
    });
    assert.equal(result.status, 200);
    assert.equal(result.json.widget.widget_name, "open_issues");
    assert.equal(result.json.widget.configuration.repository, "facebook/react");
  });

  await test("PATCH rejects refresh_rate below minimum", async () => {
    const jar = await createUser();
    const created = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const result = await request(jar, "PATCH", `/api/widgets/${id}`, {
      refresh_rate: 1,
    });
    assert.equal(result.status, 400);
  });

  await test("PATCH rejects negative position_y", async () => {
    const jar = await createUser();
    const created = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const result = await request(jar, "PATCH", `/api/widgets/${id}`, {
      position_y: -1,
    });
    assert.equal(result.status, 400);
  });

  await test("PATCH with an invalid field leaves the stored widget unchanged", async () => {
    const jar = await createUser();
    const created = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const rejected = await request(jar, "PATCH", `/api/widgets/${id}`, {
      configuration: { city: 999 },
    });
    assert.equal(rejected.status, 400);
    const list = await request(jar, "GET", "/api/widgets");
    const widget = list.json.widgets.find((item) => item.id === id);
    assert.equal(widget.configuration.city, "Paris");
  });

  // --- Ownership isolation --------------------------------------------
  await test("a user cannot list another user's widgets", async () => {
    const owner = await createUser();
    await createWidget(owner, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const stranger = await createUser();
    const list = await request(stranger, "GET", "/api/widgets");
    assert.equal(list.status, 200);
    assert.equal(list.json.widgets.length, 0);
  });

  await test("a user cannot PATCH another user's widget (404, not 200/403)", async () => {
    const owner = await createUser();
    const created = await createWidget(owner, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const stranger = await createUser();
    const result = await request(stranger, "PATCH", `/api/widgets/${id}`, {
      refresh_rate: 30,
    });
    assert.equal(result.status, 404);
  });

  await test("a user cannot DELETE another user's widget", async () => {
    const owner = await createUser();
    const created = await createWidget(owner, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const stranger = await createUser();
    const result = await request(stranger, "DELETE", `/api/widgets/${id}`);
    assert.equal(result.status, 404);
    const list = await request(owner, "GET", "/api/widgets");
    assert.equal(list.json.widgets.length, 1, "widget was deleted by a non-owner");
  });

  await test("a user cannot read another user's widget data", async () => {
    const owner = await createUser();
    const created = await createWidget(owner, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "Paris" },
    });
    const id = created.json.widget.id;
    const stranger = await createUser();
    const result = await request(stranger, "GET", `/api/widgets/${id}/data`);
    assert.equal(result.status, 404);
  });

  await test("unauthenticated requests are rejected", async () => {
    const result = await request({}, "GET", "/api/widgets");
    assert.equal(result.status, 401);
  });

  // --- Error shape ------------------------------------------------------
  await test("validation errors return a JSON body with an error message", async () => {
    const jar = await createUser();
    const result = await createWidget(jar, {
      service_name: "weather",
      widget_name: "city_temperature",
      configuration: { city: "" },
    });
    assert.equal(result.status, 400);
    assert.equal(typeof result.json.error, "string");
    assert.ok(result.json.error.length > 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  server.kill();
  fs.rmSync(temporary, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  if (server) server.kill();
  fs.rmSync(temporary, { recursive: true, force: true });
  process.exit(1);
});
