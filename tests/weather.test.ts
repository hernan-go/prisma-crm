import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createWeatherService,
  createWeatherRouter,
  MET_URL,
  MET_USER_AGENT,
} from '../server/weather.js';
import { weatherCondition, type WeatherSnapshot } from '../shared/weather.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Weather } from '../client/Weather';
const BASE = Date.parse('2026-10-15T19:15:00Z');
function forecast(temperature = 22, symbol = 'partlycloudy_day') {
  return {
    properties: {
      meta: { updated_at: '2026-10-15T19:00:00Z', units: { air_temperature: 'celsius' } },
      timeseries: [19, 20, 21].map((hour, i) => ({
        time: `2026-10-15T${hour}:00:00Z`,
        data: {
          instant: { details: { air_temperature: temperature + i } },
          next_1_hours: { summary: { symbol_code: i === 1 ? 'rain' : symbol } },
        },
      })),
    },
  };
}
function response(body: unknown = forecast(), time = BASE, ttl = 30 * 60000, status = 200) {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: {
      Date: new Date(time).toUTCString(),
      Expires: new Date(time + ttl).toUTCString(),
      'Last-Modified': 'Thu, 15 Oct 2026 19:00:00 GMT',
    },
  });
}
function setup(fetcher = vi.fn<typeof fetch>().mockResolvedValue(response())) {
  let time = BASE;
  const service = createWeatherService({ fetcher, now: () => time, random: () => 0 });
  return {
    service,
    fetcher,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
describe('MET Norway: consulta fija, caché y vigencia temporal', () => {
  it('normaliza respuesta válida e identifica PRISMA, sin reenviar datos del visitante', async () => {
    const { service, fetcher } = setup();
    expect(await service.get()).toMatchObject({
      temperature: 22,
      symbol: 'partlycloudy_day',
      forecastAt: '2026-10-15T19:00:00Z',
      validUntil: '2026-10-15T20:00:00.000Z',
    });
    expect(fetcher).toHaveBeenCalledWith(
      MET_URL,
      expect.objectContaining({
        headers: { 'User-Agent': MET_USER_AGENT, Accept: 'application/json' },
        signal: expect.any(AbortSignal),
      }),
    );
  });
  it.each([0, -3.4, -0.4])('conserva cero y redondea temperaturas negativas: %s', async (temp) => {
    const { service } = setup(vi.fn<typeof fetch>().mockResolvedValue(response(forecast(temp))));
    expect((await service.get())?.temperature).toBe(Math.round(temp));
  });
  it('reutiliza caché vigente entre usuarios y cambia de intervalo sin descargar otra vez', async () => {
    const { service, fetcher, advance } = setup(
      vi.fn<typeof fetch>().mockResolvedValue(response(forecast(), BASE, 2 * 3600000)),
    );
    expect((await service.get())?.temperature).toBe(22);
    advance(3600000);
    expect(await service.get()).toMatchObject({
      temperature: 23,
      symbol: 'rain',
      forecastAt: '2026-10-15T20:00:00Z',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('revalida con Last-Modified idéntico y conserva documento ante 304', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response(null, BASE + 31 * 60000, 30 * 60000, 304));
    const { service, advance } = setup(fetcher);
    await service.get();
    advance(31 * 60000);
    expect((await service.get())?.temperature).toBe(22);
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
      'If-Modified-Since': 'Thu, 15 Oct 2026 19:00:00 GMT',
    });
    await service.get();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('deduplica peticiones simultáneas', async () => {
    let finish!: (r: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { service } = setup(fetcher);
    const a = service.get(),
      b = service.get(),
      c = service.get();
    finish(response());
    expect((await Promise.all([a, b, c])).every((w) => w?.temperature === 22)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('no sirve documentos viejos aunque Expires siga vigente', async () => {
    const old = forecast();
    old.properties.meta.updated_at = '2026-10-15T06:00:00Z';
    expect(
      await setup(vi.fn<typeof fetch>().mockResolvedValue(response(old))).service.get(),
    ).toBeNull();
    const { service, advance, fetcher } = setup(
      vi.fn<typeof fetch>().mockResolvedValue(response(forecast(), BASE, 8 * 3600000)),
    );
    await service.get();
    advance(6 * 3600000);
    expect(await service.get()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('no presenta el último intervalo como actual después de terminar su validez', async () => {
    const body = forecast();
    body.properties.timeseries = body.properties.timeseries.slice(0, 1);
    const { service, advance } = setup(
      vi.fn<typeof fetch>().mockResolvedValue(response(body, BASE, 3 * 3600000)),
    );
    await service.get();
    advance(3600000);
    expect(await service.get()).toBeNull();
  });
  it('tolera el primer intervalo futuro solo si está próximo', async () => {
    const body = forecast();
    body.properties.timeseries = body.properties.timeseries.slice(1);
    expect(
      await setup(vi.fn<typeof fetch>().mockResolvedValue(response(body))).service.get(),
    ).toBeNull();
    const service = createWeatherService({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(body)),
      now: () => BASE + 30 * 60000,
      random: () => 0,
    });
    expect((await service.get())?.forecastAt).toBe('2026-10-15T20:00:00Z');
  });
  it('usa el resumen de seis horas cuando no hay resumen horario', async () => {
    const body = forecast() as any;
    for (const p of body.properties.timeseries) {
      p.data.next_6_hours = p.data.next_1_hours;
      delete p.data.next_1_hours;
    }
    expect(
      (await setup(vi.fn<typeof fetch>().mockResolvedValue(response(body))).service.get())?.symbol,
    ).toBe('partlycloudy_day');
  });
});
describe('MET Norway: errores aislados y recuperación', () => {
  it.each([
    {},
    { properties: {} },
    { properties: { ...forecast().properties, timeseries: [] } },
    {
      properties: {
        ...forecast().properties,
        meta: { ...forecast().properties.meta, units: { air_temperature: 'kelvin' } },
      },
    },
  ])('rechaza respuesta incompleta sin inventar temperatura', async (body) => {
    expect(
      await setup(vi.fn<typeof fetch>().mockResolvedValue(response(body))).service.get(),
    ).toBeNull();
  });
  it('tolera JSON inválido y 304 sin documento previo', async () => {
    expect(
      await setup(vi.fn<typeof fetch>().mockResolvedValue(new Response('invalid'))).service.get(),
    ).toBeNull();
    expect(
      await setup(
        vi.fn<typeof fetch>().mockResolvedValue(response(null, BASE, 0, 304)),
      ).service.get(),
    ).toBeNull();
  });
  it.each([403, 429, 500])('respeta backoff y Retry-After ante HTTP %s', async (status) => {
    const bad = new Response('', { status, headers: { 'Retry-After': '3600' } });
    const { service, fetcher, advance } = setup(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(bad)
        .mockResolvedValueOnce(response(forecast(), BASE + 3600000)),
    );
    expect(await service.get()).toBeNull();
    advance(15 * 60000);
    expect(await service.get()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    advance(46 * 60000);
    expect((await service.get())?.temperature).toBe(23);
  });
  it('oculta datos tras fallar una revalidación y recupera después del backoff', async () => {
    const { service, fetcher, advance } = setup(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response())
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(response(forecast(), BASE + 37 * 60000)),
    );
    await service.get();
    advance(31 * 60000);
    expect(await service.get()).toBeNull();
    await service.get();
    expect(fetcher).toHaveBeenCalledTimes(2);
    advance(6 * 60000);
    expect((await service.get())?.temperature).toBe(22);
  });
  it('aborta por timeout y devuelve indisponibilidad sin rechazar get()', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), {
            once: true,
          });
        }),
    );
    const service = createWeatherService({ fetcher, timeoutMs: 10, now: () => BASE });
    expect(await service.get()).toBeNull();
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it('endpoint local no admite ubicación del usuario ni filtra errores técnicos', async () => {
    const get = vi.fn().mockResolvedValue(null);
    const app = express().use('/api', createWeatherRouter({ get }));
    expect((await request(app).get('/api/weather?lat=1&lon=2&period_id=7')).body).toEqual({
      weather: null,
    });
    get.mockRejectedValueOnce(new Error('HTTP 403 secret detail'));
    expect((await request(app).get('/api/weather')).body).toEqual({ weather: null });
  });
});
describe('Condiciones e iconos locales', () => {
  it.each([
    ['clearsky_day', 'Despejado', 'sun'],
    ['clearsky_night', 'Despejado', 'moon'],
    ['partlycloudy_day', 'Parcialmente nublado', 'sun-cloud'],
    ['partlycloudy_night', 'Parcialmente nublado', 'moon-cloud'],
    ['cloudy', 'Nublado', 'cloud'],
    ['rain', 'Lluvia', 'rain'],
    ['lightrain', 'Lluvia ligera', 'drizzle'],
    ['rainandthunder', 'Tormenta', 'storm'],
    ['lightssnowshowersandthunder_night', 'Tormenta', 'storm'],
    ['fog', 'Niebla', 'fog'],
    ['snow', 'Nieve', 'snow'],
    ['unrecognized_day', 'Condición no disponible', 'unknown'],
  ])('%s → %s / %s', (code, label, icon) => {
    expect(weatherCondition(code)).toEqual({ label, icon });
  });
});
function renderWeather(data: WeatherSnapshot | null, error = false) {
  const client = new QueryClient();
  client.setQueryData(['weather', 'rosario'], { weather: data });
  if (error)
    client
      .getQueryCache()
      .find({ queryKey: ['weather', 'rosario'] })!
      .setState({ status: 'error', error: new Error('HTTP 500') });
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(Weather, { now: new Date(BASE) })),
  );
  client.clear();
  return html;
}
const snapshot: WeatherSnapshot = {
  temperature: 0,
  symbol: 'clearsky_night',
  forecastAt: '2026-10-15T19:00:00Z',
  validUntil: '2026-10-15T20:00:00Z',
  updatedAt: '2026-10-15T19:00:00Z',
  checkedAt: '2026-10-15T19:15:00Z',
};
it('UI conserva cero, atribuye fuente y usa iconos nocturnos', () => {
  const html = renderWeather(snapshot);
  expect(html).toContain('0°C');
  expect(html).toContain('lucide-moon');
  expect(html).toContain('MET Norway');
  expect(html).toContain('https://creativecommons.org/licenses/by/4.0/');
});
it('UI oculta temperatura caducada o fallida sin exponer errores HTTP', () => {
  for (const html of [
    renderWeather(null),
    renderWeather({ ...snapshot, validUntil: '2026-10-15T19:00:00Z' }),
    renderWeather(snapshot, true),
  ]) {
    expect(html).toContain('Clima no disponible');
    expect(html).toContain('ROSARIO, SANTA FE');
    expect(html).not.toContain('°C');
    expect(html).not.toContain('HTTP 500');
  }
});
