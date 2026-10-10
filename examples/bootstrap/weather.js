const DEFAULT_CITY = 'Barcelona';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

async function fetchJson(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  let city = DEFAULT_CITY;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--city' || !args[1].trim())
      throw new Error('usage: node examples/bootstrap/weather.js --city "City name"');
    city = args[1].trim();
  }
  const query = new URLSearchParams({name: city, count: '1', language: 'en', format: 'json'});
  const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${query}`);
  if (!geo.results?.length) throw new Error(`city not found: ${city}`);
  const {latitude, longitude, name} = geo.results[0];
  const weatherQuery = new URLSearchParams({latitude, longitude, current: 'temperature_2m', temperature_unit: 'celsius'});
  const data = await fetchJson(`${WEATHER_URL}?${weatherQuery}`);
  if (!Number.isFinite(data.current?.temperature_2m)) throw new Error('temperature missing from response');
  console.log(`${name}: ${data.current.temperature_2m}°C`);
}

main().catch(error => {
  console.error(`Error: could not fetch weather data (reason: ${error.message})`);
  process.exit(1);
});
