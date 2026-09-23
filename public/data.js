// Public, credential-free integrations. Private providers belong on the backend.
export const serviceInfo = {
  weather: {
    title: "Weather",
    icon: "☀",
    description: "A window into the weather, wherever your day takes you.",
  },
  github: {
    title: "GitHub",
    icon: "⌘",
    description:
      "Follow the code, conversations and milestones of public repositories.",
  },
  rss: {
    title: "RSS",
    icon: "◔",
    description:
      "Your favourite publications and their latest stories, together.",
  },
};
export const titles = {
  city_temperature: "City temperature",
  weather_condition: "Weather conditions",
  precipitation: "Precipitation",
  recent_commits: "Recent commits",
  open_issues: "Open issues",
  repository_stars: "Repository stars",
  article_list: "Latest stories",
  article_count: "Feed article count",
  latest_article: "Latest article",
};
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
const count = (value) => Math.min(20, Math.max(1, Number(value) || 5));
const number = (value) => new Intl.NumberFormat("en").format(value);
const caption = (text) => `<p class="metric-caption">${escapeHTML(text)}</p>`;
const metric = (value, unit, text) =>
  `<div class="metric">${escapeHTML(value)}<small>${escapeHTML(unit)}</small></div>${caption(text)}`;
function list(items) {
  if (!items.length) return caption("Nothing to show yet. Check back later.");
  return `<ul class="widget-links">${items
    .map((item) => {
      const url = safeUrl(item.url);
      return `<li>${url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.title)} ↗</a>` : escapeHTML(item.title)}${item.detail ? `<small>${escapeHTML(item.detail)}</small>` : ""}</li>`;
    })
    .join("")}</ul>`;
}
async function request(url, signal, asText = false) {
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429)
      throw new Error(
        "Service rate limit reached. Try a longer refresh interval.",
      );
    if (response.status === 404)
      throw new Error("Source not found. Check the widget configuration.");
    throw new Error(
      `Source returned an error (${response.status}). Try again later.`,
    );
  }
  return asText ? response.text() : response.json();
}
function weatherLabel(code) {
  if (code === 0) return "Clear sky";
  if (code <= 3)
    return ["Clear sky", "Mainly clear", "Partly cloudy", "Overcast"][code];
  if ([45, 48].includes(code)) return "Foggy";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Weather unavailable";
}
async function weather(item, signal) {
  const geo = await request(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(item.configuration.city)}&count=1&language=en&format=json`,
    signal,
  );
  const city = geo.results?.[0];
  if (!city)
    throw new Error("City not found. Try a nearby city or another spelling.");
  const result = await request(
    `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,precipitation,weather_code&timezone=auto`,
    signal,
  );
  const current = result.current;
  if (!current)
    throw new Error("The weather service returned no current data.");
  const place = [city.name, city.country].filter(Boolean).join(", ");
  const symbol = `<span class="weather-symbol" aria-hidden="true">${current.weather_code <= 2 ? "☀" : "☁"}</span>`;
  if (item.widget_name === "city_temperature") {
    if (!Number.isFinite(current.temperature_2m))
      throw new Error("Temperature is unavailable.");
    return (
      symbol +
      metric(
        Math.round(current.temperature_2m),
        "°C",
        `${weatherLabel(current.weather_code)} · ${place}`,
      )
    );
  }
  if (item.widget_name === "precipitation") {
    if (!Number.isFinite(current.precipitation))
      throw new Error("Precipitation is unavailable.");
    return metric(
      current.precipitation,
      "mm",
      `Current precipitation · ${place}`,
    );
  }
  return (
    symbol +
    `<div class="metric condition">${escapeHTML(weatherLabel(current.weather_code))}</div>` +
    caption(place)
  );
}
async function github(item, signal) {
  const repository = item.configuration.repository.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new Error("Use owner/repository, for example facebook/react.");
  const base = `https://api.github.com/repos/${repository}`;
  if (item.widget_name === "recent_commits") {
    const commits = await request(
      `${base}/commits?per_page=${count(item.configuration.number)}`,
      signal,
    );
    return list(
      commits.map((entry) => ({
        title: entry.commit.message.split("\n")[0],
        url: entry.html_url,
        detail: entry.commit.author?.name || entry.sha.slice(0, 7),
      })),
    );
  }
  if (item.widget_name === "open_issues") {
    // Repository open_issues_count includes pull requests; search explicitly for issues.
    const result = await request(
      `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repository} is:issue is:open`)}&per_page=1`,
      signal,
    );
    return metric(
      number(result.total_count),
      "",
      "Open issues · pull requests excluded",
    );
  }
  const result = await request(base, signal);
  return metric(
    number(result.stargazers_count),
    "☆",
    "People following this repository",
  );
}
async function rss(item, signal) {
  const url = safeUrl(item.configuration.link);
  if (!url)
    throw new Error("Enter a complete http:// or https:// feed address.");
  let xml;
  try {
    xml = await request(url, signal, true);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Could not load this feed. It must allow browser access (CORS); other feeds need a backend RSS proxy.",
    );
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (
    document.querySelector("parsererror") ||
    !["rss", "feed", "RDF"].includes(document.documentElement.localName)
  )
    throw new Error("This address did not return a valid RSS or Atom feed.");
  const entries = [...document.querySelectorAll("item, entry")];
  if (item.widget_name === "article_count")
    return metric(
      entries.length,
      "",
      "Articles currently available in this feed",
    );
  const limit =
    item.widget_name === "latest_article"
      ? 1
      : count(item.configuration.number);
  return list(
    entries.slice(0, limit).map((entry) => {
      const link =
        entry.querySelector('link[rel="alternate"]') ||
        entry.querySelector("link:not([rel])") ||
        entry.querySelector("link");
      let href = link?.getAttribute("href") || link?.textContent;
      try {
        href = new URL(href, url).href;
      } catch {
        href = "";
      }
      return {
        title: entry.querySelector("title")?.textContent || "Untitled article",
        url: href,
        detail:
          entry.querySelector("creator, author name, author")?.textContent ||
          "",
      };
    }),
  );
}
export async function loadWidgetData(item, signal) {
  const loader = { weather, github, rss }[item.service_name];
  if (!loader) throw new Error("This service needs a frontend data adapter.");
  return loader(item, signal);
}
