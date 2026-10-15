import { Router } from 'express';
import { z } from 'zod';
import type { WeatherResponse, WeatherSnapshot } from '../shared/weather.js';

export const MET_URL =
  'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=-32.9442&lon=-60.6505';
export const MET_USER_AGENT = 'PRISMA-CRM/1.0 (+https://prismacomunidad.com.ar)';
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const summary = z
  .object({ summary: z.object({ symbol_code: z.string().min(1).max(100) }) })
  .optional();
const forecastSchema = z.object({
  properties: z.object({
    meta: z.object({
      updated_at: z.string().datetime(),
      units: z.object({ air_temperature: z.literal('celsius') }),
    }),
    timeseries: z
      .array(
        z.object({
          time: z.string().datetime(),
          data: z.object({
            instant: z.object({
              details: z.object({ air_temperature: z.number().finite().min(-100).max(70) }),
            }),
            next_1_hours: summary,
            next_6_hours: summary,
            next_12_hours: summary,
          }),
        }),
      )
      .min(1)
      .max(1000),
  }),
});
type Forecast = z.infer<typeof forecastSchema>['properties'];
type Cache = { forecast: Forecast; expiresAt: number; lastModified?: string; checkedAt: number };

// Re-select the interval on every local request, even when the downloaded document is cached.
function selectWeather(cache: Cache, now: number): WeatherSnapshot | null {
  const updated = Date.parse(cache.forecast.meta.updated_at);
  // Fail closed: no stale-on-error response, models older than 12h or caches unchecked for 6h.
  if (updated > now + 5 * MINUTE || now - updated >= 12 * HOUR || now - cache.checkedAt >= 6 * HOUR)
    return null;
  const points = [...cache.forecast.timeseries].sort(
    (a, b) => Date.parse(a.time) - Date.parse(b.time),
  );
  const point = points.filter((p) => Date.parse(p.time) <= now).at(-1) || points[0];
  const start = Date.parse(point.time);
  if (start > now + 30 * MINUTE || now - start >= HOUR) return null;
  const symbol =
    point.data.next_1_hours?.summary.symbol_code ||
    point.data.next_6_hours?.summary.symbol_code ||
    point.data.next_12_hours?.summary.symbol_code;
  if (!symbol) return null;
  const next = points.find((p) => Date.parse(p.time) > start);
  const validUntil = Math.min(
    start + HOUR,
    next ? Date.parse(next.time) : Infinity,
    updated + 12 * HOUR,
    cache.checkedAt + 6 * HOUR,
  );
  return {
    temperature: Math.round(point.data.instant.details.air_temperature),
    symbol,
    forecastAt: point.time,
    validUntil: new Date(validUntil).toISOString(),
    updatedAt: cache.forecast.meta.updated_at,
    checkedAt: new Date(cache.checkedAt).toISOString(),
  };
}
export function createWeatherService({
  fetcher = fetch,
  now = Date.now,
  random = Math.random,
  timeoutMs = 5000,
}: {
  fetcher?: typeof fetch;
  now?: () => number;
  random?: () => number;
  timeoutMs?: number;
} = {}) {
  let cache: Cache | undefined;
  let inFlight: Promise<void> | undefined;
  let retryAt = 0;
  let failed = false;
  const expires = (headers: Headers, time: number) => {
    const expiry = Date.parse(headers.get('expires') || '');
    const date = Date.parse(headers.get('date') || '');
    const target = Number.isFinite(expiry)
      ? Number.isFinite(date)
        ? time + expiry - date
        : expiry
      : time + 30 * MINUTE;
    // Never revalidate before Expires; avoid synchronized refreshes across processes.
    return Math.max(time + MINUTE, target) + random() * MINUTE;
  };
  async function refresh() {
    try {
      const headers: Record<string, string> = {
        'User-Agent': MET_USER_AGENT,
        Accept: 'application/json',
      };
      if (cache?.lastModified) headers['If-Modified-Since'] = cache.lastModified;
      const response = await fetcher(MET_URL, { headers, signal: AbortSignal.timeout(timeoutMs) });
      const time = now();
      if (response.status === 304 && cache) {
        cache = { ...cache, expiresAt: expires(response.headers, time), checkedAt: time };
      } else if (response.status === 200) {
        const forecast = forecastSchema.parse(await response.json()).properties;
        const modified = response.headers.get('last-modified');
        cache = {
          forecast,
          expiresAt: expires(response.headers, now()),
          checkedAt: now(),
          lastModified:
            modified && Number.isFinite(Date.parse(modified)) && Date.parse(modified) <= now()
              ? modified
              : undefined,
        };
      } else {
        failed = true;
        const after = response.headers.get('retry-after');
        const delay =
          after && /^\d+$/.test(after) ? Number(after) * 1000 : Date.parse(after || '') - time;
        retryAt =
          time +
          Math.max(
            response.status === 403 ? HOUR : response.status === 429 ? 15 * MINUTE : 5 * MINUTE,
            Number.isFinite(delay) ? delay : 0,
          );
        await response.body?.cancel();
        return;
      }
      failed = false;
      retryAt = 0;
    } catch {
      failed = true;
      retryAt = now() + 5 * MINUTE;
    }
  }
  return {
    async get(): Promise<WeatherSnapshot | null> {
      if (now() >= retryAt && (!cache || now() >= cache.expiresAt)) {
        inFlight ??= refresh().finally(() => {
          inFlight = undefined;
        });
        await inFlight;
      }
      return failed || !cache ? null : selectWeather(cache, now());
    },
  };
}
export function createWeatherRouter(service = createWeatherService()) {
  const router = Router();
  router.get('/weather', async (_req, res) => {
    let weather: WeatherSnapshot | null = null;
    try {
      weather = await service.get();
    } catch {
      /* Weather must never affect the CRM. */
    }
    res.json({ weather } satisfies WeatherResponse);
  });
  return router;
}
