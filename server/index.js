const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const database = require("./database");
const {
  SESSION_DURATION,
  createUser,
  verifyUser,
  authenticate,
  getUserFromSession,
  deleteSession,
  getGithubConnection,
  getGithubCredentials,
  saveGithubCredentials,
  deleteGithubCredentials,
} = require("./auth");
const { fetchWidgetData, ProviderError } = require("./providers");

const PORT = process.env.PORT || 8080;
const publicDirectory = path.join(__dirname, "..", "public");
const services = [
  {
    name: "weather",
    widgets: [
      {
        name: "city_temperature",
        description: "Display temperature for a city",
        params: [{ name: "city", type: "string" }],
      },
      {
        name: "weather_condition",
        description: "Display weather conditions for a city",
        params: [{ name: "city", type: "string" }],
      },
      {
        name: "precipitation",
        description: "Display precipitation for a city",
        params: [{ name: "city", type: "string" }],
      },
    ],
  },
  {
    name: "rss",
    widgets: [
      {
        name: "article_list",
        description: "Display recent RSS articles",
        params: [
          { name: "link", type: "string", format: "url" },
          { name: "number", type: "integer", min: 1, max: 20 },
        ],
      },
      {
        name: "article_count",
        description: "Display RSS article count",
        params: [{ name: "link", type: "string", format: "url" }],
      },
      {
        name: "latest_article",
        description: "Display latest RSS article",
        params: [{ name: "link", type: "string", format: "url" }],
      },
    ],
  },
  {
    name: "github",
    widgets: [
      {
        name: "recent_commits",
        description: "Display recent repository commits",
        params: [
          {
            name: "repository",
            type: "string",
            pattern: /^[\w.-]+\/[\w.-]+$/,
            patternMessage: "Use owner/repository, for example facebook/react",
          },
          { name: "number", type: "integer", min: 1, max: 20 },
        ],
      },
      {
        name: "open_issues",
        description: "Display open repository issues",
        params: [
          {
            name: "repository",
            type: "string",
            pattern: /^[\w.-]+\/[\w.-]+$/,
            patternMessage: "Use owner/repository, for example facebook/react",
          },
        ],
      },
      {
        name: "repository_stars",
        description: "Display repository stars",
        params: [
          {
            name: "repository",
            type: "string",
            pattern: /^[\w.-]+\/[\w.-]+$/,
            patternMessage: "Use owner/repository, for example facebook/react",
          },
        ],
      },
    ],
  },
];
const GITHUB_STATE_DURATION = 10 * 60 * 1000;
const githubStates = new Map();
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(data));
}
function getCookies(request) {
  return Object.fromEntries(
    (request.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((part) => {
        const [name, ...value] = part.trim().split("=");
        return [name, decodeURIComponent(value.join("="))];
      }),
  );
}
async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16384)
      throw new HttpError(413, "Request body is too large");
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}
function requireUser(request) {
  const user = getUserFromSession(getCookies(request).session);
  if (!user) throw new HttpError(401, "Authentication required");
  return user;
}
function sessionCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
async function githubJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new HttpError(502, "GitHub is unavailable. Try again later.");
  }
  if (!response.ok) throw new HttpError(502, "GitHub rejected the request.");
  try {
    return await response.json();
  } catch {
    throw new HttpError(502, "GitHub returned an invalid response.");
  }
}
function githubCallbackUrl(request) {
  return (
    process.env.GITHUB_CALLBACK_URL ||
    `http://${request.headers.host}/auth/github/callback`
  );
}
function definition(serviceName, widgetName) {
  const widget = services
    .find((service) => service.name === serviceName)
    ?.widgets.find((item) => item.name === widgetName);
  if (!widget) throw new HttpError(400, "Unknown service or widget");
  return widget;
}
function findService(name) {
  const service = services.find((item) => item.name === name);
  if (!service) throw new HttpError(404, "Service not found");
  return service;
}
function listServices(userId) {
  const enabled = new Set(
    database
      .prepare("SELECT service_name FROM user_services WHERE user_id = ?")
      .all(userId)
      .map((row) => row.service_name),
  );
  return services.map((service) => ({
    name: service.name,
    enabled: service.name === "weather" || enabled.has(service.name),
    available_by_default: service.name === "weather",
  }));
}
function serviceIsEnabled(userId, name) {
  return (
    name === "weather" ||
    Boolean(
      database
        .prepare(
          "SELECT 1 FROM user_services WHERE user_id = ? AND service_name = ?",
        )
        .get(userId, name),
    )
  );
}
// Validates a configuration object against a specific widget's declared
// parameters and returns a sanitized copy containing only declared params
// (trimmed strings, range/pattern-checked values). Undeclared parameters are
// silently dropped rather than stored. This is the single source of truth
// for configuration validation: it is used identically by widget creation
// and by PATCH, so a PATCH can never store a configuration that create()
// would have rejected.
function validateConfiguration(serviceName, widgetName, configuration) {
  if (
    !configuration ||
    typeof configuration !== "object" ||
    Array.isArray(configuration)
  )
    throw new HttpError(400, "Configuration is required");
  const widget = definition(serviceName, widgetName);
  const sanitized = {};
  for (const param of widget.params) {
    const value = configuration[param.name];
    if (param.type === "string") {
      if (typeof value !== "string" || !value.trim())
        throw new HttpError(400, `Invalid ${param.name}`);
      const trimmed = value.trim();
      if (param.pattern && !param.pattern.test(trimmed))
        throw new HttpError(
          400,
          param.patternMessage || `Invalid ${param.name}`,
        );
      if (param.format === "url") {
        let parsed;
        try {
          parsed = new URL(trimmed);
        } catch {
          throw new HttpError(400, `${param.name} must be a valid URL`);
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
          throw new HttpError(400, `${param.name} must use http or https`);
      }
      sanitized[param.name] = trimmed;
    } else if (param.type === "integer") {
      if (!Number.isInteger(value))
        throw new HttpError(400, `Invalid ${param.name}`);
      if (param.min !== undefined && value < param.min)
        throw new HttpError(
          400,
          `${param.name} must be at least ${param.min}`,
        );
      if (param.max !== undefined && value > param.max)
        throw new HttpError(400, `${param.name} must be at most ${param.max}`);
      sanitized[param.name] = value;
    }
  }
  return sanitized;
}
function normalizeRefreshRate(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 10)
    throw new HttpError(400, "Refresh rate must be at least 10 seconds");
  return value;
}
function normalizePositionY(value, fallback) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0)
    throw new HttpError(400, "Invalid widget position");
  return value;
}
function serialize(row) {
  return {
    ...row,
    configuration: JSON.parse(row.configuration_json),
    configuration_json: undefined,
  };
}
function serveStatic(request, response, pathname) {
  const file = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolved = path.resolve(publicDirectory, file);
  if (
    !resolved.startsWith(`${publicDirectory}${path.sep}`) ||
    !fs.existsSync(resolved) ||
    fs.statSync(resolved).isDirectory()
  )
    return false;
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
  };
    const extension = path.extname(resolved);
    const headers = {
      "Content-Type": types[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    };
    const acceptsGzip = /\bgzip\b/.test(request.headers["accept-encoding"] || "");
    if (acceptsGzip) {
      response.writeHead(200, { ...headers, "Content-Encoding": "gzip", Vary: "Accept-Encoding" });
      fs.createReadStream(resolved).pipe(zlib.createGzip()).pipe(response);
    } else {
      response.writeHead(200, headers);
      fs.createReadStream(resolved).pipe(response);
    }
  return true;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      database.prepare("SELECT 1").get();
      return sendJson(response, 200, { status: "ok", database: "connected" });
    }
    if (request.method === "GET" && url.pathname === "/about.json")
      return sendJson(response, 200, {
        client: {
          host:
            request.socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown",
        },
        server: { current_time: Math.floor(Date.now() / 1000), services },
      });
    if (request.method === "POST" && url.pathname === "/auth/register") {
      const body = await readJson(request);
      const user = {
        username: body.username?.trim(),
        email: body.email?.trim().toLowerCase(),
        password: body.password,
      };
      if (
        typeof user.username !== "string" ||
        user.username.length < 3 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email || "") ||
        typeof user.password !== "string" ||
        user.password.length < 8
      )
        throw new HttpError(
          400,
          "Username must have 3 characters, password 8 characters, and email must be valid",
        );
      const created = createUser(user);
      return sendJson(response, 201, {
        message: "Account created. Confirm registration before signing in.",
        verification_token: created.verificationToken,
      });
    }
    if (request.method === "POST" && url.pathname === "/auth/verify") {
      const { token } = await readJson(request);
      if (typeof token !== "string" || !verifyUser(token))
        throw new HttpError(400, "Invalid or expired verification token");
      return sendJson(response, 200, {
        message: "Account confirmed. You can now sign in.",
      });
    }
    if (request.method === "POST" && url.pathname === "/auth/login") {
      const { username, password } = await readJson(request);
      const result = authenticate(username, password);
      if (result.error) throw new HttpError(result.status, result.error);
      return sendJson(
        response,
        200,
        {
          message: "Signed in",
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
          },
        },
        {
          "Set-Cookie": `session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION}`,
        },
      );
    }
    if (request.method === "POST" && url.pathname === "/auth/logout") {
      deleteSession(getCookies(request).session);
      return sendJson(
        response,
        200,
        { message: "Signed out" },
        { "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" },
      );
    }
    if (request.method === "GET" && url.pathname === "/api/me")
      return sendJson(response, 200, { user: requireUser(request) });
    if (request.method === "GET" && url.pathname === "/api/github") {
      const user = requireUser(request);
      const connection = getGithubConnection(user.id);
      return sendJson(response, 200, {
        connected: Boolean(connection),
        username: connection?.username || null,
      });
    }
    if (request.method === "GET" && url.pathname === "/auth/github/connect") {
      const user = requireUser(request);
      if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET)
        throw new HttpError(503, "GitHub connection is not configured");
      for (const [state, entry] of githubStates)
        if (entry.expiresAt <= Date.now()) githubStates.delete(state);
      const sessionToken = getCookies(request).session;
      const state = crypto.randomBytes(32).toString("hex");
      githubStates.set(state, {
        userId: user.id,
        sessionHash: crypto
          .createHash("sha256")
          .update(sessionToken)
          .digest("hex"),
        expiresAt: Date.now() + GITHUB_STATE_DURATION,
      });
      const query = new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID,
        redirect_uri: githubCallbackUrl(request),
        scope: "read:user user:email",
        state,
      });
      return sendJson(
        response,
        200,
        { url: `https://github.com/login/oauth/authorize?${query}` },
        { "Set-Cookie": sessionCookie("github_oauth_state", state, 600) },
      );
    }
    if (request.method === "GET" && url.pathname === "/auth/github/callback") {
      const cookies = getCookies(request);
      const state = url.searchParams.get("state");
      const entry = state && githubStates.get(state);
      const user = getUserFromSession(cookies.session);
      if (
        !user ||
        !state ||
        state !== cookies.github_oauth_state ||
        !entry ||
        entry.expiresAt <= Date.now() ||
        entry.userId !== user.id ||
        entry.sessionHash !==
          crypto
            .createHash("sha256")
            .update(cookies.session || "")
            .digest("hex")
      )
        throw new HttpError(400, "Invalid OAuth state");
      githubStates.delete(state);
      response.setHeader(
        "Set-Cookie",
        sessionCookie("github_oauth_state", "", 0),
      );
      if (url.searchParams.get("error") || !url.searchParams.get("code")) {
        response.writeHead(302, {
          Location: "/?github=denied",
          "Cache-Control": "no-store",
        });
        return response.end();
      }
      const tokenResponse = await githubJson(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code: url.searchParams.get("code"),
            redirect_uri: githubCallbackUrl(request),
          }),
        },
      );
      if (
        typeof tokenResponse.access_token !== "string" ||
        !tokenResponse.access_token
      )
        throw new HttpError(502, "GitHub returned an invalid access token");
      const headers = {
        Authorization: `Bearer ${tokenResponse.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "dashboard",
      };
      const profile = await githubJson("https://api.github.com/user", {
        headers,
      });
      if (
        !Number.isInteger(profile.id) ||
        typeof profile.login !== "string" ||
        !profile.login
      )
        throw new HttpError(502, "GitHub returned an invalid account");
      const existing = database
        .prepare(
          "SELECT user_id FROM user_services WHERE service_name = 'github' AND json_extract(credentials_json, '$.github_id') = ? AND user_id <> ?",
        )
        .get(String(profile.id), user.id);
      if (existing)
        throw new HttpError(409, "This GitHub account is already connected");
      saveGithubCredentials(user.id, {
        github_id: String(profile.id),
        username: profile.login,
        token: tokenResponse.access_token,
      });
      response.writeHead(302, {
        Location: "/?github=connected",
        "Cache-Control": "no-store",
      });
      return response.end();
    }
    if (request.method === "DELETE" && url.pathname === "/api/github") {
      const user = requireUser(request);
      deleteGithubCredentials(user.id);
      return sendJson(response, 200, { connected: false, username: null });
    }
    if (request.method === "GET" && url.pathname === "/api/services") {
      const user = requireUser(request);
      return sendJson(response, 200, { services: listServices(user.id) });
    }
    const enableMatch = url.pathname.match(
      /^\/api\/services\/([a-z0-9_-]+)\/enable$/,
    );
    if (enableMatch && request.method === "POST") {
      const user = requireUser(request);
      const service = findService(enableMatch[1]);
      if (service.name === "weather")
        return sendJson(response, 200, {
          service: {
            name: "weather",
            enabled: true,
            available_by_default: true,
          },
        });
      database
        .prepare(
          "INSERT OR IGNORE INTO user_services (user_id, service_name) VALUES (?, ?)",
        )
        .run(user.id, service.name);
      return sendJson(response, 201, {
        service: {
          name: service.name,
          enabled: true,
          available_by_default: false,
        },
      });
    }
    const serviceMatch = url.pathname.match(/^\/api\/services\/([a-z0-9_-]+)$/);
    if (serviceMatch && request.method === "DELETE") {
      const user = requireUser(request);
      const service = findService(serviceMatch[1]);
      if (service.name === "weather")
        throw new HttpError(
          400,
          "Weather is available by default and cannot be disabled",
        );
      const widgetCount = database
        .prepare(
          "SELECT COUNT(*) AS value FROM dashboard_widgets WHERE user_id = ? AND service_name = ?",
        )
        .get(user.id, service.name).value;
      if (widgetCount)
        throw new HttpError(
          409,
          `Remove the ${widgetCount} widget${widgetCount === 1 ? "" : "s"} using this service before disabling it`,
        );
      database
        .prepare(
          "DELETE FROM user_services WHERE user_id = ? AND service_name = ?",
        )
        .run(user.id, service.name);
      return sendJson(response, 200, { message: `${service.name} disabled` });
    }
    if (request.method === "GET" && url.pathname === "/api/widgets") {
      const user = requireUser(request);
      return sendJson(response, 200, {
        widgets: database
          .prepare(
            "SELECT * FROM dashboard_widgets WHERE user_id = ? ORDER BY position_y, created_at",
          )
          .all(user.id)
          .map(serialize),
      });
    }
    const dataMatch = url.pathname.match(/^\/api\/widgets\/([\w-]+)\/data$/);
    if (dataMatch && request.method === "GET") {
      const user = requireUser(request);
      const widget = database
        .prepare("SELECT * FROM dashboard_widgets WHERE id = ? AND user_id = ?")
        .get(dataMatch[1], user.id);
      if (!widget) throw new HttpError(404, "Widget not found");
      const credentials =
        widget.service_name === "github" ? getGithubCredentials(user.id) : null;
      const data = await fetchWidgetData(
        {
          ...widget,
          configuration: JSON.parse(widget.configuration_json),
        },
        credentials,
      );
      return sendJson(response, 200, { data });
    }
    if (request.method === "POST" && url.pathname === "/api/widgets") {
      const user = requireUser(request);
      const body = await readJson(request);
      if (
        typeof body.service_name !== "string" ||
        typeof body.widget_name !== "string"
      )
        throw new HttpError(400, "Service and widget are required");
      const configuration = validateConfiguration(
        body.service_name,
        body.widget_name,
        body.configuration,
      );
      const refreshRate = normalizeRefreshRate(body.refresh_rate, 60);
      if (!serviceIsEnabled(user.id, body.service_name))
        throw new HttpError(
          403,
          `Enable ${body.service_name} before adding its widgets`,
        );
      const id = crypto.randomUUID();
      const position = database
        .prepare(
          "SELECT COALESCE(MAX(position_y), -1) + 1 AS value FROM dashboard_widgets WHERE user_id = ?",
        )
        .get(user.id).value;
      database
        .prepare(
          "INSERT INTO dashboard_widgets (id, user_id, service_name, widget_name, configuration_json, refresh_rate, position_y) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          id,
          user.id,
          body.service_name,
          body.widget_name,
          JSON.stringify(configuration),
          refreshRate,
          position,
        );
      return sendJson(response, 201, {
        widget: serialize(
          database
            .prepare("SELECT * FROM dashboard_widgets WHERE id = ?")
            .get(id),
        ),
      });
    }
    const match = url.pathname.match(/^\/api\/widgets\/([\w-]+)$/);
    if (match && request.method === "PATCH") {
      const user = requireUser(request);
      const body = await readJson(request);
      const existing = database
        .prepare("SELECT * FROM dashboard_widgets WHERE id = ? AND user_id = ?")
        .get(match[1], user.id);
      if (!existing) throw new HttpError(404, "Widget not found");
      const changingIdentity =
        body.service_name !== undefined || body.widget_name !== undefined;
      if (
        changingIdentity &&
        (typeof body.service_name !== "string" ||
          typeof body.widget_name !== "string")
      )
        throw new HttpError(
          400,
          "Both service and widget are required to change widget type",
        );
      const serviceName = body.service_name ?? existing.service_name;
      const widgetName = body.widget_name ?? existing.widget_name;
      // Whenever a configuration is supplied it is always validated against
      // the *resolved* (possibly just-changed) widget definition, so a PATCH
      // can never persist a configuration that skips type/pattern/range
      // checks. If the widget's identity changes, a matching configuration
      // must be supplied too -- the old configuration is not assumed to
      // still be valid for a different widget type.
      let configurationJson = existing.configuration_json;
      if (body.configuration !== undefined) {
        configurationJson = JSON.stringify(
          validateConfiguration(serviceName, widgetName, body.configuration),
        );
      } else if (changingIdentity) {
        throw new HttpError(
          400,
          "Configuration is required when changing widget type",
        );
      } else {
        // identity unchanged, configuration not being touched: still confirm
        // the combination is a real service/widget (guards against stale rows).
        definition(serviceName, widgetName);
      }
      if (!serviceIsEnabled(user.id, serviceName))
        throw new HttpError(
          403,
          `Enable ${serviceName} before using its widgets`,
        );
      const refreshRate = normalizeRefreshRate(
        body.refresh_rate,
        existing.refresh_rate,
      );
      const positionY = normalizePositionY(
        body.position_y,
        existing.position_y,
      );
      database
        .prepare(
          "UPDATE dashboard_widgets SET service_name = ?, widget_name = ?, configuration_json = ?, refresh_rate = ?, position_y = ?, updated_at = unixepoch() WHERE id = ?",
        )
        .run(
          serviceName,
          widgetName,
          configurationJson,
          refreshRate,
          positionY,
          existing.id,
        );
      return sendJson(response, 200, {
        widget: serialize(
          database
            .prepare("SELECT * FROM dashboard_widgets WHERE id = ?")
            .get(existing.id),
        ),
      });
    }
    if (match && request.method === "DELETE") {
      const user = requireUser(request);
      const result = database
        .prepare("DELETE FROM dashboard_widgets WHERE id = ? AND user_id = ?")
        .run(match[1], user.id);
      if (!result.changes) throw new HttpError(404, "Widget not found");
      response.writeHead(204);
      return response.end();
    }
    if (request.method === "GET" && serveStatic(request, response, url.pathname)) return;
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error instanceof ProviderError)
      return sendJson(response, error.status, { error: error.message });
    if (error.code?.startsWith("SQLITE_CONSTRAINT"))
      return sendJson(response, 409, {
        error: "Username or email already exists",
      });
    return sendJson(response, error.status || 500, {
      error: error.message || "Request failed",
    });
  }
});
server.listen(PORT, () =>
  console.log(`Dashboard API running on http://localhost:${PORT}`),
);