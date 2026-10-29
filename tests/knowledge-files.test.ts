import { expect, it } from 'vitest';
import { knowledgeFilename, suggestedMarkdownTitle } from '../client/knowledge-files';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Knowledge, KnowledgeEditor } from '../client/Knowledge';
import { Modal } from '../client/components';

it('estados conservan texto accesible y LED decorativo', () => {
  const client = new QueryClient();
  client.setQueryData(['knowledge', 'documents', 'q=&page=1'], {
    rows: [false, true].map((is_active, i) => ({
      id: String(i),
      title: 'Sintético',
      is_active,
      updated_at: '2026-10-29 12:00:00',
      content_version: 1,
    })),
    total: 2,
    page: 1,
  });
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(Knowledge)),
  );
  expect(html).toContain('knowledge-state is-active');
  expect(html).toContain('knowledge-state is-inactive');
  expect(html).toContain('aria-hidden="true" class="knowledge-led"');
  expect(html).toContain('Activo');
  expect(html).toContain('Inactivo');
});
it('título propuesto permanece en campo editable, sin alterar contenido inicial', () => {
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(KnowledgeEditor, {
        initial: '# Original',
        initialTitle: 'Propuesta',
        categories: [],
        close: () => {},
      }),
    ),
  );
  expect(html).toContain('value="Propuesta"');
  expect(html).not.toContain('readonly');
  expect(html).toContain('# Original');
});
it('Modal compartido conserva su presentación predeterminada sin optar por aviso centrado', () => {
  const html = renderToStaticMarkup(
    createElement(Modal, { title: 'Formulario existente', close: () => {}, children: 'Contenido' }),
  );
  expect(html).toContain('<dialog');
  expect(html).toContain('Formulario existente');
  expect(html).not.toContain('knowledge-notice');
});

it('exportación descriptiva, acotada y sin colisiones entre documentos', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  expect(knowledgeFilename('Estrategia, Dirección y Gestión de Riesgos', id)).toBe(
    `estrategia-direccion-y-gestion-de-riesgos-${id}.md`,
  );
  for (const title of ['', '../\\\u0000', 'CON', 'á'.repeat(2000)]) {
    const name = knowledgeFilename(title, id);
    expect(name).toMatch(/^[a-z0-9-]+\.md$/);
    expect(name.length).toBeLessThan(150);
  }
  expect(knowledgeFilename('Igual', 'id-1')).not.toBe(knowledgeFilename('Igual', 'id-2'));
});
it('sugiere encabezado H1 válido fuera de fences y conserva el original', () => {
  const content =
    '```md\n# Falso\n````\n~~~\n# También falso\n~~~\n    # Indentado\n# Título editable ###\nTexto';
  expect(suggestedMarkdownTitle(content, 'otro.md')).toBe('Título editable');
  expect(content).toContain('# Falso');
  expect(suggestedMarkdownTitle('# ' + 'a'.repeat(241) + '\n# Correcto', 'otro.md')).toBe(
    'Correcto',
  );
});
it('usa nombre legible como alternativa, sin rutas ni controles', () => {
  expect(suggestedMarkdownTitle('## Nivel dos', 'mi_documento-final.md')).toBe(
    'mi documento final',
  );
  expect(suggestedMarkdownTitle('```\n# Ignorado', '../directorio/archivo.md')).toBe('archivo');
  expect(suggestedMarkdownTitle('', '\u0000.md')).toBe('Documento importado');
});
