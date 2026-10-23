import Papa from 'papaparse';
import { Decimal } from 'decimal.js';
import {
  inflationSnapshotSchema,
  type InflationSnapshot,
  type InflationResponse,
} from '../../shared/inflation.js';

export const IPC_PAGE = 'https://www.indec.gob.ar/Nivel4/Tema/3/5/31';
export const IPC_SERIES = 'https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv';
// Verified against the official page/report and CSV on 2026-10-22.
// Emergency baseline only: reference/publication/verification remain explicit in the UI.
export const verifiedInflation: InflationSnapshot = inflationSnapshotSchema.parse({
  reference_period: '2026-09',
  monthly: '1.9',
  year_to_date: '23.6',
  year_over_year: '33.4',
  published_at: '2026-10-13',
  verified_at: '2026-10-22',
  source: 'INDEC · IPC nacional, nivel general',
  source_url: 'https://www.indec.gob.ar/uploads/informesdeprensa/ipc_10_268C45A9444C.pdf',
  series_url: IPC_SERIES,
});

export function parseInflation(csv: string, page: string, now: Date): InflationSnapshot {
  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });
  if (
    parsed.errors.length ||
    !['Codigo', 'Periodo', 'Indice_IPC', 'v_m_IPC', 'v_i_a_IPC', 'Region'].every((key) =>
      parsed.meta.fields?.includes(key),
    )
  )
    throw Error('IPC: formato de serie inválido');
  const rows = parsed.data.filter((r) => r.Codigo === '0' && r.Region === 'Nacional');
  const byPeriod = new Map<string, Record<string, string>>();
  for (const row of rows) {
    if (!/^\d{4}(0[1-9]|1[0-2])$/.test(row.Periodo) || byPeriod.has(row.Periodo))
      throw Error('IPC: período inválido o duplicado');
    byPeriod.set(row.Periodo, row);
  }
  const latest = [...byPeriod.keys()].sort().at(-1);
  if (!latest) throw Error('IPC: serie vacía');
  const row = byPeriod.get(latest)!;
  const previousDecember = byPeriod.get(`${Number(latest.slice(0, 4)) - 1}12`);
  if (!previousDecember) throw Error('IPC: falta base de diciembre');
  // The first technical-report card supplies publication date and report URL.
  const publication = /class=["']card-titulo3[^"']*["'][^>]*>\s*(\d{2})\/(\d{2})\/(\d{2})\./i.exec(
    page,
  );
  const report = /href=["'](\/uploads\/informesdeprensa\/ipc_[a-z0-9_]+\.pdf)["']/i.exec(page);
  if (!publication || !report) throw Error('IPC: publicación no identificada');
  const published = `20${publication[3]}-${publication[2]}-${publication[1]}`;
  const reference = `${latest.slice(0, 4)}-${latest.slice(4)}`;
  const publicationDate = new Date(`${published}T12:00:00Z`);
  if (
    !Number.isFinite(publicationDate.getTime()) ||
    publicationDate.toISOString().slice(0, 10) !== published ||
    publicationDate > now
  )
    throw Error('IPC: fecha inválida o futura');
  const publicationMonth = publicationDate.getUTCFullYear() * 12 + publicationDate.getUTCMonth();
  const referenceMonth = Number(latest.slice(0, 4)) * 12 + Number(latest.slice(4)) - 1;
  // Do not combine a new CSV with an older report, nor an unpublished current month.
  if (publicationMonth - referenceMonth !== 1) throw Error('IPC: serie y publicación desalineadas');
  const value = (raw: string) => {
    if (!/^-?\d+(?:[.,]\d+)?$/.test(raw)) throw Error('IPC: valor inválido');
    return new Decimal(raw.replace(',', '.'));
  };
  const index = value(row.Indice_IPC),
    base = value(previousDecember.Indice_IPC);
  if (!index.gt(0) || !base.gt(0)) throw Error('IPC: índice no positivo');
  const monthly = value(row.v_m_IPC),
    annual = value(row.v_i_a_IPC);
  if (monthly.lte(-100) || annual.lte(-100) || monthly.gt(10000) || annual.gt(100000))
    throw Error('IPC: tasa inválida');
  return inflationSnapshotSchema.parse({
    reference_period: reference,
    monthly: monthly.toFixed(1),
    year_to_date: index.div(base).minus(1).times(100).toFixed(1),
    year_over_year: annual.toFixed(1),
    published_at: published,
    verified_at: now.toISOString().slice(0, 10),
    source: verifiedInflation.source,
    source_url: new URL(report[1], IPC_PAGE).href,
    series_url: IPC_SERIES,
  });
}

async function boundedText(response: Response, max: number) {
  if (!response.ok || !response.body) throw Error('IPC: fuente no disponible');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw Error('IPC: respuesta excesiva');
      chunks.push(value);
    }
    // INDEC CSV uses Latin-1; identifiers consumed here are ASCII.
    return new TextDecoder('windows-1252').decode(Buffer.concat(chunks));
  } finally {
    await reader.cancel().catch(() => {});
  }
}
export function createInflationService(options: { fetch?: typeof fetch; now?: () => Date } = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  let snapshot = verifiedInflation;
  let origin: InflationResponse['origin'] = 'bundled_verified';
  let failed = true,
    refreshAt = 0;
  let inFlight: Promise<void> | undefined;
  async function refresh() {
    try {
      const signal = AbortSignal.timeout(8000);
      const [page, csv] = await Promise.all([
        request(IPC_PAGE, { signal, redirect: 'error' }).then((r) => boundedText(r, 500000)),
        request(IPC_SERIES, { signal, redirect: 'error' }).then((r) => boundedText(r, 4000000)),
      ]);
      const candidate = parseInflation(csv, page, now());
      if (
        candidate.reference_period < snapshot.reference_period ||
        candidate.published_at < snapshot.published_at
      )
        throw Error('IPC: respuesta anterior al último verificado');
      snapshot = candidate;
      origin = 'live';
      failed = false;
      refreshAt = now().getTime() + 6 * 60 * 60 * 1000;
    } catch {
      failed = true;
      refreshAt = now().getTime() + 15 * 60 * 1000;
    }
  }
  return {
    async get(): Promise<InflationResponse> {
      if (now().getTime() >= refreshAt) {
        inFlight ??= refresh().finally(() => {
          inFlight = undefined;
        });
        await inFlight;
      }
      return { status: failed ? 'fallback' : 'verified', origin, snapshot: { ...snapshot } };
    },
  };
}
export const inflationService = createInflationService();
