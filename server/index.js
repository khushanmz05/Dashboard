const http = require("node:http");

const PORT = process.env.PORT || 8080;

const services = [
  {
    name: "weather",
    widgets: [
      {
        name: "city_temperature",
        description: "Display the current temperature for a city",
        params: [{ name: "city", type: "string" }]
      },
      {
        name: "weather_condition",
        description: "Display the current weather condition for a city",
        params: [{ name: "city", type: "string" }]
      },
      {
        name: "precipitation",
        description: "Display precipitation for a city",
        params: [{ name: "city", type: "string" }]
      }
    ]
  },
  {
    name: "rss",
    widgets: [
      {
        name: "article_list",
        description: "Display the latest articles from an RSS feed",
        params: [
          { name: "link", type: "string" },
          { name: "number", type: "integer" }
        ]
      },
      {
        name: "article_count",
        description: "Display the number of articles in an RSS feed",
        params: [{ name: "link", type: "string" }]
      },
      {
        name: "latest_article",
        description: "Display the latest article from an RSS feed",
        params: [{ name: "link", type: "string" }]
      }
    ]
  },
  {
    name: "github",
    widgets: [
      {
        name: "recent_commits",
        description: "Display recent commits for a repository",
        params: [
          { name: "repository", type: "string" },
          { name: "number", type: "integer" }
        ]
      },
      {
        name: "open_issues",
        description: "Display open issue count for a repository",
        params: [{ name: "repository", type: "string" }]
      },
      {
        name: "repository_stars",
        description: "Display star count for a repository",
        params: [{ name: "repository", type: "string" }]
      }
    ]
  }
];

function getClientHost(request) {
  const forwarded = request.headers["x-forwarded-for"];

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.socket.remoteAddress?.replace(/^::ffff:/, "") || "unknown";
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });

  response.end(JSON.stringify(data));
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { status: "ok" });
  }

  if (request.method === "GET" && url.pathname === "/about.json") {
    return sendJson(response, 200, {
      client: {
        host: getClientHost(request)
      },
      server: {
        current_time: Math.floor(Date.now() / 1000),
        services
      }
    });
  }

  return sendJson(response, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Dashboard API running on http://localhost:${PORT}`);
});