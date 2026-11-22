// DEV-only synthetic fixture. No backend, real identities, payments or database.
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EducationAccess } from '../../client/EducationAccess';
import { EducationPresential } from '../../client/EducationPresential';
import {
  commercialDate,
  type EducationSnapshot,
  type EducationReceipt,
} from '../../shared/education';
import '../../client/styles.css';
const now = Date.parse('2026-11-22T12:00:00-03:00');
const data: EducationSnapshot = {
  participantLink: null,
  revision: 1,
  now,
  person: {
    id: 1,
    public_id: 'QA-0001',
    nombre: 'Persona sintética',
    apellido: 'Prueba',
    activo: 1,
  },
  activities: [
    { id: 1, name: 'Yoga', active: 1 },
    { id: 2, name: 'Inclusión Digital', active: 1 },
  ],
  presential: [{ activityId: 1, activity: 'Yoga', enabled: 1 }],
  enrollments: [{ activity: 'Yoga', month: 11, year: 2026 }],
  rights: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      activityId: 2,
      activity: 'Inclusión Digital',
      startsAt: now,
      endsAt: Date.parse('2027-02-22T12:00:00-03:00'),
      revokedAt: null,
      status: 'active',
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      activityId: 2,
      activity: 'Inclusión Digital',
      startsAt: Date.parse('2026-02-22T12:00:00-03:00'),
      endsAt: Date.parse('2026-05-22T12:00:00-03:00'),
      revokedAt: null,
      status: 'expired',
    },
  ],
};
const history: EducationReceipt[] = [];
const receipts = new Map<string, EducationReceipt>();
const candidates = [1, 2].map((n) => ({
  userId: `00000000-0000-4000-8000-00000000008${n}`,
  displayName: 'Participante sintético homónimo',
  status: 'disabled',
  personId: null,
  enabled: null,
}));
let mode = 'normal',
  lost = false;
