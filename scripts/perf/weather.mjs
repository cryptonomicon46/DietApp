// Synthetic Open-Meteo answers (no network): 48 mild hours from today's midnight. Anything else
// outside the two local servers gets a quick 404, so the numbers don't depend on the internet.
const pad = (n) => String(n).padStart(2, '0');
export function weatherBody(url) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const time = [], t = [], rain = [], day = [];
  for (let i = 0; i < 48; i++) {
    const d = new Date(d0.getTime() + i * 3600e3), h = d.getHours();
    time.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:00`);
    t.push(52 + 14 * Math.sin(((h - 8) / 24) * 2 * Math.PI)); rain.push(h > 18 ? 30 : 5); day.push(h >= 7 && h < 18 ? 1 : 0);
  }
  if (/air-quality/.test(url)) return { hourly: { time, us_aqi: time.map(() => 32) } };
  return { hourly: { time, temperature_2m: t, apparent_temperature: t, precipitation_probability: rain, wind_speed_10m: time.map(() => 6), wind_gusts_10m: time.map(() => 12), uv_index: day.map((x) => x * 4), shortwave_radiation: day.map((x) => x * 600), cloud_cover: time.map(() => 20), is_day: day }, daily: { sunrise: [time[7]], sunset: [time[18]] } };
}
export const route = (r) => {
  const u = r.request().url();
  if (/^http:\/\/localhost:\d+\//.test(u)) return r.continue();
  if (/open-meteo\.com/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(weatherBody(u)) });
  return r.fulfill({ status: 404, body: '{}' });
};
