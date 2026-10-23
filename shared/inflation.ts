import { z } from 'zod';

const rate = z.string().regex(/^-?\d+\.\d$/);
export const inflationSnapshotSchema = z.object({
  reference_period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  monthly: rate,
  year_to_date: rate,
  year_over_year: rate,
  published_at: z.iso.date(),
  verified_at: z.iso.date(),
  source: z.literal('INDEC · IPC nacional, nivel general'),
  source_url: z.url(),
  series_url: z.url(),
});
export const inflationResponseSchema = z.object({
  status: z.enum(['verified', 'fallback']),
  origin: z.enum(['live', 'bundled_verified']),
  snapshot: inflationSnapshotSchema,
});
export type InflationSnapshot = z.infer<typeof inflationSnapshotSchema>;
export type InflationResponse = z.infer<typeof inflationResponseSchema>;
export const inflationMonth = (period: string) => {
  const [year, month] = period.split('-').map(Number);
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 15),
  );
};
export const inflationRate = (rate: string) => `${rate.replace('.', ',')} %`;
