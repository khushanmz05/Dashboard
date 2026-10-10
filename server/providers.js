const dns = require("node:dns").promises;
const net = require("node:net");

const REQUEST_TIMEOUT = 8000;
const MAX_RESPONSE_SIZE = 1024 * 1024;
const MAX_REDIRECTS = 3;

class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function withTimeout(promise, duration, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new ProviderError(504, message)),
        duration,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function ipv4IsPrivate(address) {
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 0) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) ||
    parts[0] >= 224
  );
}

function ipv6IsPrivate(address) {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:"))
    return ipv4IsPrivate(normalized.slice("::ffff:".length));
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

function isPrivateAddress(address) {
  return net.isIP(address) === 4
    ? ipv4IsPrivate(address)
    : ipv6IsPrivate(address);
}

async function assertPublicUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new ProviderError(400, "RSS URL is invalid");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw new ProviderError(400, "RSS URL must use HTTP or HTTPS");
  if (url.username || url.password)
    throw new ProviderError(400, "RSS URL credentials are not allowed");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost"))
    throw new ProviderError(400, "RSS URL points to a private address");
  let addresses;
  try {
    addresses = net.isIP(url.hostname)
      ? [{ address: url.hostname }]
      : await withTimeout(
          dns.lookup(url.hostname, { all: true, verbatim: true }),
          REQUEST_TIMEOUT,
          "RSS DNS lookup timed out",
        );
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError(502, "RSS host could not be resolved");
  }
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  )
    throw new ProviderError(400, "RSS URL points to a private address");
  return url;
}

async function fetchRss(
  input,
  redirects = 0,
  deadline = Date.now() + REQUEST_TIMEOUT,
) {
  if (Date.now() >= deadline)
    throw new ProviderError(504, "RSS request timed out");
  const url = await assertPublicUrl(input);
  let response;
  try {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml",
      },
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError")
      throw new ProviderError(504, "RSS request timed out");
    throw new ProviderError(502, "RSS feed could not be reached");
  }
  if (response.status >= 300 && response.status < 400) {
    if (redirects >= MAX_REDIRECTS)
      throw new ProviderError(502, "RSS feed redirected too many times");
    const location = response.headers.get("location");
    if (!location)
      throw new ProviderError(502, "RSS feed returned an invalid redirect");
    return fetchRss(new URL(location, url).href, redirects + 1, deadline);
  }
  if (!response.ok) {
    if (response.status === 429)
      throw new ProviderError(429, "RSS feed rate limit reached");
    throw new ProviderError(502, `RSS feed returned HTTP ${response.status}`);
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_SIZE)
    throw new ProviderError(413, "RSS feed response is too large");
  const reader = response.body?.getReader();
  if (!reader) throw new ProviderError(502, "RSS feed returned no body");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_SIZE) {
      await reader.cancel();
      throw new ProviderError(413, "RSS feed response is too large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, code) =>
      String.fromCodePoint(
        code[0].toLowerCase() === "x"
          ? parseInt(code.slice(1), 16)
          : Number(code),
      ),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function tagValue(source, tag) {
  const match = source.match(
    new RegExp(`<(${tag})(?:\\s[^>]*)?>([\\s\\S]*?)</\\1>`, "i"),
  );
  if (!match) return "";
  // Unwrap CDATA first so markup stripping does not remove the entire title.
  const content = match[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decodeXml(content.replace(/<[^>]+>/g, " "));
}

function parseRss(xml, limit, baseUrl) {
  const entries = [
    ...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi),
  ].slice(0, limit);
  return entries.map(([, , source]) => {
    const linkMatch = source.match(
      /<link\b[^>]*?(?:href\s*=\s*["']([^"']+)["'][^>]*>|>([\s\S]*?)<\/link>)/i,
    );
    let link = decodeXml(linkMatch?.[1] || linkMatch?.[2] || "");
    try {
      link = link ? new URL(link, baseUrl).href : "";
    } catch {
      link = "";
    }
    return {
      title: tagValue(source, "title") || "Untitled article",
      url: link,
      detail: tagValue(source, "creator|author") || "",
    };
  });
}

async function providerJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  } catch {
    throw new ProviderError(502, "Provider could not be reached");
  }
  if (response.status === 403 || response.status === 429)
    throw new ProviderError(429, "Provider rate limit reached");
  if (response.status === 401)
    throw new ProviderError(
      401,
      "GitHub connection is invalid. Reconnect GitHub.",
    );
  if (!response.ok)
    throw new ProviderError(502, `Provider returned HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new ProviderError(502, "Provider returned invalid data");
  }
}

async function weatherData(widget) {
  const cityName = widget.configuration.city.trim();
  const geo = await providerJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`,
  );
  const city = geo.results?.[0];
  if (!city) throw new ProviderError(404, "City not found");
  const result = await providerJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&current=temperature_2m,precipitation,weather_code&timezone=auto`,
  );
  if (!result.current)
    throw new ProviderError(502, "Weather provider returned no current data");
  return {
    type: "weather",
    widget: widget.widget_name,
    city: [city.name, city.country].filter(Boolean).join(", "),
    temperature: result.current.temperature_2m,
    precipitation: result.current.precipitation,
    weather_code: result.current.weather_code,
  };
}

async function githubData(widget, credentials) {
  if (!credentials?.token)
    throw new ProviderError(403, "Connect GitHub before using GitHub widgets");
  const repository = widget.configuration.repository.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw new ProviderError(
      400,
      "Use owner/repository, for example facebook/react",
    );
  const headers = {
    Authorization: `Bearer ${credentials.token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "dashboard",
  };
  const base = `https://api.github.com/repos/${repository}`;
  if (widget.widget_name === "recent_commits") {
    const commits = await providerJson(
      `${base}/commits?per_page=${Math.min(20, Math.max(1, Number(widget.configuration.number) || 5))}`,
      { headers },
    );
    return {
      type: "list",
      items: commits.map((entry) => ({
        title: entry.commit?.message?.split("\n")[0] || "Untitled commit",
        url: entry.html_url,
        detail: entry.commit?.author?.name || entry.sha?.slice(0, 7) || "",
      })),
    };
  }
  if (widget.widget_name === "open_issues") {
    const result = await providerJson(
      `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:${repository} is:issue is:open`)}&per_page=1`,
      { headers },
    );
    return {
      type: "metric",
      value: result.total_count,
      unit: "",
      caption: "Open issues · pull requests excluded",
    };
  }
  const result = await providerJson(base, { headers });
  return {
    type: "metric",
    value: result.stargazers_count,
    unit: "☆",
    caption: "People following this repository",
  };
}

async function rssData(widget) {
  const xml = await fetchRss(widget.configuration.link);
  if (!/<(?:rss|feed|rdf:rdf)\b/i.test(xml))
    throw new ProviderError(502, "RSS feed returned invalid XML");
  const entries = parseRss(xml, 1000, widget.configuration.link);
  const limit =
    widget.widget_name === "latest_article"
      ? 1
      : Math.min(20, Math.max(1, Number(widget.configuration.number) || 5));
  if (widget.widget_name === "article_count")
    return {
      type: "metric",
      value: entries.length,
      unit: "",
      caption: "Articles currently available in this feed",
    };
  return { type: "list", items: entries.slice(0, limit) };
}

async function fetchWidgetData(widget, credentials) {
  if (widget.service_name === "weather") return weatherData(widget);
  if (widget.service_name === "github") return githubData(widget, credentials);
  if (widget.service_name === "rss") return rssData(widget);
  throw new ProviderError(400, "Unsupported widget service");
}

module.exports = { ProviderError, fetchWidgetData };