window.fetch = async (input, init) => {
  const path = String(input);
  if (path === '/api/auth/session')
    return new Response(
      JSON.stringify({
        authenticated: true,
        configured: true,
        method: 'identity',
        identity: {
          userId: '00000000-0000-4000-8000-000000000099',
          displayName: 'Administración sintética',
          roles: ['admin'],
        },
      }),
    );
  if (!path.startsWith('/api/education-access/')) throw Error('QA: network forbidden');
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  let result: unknown,
    status = 200;
  if (mode === 'loading') await new Promise((r) => setTimeout(r, 1500));
  if (mode === 'denied') {
    status = 403;
    result = { message: 'Requiere sesión Google administrativa individual.' };
  } else if (mode === 'error') {
    status = 503;
    result = { message: 'Servicio temporalmente no disponible.' };
  } else if (path.includes('/operations/') && !body) {
    const r = receipts.get(path.split('/').at(-1)!);
    result = r ?? { message: 'Recibo inexistente.' };
    if (!r) status = 404;
  } else if (path.endsWith('/operations')) {
    if (receipts.has(body.operationId)) result = receipts.get(body.operationId)!.result;
    else if (mode === 'conflict' || body.expectedRevision !== data.revision) {
      status = 409;
      result = { message: 'Revisión educativa obsoleta.' };
    } else {
      data.revision++;
      const right = data.rights.find((r) => r.id === body.rightId);
      if (body.kind === 'digital') {
        const last = Math.max(
          now,
          ...data.rights
            .filter((r) => r.activityId === body.activityId && !r.revokedAt)
            .map((r) => r.endsAt),
        );
        const end = new Date(last);
        end.setUTCMonth(end.getUTCMonth() + 3);
        const prior = data.rights.filter(
          (r) => r.activityId === body.activityId && r.revokedAt === null,
        );
        result = {
          revision: data.revision,
          action: prior.length ? 'renewal' : 'grant',
          previousEnd: prior.length ? Math.max(...prior.map((r) => r.endsAt)) : null,
          rightId: body.operationId,
          startsAt: last,
          endsAt: end.getTime(),
        };
        data.rights.unshift({
          id: body.operationId,
          activityId: body.activityId,
          activity: data.activities.find((a) => a.id === body.activityId)!.name,
          startsAt: last,
          endsAt: end.getTime(),
          revokedAt: null,
          status: last > now ? 'scheduled' : 'active',
        });
      } else if (body.kind === 'link') {
        const candidate = candidates.find((c) => c.userId === body.userId)!;
        data.participantLink = {
          userId: body.userId,
          displayName: candidate.displayName,
          status: 'disabled',
          enabled: body.enabled ? 1 : 0,
        };
        result = { revision: data.revision, action: 'link', administrativeOnly: true };
      } else if (body.kind === 'presential') {
        let source = data.presential.find((p) => p.activityId === body.activityId);
        if (!source) {
          source = {
            activityId: body.activityId,
            activity: data.activities.find((a) => a.id === body.activityId)!.name,
            enabled: 0,
          };
          data.presential.push(source);
        }
        source.enabled = body.enabled ? 1 : 0;
        result = { revision: data.revision, action: 'presential', enabled: body.enabled };
      } else {
        if (right) {
          right.revokedAt = now;
          right.status = 'revoked';
        }
        result = {
          revision: data.revision,
          action: 'revoke',
          rightId: body.rightId,
          revokedAt: now,
        };
      }
      const receipt = {
        operationId: body.operationId,
        actorId: '00000000-0000-4000-8000-000000000099',
        actorName: 'Administración sintética',
        createdAt: now,
        kind: body.kind,
        reason: body.reason,
        activityId: body.activityId,
        rightId: body.rightId,
        userId: body.userId,
        verificationReference: body.verificationReference,
        paymentDeclared: body.kind === 'digital',
        accountedPayment: false as const,
        result: result as EducationReceipt['result'],
      };
      receipts.set(body.operationId, receipt);
      history.unshift(receipt);
      if (mode === 'lost-response' && !lost) {
        lost = true;
        throw Error('Respuesta perdida después de confirmar (simulación)');
      }
    }
  } else if (path.endsWith('/preview')) {
    const ends = data.rights
      .filter((r) => r.activityId === body.activityId && r.revokedAt === null)
      .map((r) => r.endsAt);
    const previousEnd = ends.length ? Math.max(...ends) : null,
      startsAt = Math.max(now, previousEnd ?? 0);
    const end = new Date(startsAt);
    end.setUTCMonth(end.getUTCMonth() + 3);
    const endsAt = end.getTime();
    result = {
      revision: data.revision,
      person: data.person,
      activity: data.activities.find((a) => a.id === body.activityId),
      previousEnd,
      startsAt,
      endsAt,
      expectedWindow: { startDate: commercialDate(startsAt), endDate: commercialDate(endsAt) },
    };
  } else if (path.includes('/history')) result = { rows: history, page: 1, hasMore: false };
  else if (path.includes('/identities?q=')) result = mode === 'empty' ? [] : candidates;
  else if (path.includes('/people?q=')) result = mode === 'empty' ? [] : [data.person];
  else result = data;
  return new Response(JSON.stringify(result), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <main style={{ padding: 16 }}>
        <p>QA sintética · Solo datos en memoria</p>
        <label>
          Escenario QA{' '}
          <select
            onChange={(e) => {
              mode = e.target.value;
              lost = false;
            }}
          >
            <option value="normal">Normal</option>
            <option value="empty">Vacío</option>
            <option value="loading">Carga lenta</option>
            <option value="denied">Sin autorización</option>
            <option value="error">Error 503</option>
            <option value="conflict">Conflicto 409</option>
            <option value="lost-response">Respuesta perdida tras confirmar</option>
          </select>
        </label>
        <EducationAccess />
        <h2>QA del control integrado en Inscriptos Período</h2>
        <EducationPresential
          personId={1}
          enrollments={[{ id: 7, activity_id: 1, activity: 'Yoga' }]}
        />
      </main>
    </MemoryRouter>
  </QueryClientProvider>,
);
