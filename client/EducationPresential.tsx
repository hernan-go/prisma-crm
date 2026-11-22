import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AuthSession } from './api';
import { ErrorBox } from './components';
import { AccessConfirmation } from './EducationConfirmation';
import type { EducationSnapshot } from '../shared/education';
export function EducationPresential({
  personId,
  enrollments,
}: {
  personId: number;
  enrollments: { id: number; activity_id: number; activity: string }[];
}) {
  const auth = useQuery({
    queryKey: ['auth'],
    queryFn: () => api<AuthSession>('/auth/session'),
    staleTime: 30000,
    retry: false,
  });
  const allowed = auth.data?.method === 'identity' && auth.data.identity?.roles.includes('admin');
  const snapshot = useQuery({
    queryKey: ['/education-access', personId],
    queryFn: () => api<EducationSnapshot>(`/education-access/people/${personId}`),
    enabled: !!allowed,
    retry: false,
  });
  const [operation, setOperation] = useState<{
    activityId: number;
    activity: string;
    enrollmentId?: number;
    enabled: boolean;
  }>();
  const [success, setSuccess] = useState(false);
  const client = useQueryClient();
  const data = snapshot.error ? undefined : snapshot.data;
  const activities = new Map(
    enrollments.map((e) => [
      e.activity_id,
      { activityId: e.activity_id, activity: e.activity, enrollmentId: e.id },
    ]),
  );
  for (const p of data?.presential ?? [])
    if (p.enabled && !activities.has(p.activityId))
      activities.set(p.activityId, {
        activityId: p.activityId,
        activity: p.activity,
        enrollmentId: 0,
      });
  return (
    <section className="panel education-access">
      <h2>Habilitación educativa presencial</h2>
      <p>
        Se administra desde las inscripciones reales. Habilitar o retirar esta fuente requiere una
        acción explícita; editar/cancelar la inscripción mensual, cambiar de mes o una deuda no la
        retira automáticamente. El derecho digital permanece independiente.
      </p>
      {!allowed && <p>Requiere sesión Google administrativa individual.</p>}
      <ErrorBox error={snapshot.error || auth.error} />
      {snapshot.isFetching && <p role="status">Consultando habilitación educativa…</p>}
      {snapshot.error && (
        <button onClick={() => void snapshot.refetch()}>Reintentar consulta educativa</button>
      )}
      {allowed && data && (
        <>
          <p>
            {data.person.apellido}, {data.person.nombre} · {data.person.public_id} · #{personId}.
            Estos cambios educativos no escriben datos del período.
          </p>
          {[...activities.values()].map((a) => {
            const enabled = !!data.presential.find((p) => p.activityId === a.activityId)?.enabled;
            return (
              <article className="education-right" key={a.activityId}>
                <h3>
                  {a.activity} · {enabled ? 'Fuente habilitada' : 'Fuente no habilitada'}
                </h3>
                <p>
                  {a.enrollmentId
                    ? `Inscripción real #${a.enrollmentId}`
                    : 'Continuidad educativa conservada; sin inscripción en el período seleccionado.'}
                </p>
                <button
                  disabled={!enabled && (!data.person.activo || !a.enrollmentId)}
                  onClick={() =>
                    setOperation({
                      ...a,
                      enrollmentId: a.enrollmentId || undefined,
                      enabled: !enabled,
                    })
                  }
                >
                  {enabled ? 'Retirar habilitación educativa' : 'Revisar habilitación educativa'}
                </button>
              </article>
            );
          })}
          {!activities.size && (
            <p>Agregá una inscripción real antes de habilitar una disciplina.</p>
          )}
        </>
      )}
      {success && !snapshot.error && !auth.error && (
        <p role="status">
          Última operación educativa confirmada. Inscripción y derechos digitales conservados.
        </p>
      )}
      {operation && data && (
        <AccessConfirmation
          title="Confirmar fuente presencial"
          command={{
            kind: 'presential',
            personId,
            activityId: operation.activityId,
            enrollmentId: operation.enrollmentId,
            enabled: operation.enabled,
            expectedRevision: data.revision,
          }}
          close={() => setOperation(undefined)}
          done={() => {
            setOperation(undefined);
            setSuccess(true);
            void client.invalidateQueries({ queryKey: ['/education-access'] });
          }}
        >
          <p>
            Persona: {data.person.apellido}, {data.person.nombre} · #{personId}
          </p>
          <p>
            Disciplina: {operation.activity} · #{operation.activityId}
          </p>
          <p>
            {operation.enabled
              ? `Habilitar la fuente educativa desde la inscripción #${operation.enrollmentId}.`
              : 'Retirar únicamente la fuente presencial educativa de esta disciplina.'}{' '}
            Se conservan inscripción, turnos, cuenta mensual y derechos digitales. La continuidad se
            mantiene hasta su retiro explícito.
          </p>
        </AccessConfirmation>
      )}
    </section>
  );
}
