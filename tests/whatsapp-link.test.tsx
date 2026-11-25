import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { WhatsAppLink } from '../client/WhatsAppLink';
it('renders an exact external URL with no prefilled message', () => {
  const html = renderToStaticMarkup(
    createElement(WhatsAppLink, { phone: '3410000000', name: 'Persona sintética' }),
  );
  expect(html).toContain('href="https://wa.me/5493410000000"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('aria-label="Abrir WhatsApp de Persona sintética (nueva pestaña)"');
  expect(html).not.toContain('?text=');
  expect(html).not.toContain('tabindex="-1"');
});
it.each(['', '15 0000000', undefined])('has no interactive target for %s', (phone) => {
  const html = renderToStaticMarkup(
    createElement(WhatsAppLink, { phone, name: 'Persona sintética' }),
  );
  expect(html).toContain('aria-disabled="true"');
  expect(html).not.toMatch(/href=|<a\b|<img\b|tabindex/);
});
