import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createInflationService,
  parseInflation,
  verifiedInflation,
  IPC_PAGE,
  IPC_SERIES,
} from '../server/statistics/inflation';
import { inflationResponseSchema } from '../shared/inflation';
import { InflationTile } from '../client/Statistics';

const now = new Date('2026-10-22T15:00:00Z');
const page =
  '<div class="card-titulo3 mb-3">13/10/26. Índice de precios al consumidor</div><a href="/uploads/informesdeprensa/ipc_10_268C45A9444C.pdf">Leer informe</a>';
const csv =
  'Codigo;Descripcion;Clasificador;Periodo;Indice_IPC;v_m_IPC;v_i_a_IPC;Region\r\n' +
  '0;NIVEL GENERAL;General;202512;10121,3715;2,8;31,5;Nacional\r\n' +
  '0;NIVEL GENERAL;General;202609;12514,1508;1,9;33,4;Nacional\r\n' +
  '0;NIVEL GENERAL;General;202610;99999;9;90;GBA\r\n';
const response = (body: string, status = 200) => new Response(body, { status });
const request = () =>
  vi.fn<typeof fetch>().mockImplementation(async (url) => response(url === IPC_PAGE ? page : csv));

it('extrae exclusivamente nivel general Nacional y calcula acumulado desde diciembre, no sumando tasas', () => {
  expect(parseInflation(csv, page, now)).toEqual(verifiedInflation);
});
it('rechaza formato roto, tasas inválidas, duplicados y diciembre faltante', () => {
  for (const bad of [
    'foo',
    csv.replace('12514,1508', 'NA'),
    csv.replace('1,9;33,4', '-100;33,4'),
    csv + '0;NIVEL GENERAL;General;202609;12514,1508;1,9;33,4;Nacional\r\n',
    csv.replace('202512', '202511'),
  ]) {
    expect(() => parseInflation(bad, page, now)).toThrow();
  }
});
it('rechaza publicaciones futuras y desalineadas con la serie', () => {
  expect(() => parseInflation(csv, page.replace('13/10/26', '23/10/26'), now)).toThrow();
  expect(() => parseInflation(csv, page.replace('13/10/26', '13/09/26'), now)).toThrow();
  expect(() => parseInflation(csv, page.replace('13/10/26', '31/02/26'), now)).toThrow();
  expect(() =>
    parseInflation(csv, page.replace('/uploads/informesdeprensa/', 'https://other.invalid/'), now),
  ).toThrow();
});
it('cachea seis horas, agrupa consultas simultáneas y conserva el último dato al fallar', async () => {
  let clock = now.getTime();
  const fetch = request();
  const service = createInflationService({ fetch, now: () => new Date(clock) });
  const [first, second] = await Promise.all([service.get(), service.get()]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({ status: 'verified', origin: 'live', snapshot: verifiedInflation });
  expect(fetch).toHaveBeenCalledTimes(2);
  await service.get();
  expect(fetch).toHaveBeenCalledTimes(2);
  clock += 6 * 3600000;
  fetch.mockRejectedValue(new Error('Offline'));
  expect(await service.get()).toMatchObject({
    status: 'fallback',
    origin: 'live',
    snapshot: verifiedInflation,
  });
  const calls = fetch.mock.calls.length;
  await service.get();
  expect(fetch).toHaveBeenCalledTimes(calls);
  clock += 15 * 60000;
  fetch.mockImplementation(async (url) => response(url === IPC_PAGE ? page : csv));
  expect((await service.get()).status).toBe('verified');
});
it('arranca con respaldo oficial verificado, sin transformar errores en cero', async () => {
  const service = createInflationService({
    fetch: vi.fn().mockRejectedValue(new Error('Offline')),
    now: () => now,
  });
  const data = await service.get();
  expect(data).toMatchObject({
    status: 'fallback',
    origin: 'bundled_verified',
    snapshot: verifiedInflation,
  });
  expect(inflationResponseSchema.parse(data)).toEqual(data);
});
it('no reemplaza el respaldo con una publicación vieja y limita respuestas', async () => {
  const old = createInflationService({
    fetch: vi
      .fn<typeof fetch>()
      .mockImplementation(async (url) =>
        response(
          url === IPC_PAGE
            ? page.replace('13/10/26', '13/09/26')
            : csv.replaceAll('202609', '202608'),
        ),
      ),
    now: () => now,
  });
  expect((await old.get()).origin).toBe('bundled_verified');
  for (const mode of ['http', 'large', 'format']) {
    const service = createInflationService({
      fetch: vi
        .fn<typeof fetch>()
        .mockImplementation(async (url) =>
          url === IPC_PAGE
            ? response(page)
            : response(
                mode === 'large' ? 'x'.repeat(4000001) : mode === 'format' ? 'invalid' : '',
                mode === 'http' ? 503 : 200,
              ),
        ),
      now: () => now,
    });
    expect((await service.get()).status).toBe('fallback');
  }
});
it('usa solamente URLs oficiales fijas, timeout y sin redirecciones', async () => {
  const fetch = request();
  await createInflationService({ fetch, now: () => now }).get();
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([IPC_PAGE, IPC_SERIES]);
  for (const [, options] of fetch.mock.calls)
    expect(options).toMatchObject({ redirect: 'error', signal: expect.any(AbortSignal) });
});
it('tile muestra tres tasas y referencia; las explicaciones quedan tras Información', () => {
  const html = renderToStaticMarkup(
    createElement(InflationTile, {
      data: { status: 'fallback', origin: 'bundled_verified', snapshot: verifiedInflation },
    }),
  );
  for (const text of [
    '1,9 %',
    '23,6 %',
    '33,4 %',
    'septiembre de 2026',
    'Información de Inflación',
    'Último verificado',
  ])
    expect(html).toContain(text);
  expect(html).not.toContain('Información pendiente');
  expect(html).not.toContain('El dato más reciente puede');
});
