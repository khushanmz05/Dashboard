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
export function renderWidgetData(item, data) {
  if (data.type === "metric")
    return metric(number(data.value), data.unit, data.caption);
  if (data.type === "list") return list(data.items || []);
  if (data.type === "weather") {
    const symbol = `<span class="weather-symbol" aria-hidden="true">${data.weather_code <= 2 ? "☀" : "☁"}</span>`;
    const place = `${weatherLabel(data.weather_code)} · ${data.city}`;
    if (item.widget_name === "city_temperature")
      return symbol + metric(Math.round(data.temperature), "°C", place);
    if (item.widget_name === "precipitation")
      return (
        symbol +
        metric(data.precipitation, "mm", `Current precipitation · ${data.city}`)
      );
    return (
      symbol +
      `<div class="metric condition">${escapeHTML(weatherLabel(data.weather_code))}</div>` +
      caption(data.city)
    );
  }
  throw new Error("The server returned an unsupported widget response.");
}
export async function loadWidgetData(item, signal) {
  const response = await fetch(
    `/api/widgets/${encodeURIComponent(item.id)}/data`,
    {
      signal,
      credentials: "same-origin",
    },
  );
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The server returned an invalid widget response.");
  }
  if (!response.ok)
    throw new Error(result.error || "Could not load widget data.");
  return renderWidgetData(item, result.data);
}
