import { z } from 'zod';

export const KNOWLEDGE_MAX_BYTES = 512 * 1024;
export const knowledgeRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const title = z.string().trim().min(1).max(240);
export const markdown = z
  .string()
  .max(KNOWLEDGE_MAX_BYTES)
  .refine(
    (value) => new TextEncoder().encode(value).length <= KNOWLEDGE_MAX_BYTES,
    'El documento supera 512 KiB.',
  )
  .refine(
    (value) =>
      !Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
      }),
    'El contenido debe ser texto Markdown.',
  );
export const documentInput = z
  .object({ title, category_id: z.number().int().positive().nullable(), content_md: markdown })
  .strict();
export const documentUpdate = documentInput
  .extend({ expected_revision: knowledgeRevision })
  .strict();
export const documentStatus = z
  .object({ is_active: z.boolean(), expected_revision: knowledgeRevision })
  .strict();
export const categoryInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    position: z.number().int().min(1).max(1000000),
  })
  .strict();
export const categoryUpdate = categoryInput
  .extend({ archived: z.boolean(), expected_revision: knowledgeRevision })
  .strict();
export const documentFilters = z
  .object({
    q: z.string().trim().max(240).default(''),
    category: z.union([z.literal('none'), z.coerce.number().int().positive()]).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
  })
  .strict();
export type KnowledgeInput = z.infer<typeof documentInput>;
export interface KnowledgeCategory {
  id: number;
  name: string;
  position: number;
  revision: number;
  archived_at: string | null;
}
export interface KnowledgeSummary {
  id: string;
  title: string;
  category_id: number | null;
  category_name: string | null;
  is_active: boolean;
  revision: number;
  content_version: number;
  updated_at: string;
  created_at: string;
  pillar_key: string | null;
}
export interface KnowledgeDocument extends KnowledgeSummary {
  content_md: string;
}
export interface KnowledgeList {
  rows: KnowledgeSummary[];
  total: number;
  page: number;
}

export const knowledgePillars = [
  [
    'identity',
    'Identidad y Modelo de Negocio',
    [
      'Propósito e identidad',
      '¿Cuál es el propósito del emprendimiento y a quién acompaña?',
      'Propuesta de valor y modelo de negocio',
      '¿Qué ofrece, para quién y cómo sostiene su actividad?',
    ],
  ],
  [
    'operations',
    'Servicios, Operaciones y Calidad',
    [
      'Servicios y alcance',
      '¿Qué servicios se ofrecen y cuáles son sus límites?',
      'Procedimientos y calidad',
      '¿Cómo se organizan las tareas y se verifica la calidad?',
    ],
  ],
  [
    'marketing',
    'Marketing, Comercialización y Experiencia del Participante',
    [
      'Comunicación y comercialización',
      '¿Qué canales, mensajes y criterios comerciales se utilizan?',
      'Experiencia del participante',
      '¿Cómo se acompaña la consulta, incorporación y continuidad?',
    ],
  ],
  [
    'finance',
    'Finanzas, Precios y Sostenibilidad',
    [
      'Criterios económicos y precios',
      '¿Qué criterios aprobados orientan precios, costos y descuentos?',
      'Sostenibilidad',
      '¿Qué información y supuestos se revisan antes de decidir?',
    ],
  ],
  [
    'strategy',
    'Estrategia, Dirección y Gestión de Riesgos',
    [
      'Objetivos y dirección',
      '¿Qué objetivos, responsables y fechas de revisión se acordaron?',
      'Riesgos y seguimiento',
      '¿Qué riesgos se identificaron y cómo se revisan?',
    ],
  ],
].map(([key, name, sections]) => ({
  key: key as string,
  title: name as string,
  content_md: `# ${name}\n\nPlantilla orientativa. Pendiente de completar y revisar.\n\n${(sections as string[]).map((text, i) => (i % 2 === 0 ? `## ${text}\n` : `${text}\n\nPendiente de completar.\n`)).join('\n')}\n## Fuentes y vigencia\n\n¿Qué fuentes respaldan este documento y cuándo debe revisarse?\n\nPendiente de completar.\n`,
}));
