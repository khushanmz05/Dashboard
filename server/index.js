const http = require("node:http");
const database = require("./database");
const {
  SESSION_DURATION,
  createUser,
  verifyUser,
  authenticate,
  getUserFromSession,
  deleteSession
} = require("./auth");

const PORT = process.env.PORT || 8080;

const services = [
  {
    name: "weather",
    widgets: [
      { name: "city_temperature", description: "Display temperature for a city", params: [{ name: "city", type: "string" }] },
      { name: "weather_condition", description: "Display weather conditions for a city", params: [{ name: "city", type: "string" }] },
      { name: "precipitation", description: "Display precipitation for a city", params: [{ name: "city", type: "string" }] }
    ]
  },
  {
    name: "rss",
    widgets: [
      { name: "article_list", description: "Display recent RSS articles", params: [{ name: "link", type: "string" }, { name: "number", type: "integer" }] },
      { name: "article_count", description: "Display RSS article count", params: [{ name: "link", type: "string" }] },
      { name: "latest_article", description: "Display latest RSS article", params: [{ name: "link", type: "string" }] }
    ]
  },
  {
    name: "github",
    widgets: [
      { name: "recent_commits", description: "Display recent repository commits", params: [{ name: "repository", type: "string" }, { name: "number", type: "integer" }] },
      { name: "open_issues", description: "Display open repository issues", params: [{ name: "repository", type: "string" }] },
      { name: "repository_stars", description: "Display repository stars", params: [{ name: "repository", type: "string" }] }
    ]
  }
];

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
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
      })
  );
}

async function readJson(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;

    if (body.length > 16_384) {
      throw new Error("Request body is too large");
    }
  }

  return JSON.parse(body || "{}");
}

function validRegistration({ username, email, password }) {
  return typeof username === "string" &&
    username.trim().length >= 3 &&
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    typeof password === "string" &&
    password.length >= 8;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const cookies = getCookies(request);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      database.prepare("SELECT 1").get();
      return sendJson(response, 200, { status: "ok", database: "connected" });
    }

    if (request.method === "GET" && url.pathname === "/about.json") {
      return sendJson(response, 200, {
        client: { host: request.socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown" },
        server: { current_time: Math.floor(Date.now() / 1000), services }
      });
    }

    if (request.method === "POST" && url.pathname === "/auth/register") {
      const body = await readJson(request);
      const user = {
        username: body.username?.trim(),
        email: body.email?.trim().toLowerCase(),
        password: body.password
      };

      if (!validRegistration(user)) {
        return sendJson(response, 400, {
          error: "Username must have 3 characters, password 8 characters, and email must be valid"
        });
      }

      const created = createUser(user);

      return sendJson(response, 201, {
        message: "Account created. Confirm registration before signing in.",
        verification_token: created.verificationToken
      });
    }

    if (request.method === "POST" && url.pathname === "/auth/verify") {
      const { token } = await readJson(request);

      if (typeof token !== "string" || !verifyUser(token)) {
        return sendJson(response, 400, { error: "Invalid or expired verification token" });
      }

      return sendJson(response, 200, { message: "Account confirmed. You can now sign in." });
    }

    if (request.method === "POST" && url.pathname === "/auth/login") {
      const { username, password } = await readJson(request);
      const result = authenticate(username, password);

      if (result.error) {
        return sendJson(response, result.status, { error: result.error });
      }

      return sendJson(response, 200, {
        message: "Signed in",
        user: { id: result.user.id, username: result.user.username, email: result.user.email }
      }, {
        "Set-Cookie": `session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DURATION}`
      });
    }

    if (request.method === "POST" && url.pathname === "/auth/logout") {
      deleteSession(cookies.session);

      return sendJson(response, 200, { message: "Signed out" }, {
        "Set-Cookie": "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
      });
    }

    if (request.method === "GET" && url.pathname === "/api/me") {
      const user = getUserFromSession(cookies.session);

      if (!user) {
        return sendJson(response, 401, { error: "Authentication required" });
      }

      return sendJson(response, 200, { user });
    }

    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error.code?.startsWith("SQLITE_CONSTRAINT")) {
      return sendJson(response, 409, { error: "Username or email already exists" });
    }

    if (error instanceof SyntaxError) {
      return sendJson(response, 400, { error: "Invalid JSON" });
    }

    return sendJson(response, 500, { error: "Request failed" });
  }
});

server.listen(PORT, () => {
  console.log(`Dashboard API running on http://localhost:${PORT}`);
});