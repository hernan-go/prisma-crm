import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { EducationReceiptView } from '../client/EducationReceipt';
import type { EducationReceipt, EducationSnapshot } from '../shared/education';
const person = { id: 1, public_id: 'QA-1', apellido: 'Prueba', nombre: 'Persona', activo: 1 };
const snapshot = {
  person,
  activities: [{ id: 2, name: 'Yoga', active: 1 }],
  rights: [],
  presential: [],
  enrollments: [],
  revision: 1,
  now: 0,
} as EducationSnapshot;
function view(
  kind: string,
  result: EducationReceipt['result'] & { enabled?: boolean; previousEnabled?: boolean | null },
  extras: Partial<EducationReceipt> = {},
) {
  const receipt = {
    kind,
    result,
    operationId: 'operation-uuid',
    actorId: 'actor-uuid',
    actorName: 'Administración QA',
    createdAt: Date.parse('2026-11-25T12:30:00-03:00'),
    reason: 'Motivo de prueba',
    activityId: 2,
    paymentDeclared: false,
    accountedPayment: false,
    ...extras,
  } as EducationReceipt;
  return renderToStaticMarkup(
    <EducationReceiptView receipt={receipt} person={person} snapshot={snapshot} />,
  );
}
it('presents grant and renewal in Spanish with fixed UTC-03 dates and exclusive end', () => {
  const start = Date.parse('2026-11-25T12:00:01.234-03:00'),
    end = Date.parse('2027-02-25T12:00:02.987-03:00');
  for (const action of ['grant', 'renewal'] as const) {
    const html = view(
      'digital',
      {
        revision: 2,
        action,
        startsAt: start,
        endsAt: end,
        previousEnd: action === 'grant' ? null : start,
      },
      { paymentDeclared: true, verificationReference: 'QA-REF' },
    );
    expect(html).toContain(action === 'grant' ? 'Concesión trimestral' : 'Renovación trimestral');
    expect(html).toContain('Fin excluido:');
    expect(html).toContain('25 nov 2026');
    expect(html).toContain('12:00');
    expect(html).toContain('QA-REF');
    expect(html).toContain('no es comprobante de cobro');
    expect(html).not.toContain('JSON');
    const [main, details] = html.split('<details>');
    expect(main).not.toContain('2026-11-25T12:00:01.234-03:00');
    expect(details).toContain('2026-11-25T12:00:01.234-03:00');
    expect(details).toContain('2027-02-25T12:00:02.987-03:00');
    if (action === 'renewal') expect(details).toContain('Fin anterior exacto');
    expect(html).not.toContain(String(Date.parse('2026-11-25T12:30:00-03:00')));
    expect(html).not.toContain(String(start));
    expect(html).not.toContain(String(end));
  }
});
it('renders revocation, presential and binding without unrelated fields', () => {
  const revoke = view('revoke', {
    revision: 3,
    action: 'revoke',
    rightId: 'right-uuid',
    revokedAt: Date.parse('2026-11-25T12:00:00-03:00'),
  });
  expect(revoke).toContain('Revocación de acceso digital');
  expect(revoke).toContain('Yoga');
  expect(revoke).not.toContain('Fin excluido');
  const presential = view('presential', { revision: 4, action: 'presential', enabled: false });
  expect(presential).toContain('Retiro de habilitación presencial educativa');
  expect(presential).toContain('Deshabilitado');
  expect(presential).not.toContain('Fin excluido');
  const link = view(
    'link',
    { revision: 5, action: 'link', enabled: true, previousEnabled: null },
    { userId: 'identity-uuid' },
  );
  expect(link).toContain('Vinculación administrativa');
  expect(link).toContain('Vínculo habilitado');
  expect(link).toContain('identity-uuid');
  expect(link).not.toContain('Disciplina:');
  const disabled = view('link', { revision: 6, enabled: false, previousEnabled: true });
  expect(disabled).toContain('Deshabilitación del vínculo');
  expect(disabled).toContain('Vínculo deshabilitado');
  expect(disabled).not.toContain('Desvinculación');
  expect(view('link', { revision: 7, enabled: true, previousEnabled: false })).toContain(
    'Rehabilitación del vínculo',
  );
  const unknown = view('link', { revision: 8, enabled: true });
  expect(unknown).toContain('Estado del vínculo administrativo');
  expect(unknown).not.toContain('Vinculación administrativa');
  expect(link + disabled + unknown).not.toMatch(/inicio de sesión|identidad activada/i);
});
it('labels unavailable and unknown values without leaking backend keys', () => {
  const html = view(
    'new-kind',
    { revision: Number.NaN, action: undefined, previousEnd: undefined },
    { actorName: '', createdAt: Number.NaN },
  );
  expect(html).toContain('Operación administrativa registrada');
  expect(html).toContain('Fecha desconocida');
  expect(html).toContain('Nombre no disponible');
  expect(html).toContain('No informada');
  expect(html).toContain('operation-uuid');
  expect(html).not.toContain('new-kind');
  expect(html).not.toContain('previousEnd');
});
