// Render server-owned widget data. External requests and tokens stay on the backend.
import { requestJSON, ApiError } from "./api.js";
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
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
const number = (value) => new Intl.NumberFormat("en").format(value);
const caption = (text) => `<p class="metric-caption">${escapeHTML(text)}</p>`;
const metric = (value, unit, text) =>
  `<div class="metric">${escapeHTML(value)}<small>${escapeHTML(unit)}</small></div>${caption(text)}`;
function list(items) {
  if (!Array.isArray(items) || items.some((item) => !item || typeof item.title !== "string"))
    throw new Error("The server returned an invalid list response.");
  if (!items.length) return caption("Nothing to show yet. Check back later.");
  return `<ul class="widget-links">${items
    .map((item) => {
      const url = safeUrl(item.url);
      return `<li>${url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.title)} ↗</a>` : escapeHTML(item.title)}${item.detail ? `<small>${escapeHTML(item.detail)}</small>` : ""}</li>`;
    })
    .join("")}</ul>`;
}
function weatherLabel(code) {
  if (!Number.isInteger(code) || code < 0) return "Weather unavailable";
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
  if (!data || typeof data !== "object") throw new Error("The server returned no widget data.");
  if (data.type === "metric" && !Number.isFinite(data.value)) throw new Error("The metric is currently unavailable.");
  if (data.type === "weather" && ((item.widget_name === "city_temperature" && !Number.isFinite(data.temperature)) || (item.widget_name === "precipitation" && !Number.isFinite(data.precipitation)))) throw new Error("Current weather data is unavailable.");
  if (data.type === "metric")
    return metric(number(data.value), data.unit, data.caption);
  if (data.type === "list") return list(data.items);
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
  const result = await requestJSON(`/api/widgets/${encodeURIComponent(item.id)}/data`, { signal });
  if (!result?.data) throw new ApiError("The server returned no widget data.");
  return renderWidgetData(item, result.data);
}
