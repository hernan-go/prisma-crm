import type { EducationPerson, EducationReceipt, EducationSnapshot } from '../shared/education';

const date = (value: number | null | undefined, time = false) =>
  value == null
    ? 'No registrado'
    : Number.isFinite(value)
      ? new Intl.DateTimeFormat('es-AR', {
          dateStyle: 'medium',
          ...(time ? { timeStyle: 'short' as const } : {}),
          timeZone: 'Etc/GMT+3',
        }).format(value)
      : 'Fecha desconocida';

const exactDate = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return null;
  const local = new Date(value - 3 * 60 * 60 * 1000);
  return Number.isNaN(local.getTime()) ? null : local.toISOString().replace('Z', '-03:00');
};

export function EducationReceiptView({
  receipt: o,
  person,
  snapshot,
}: {
  receipt: EducationReceipt;
  person?: EducationPerson;
  snapshot?: EducationSnapshot;
}) {
  const action = o.result?.action;
  const kind = action === 'grant' || action === 'renewal' ? action : o.kind;
  const title: Record<string, string> = {
    grant: 'Concesión trimestral',
    renewal: 'Renovación trimestral',
    digital: 'Acceso digital trimestral registrado',
    revoke: 'Revocación de acceso digital',
    presential: 'Habilitación presencial educativa',
    link: 'Vinculación administrativa',
  };
  const activity =
    snapshot?.activities.find((a) => a.id === o.activityId)?.name ??
    snapshot?.rights.find((r) => r.id === o.rightId)?.activity;
  const digital = kind === 'grant' || kind === 'renewal' || kind === 'digital';
  const revoked = kind === 'revoke';
  const presential = kind === 'presential';
  const link = kind === 'link';
  const enabled =
    'enabled' in o.result && typeof o.result.enabled === 'boolean' ? o.result.enabled : undefined;
  const previousEnabled = 'previousEnabled' in o.result ? o.result.previousEnabled : undefined;
  const heading = link
    ? enabled === false
      ? 'Deshabilitación del vínculo'
      : enabled === true && previousEnabled === null
        ? 'Vinculación administrativa inicial'
        : enabled === true && previousEnabled === false
          ? 'Rehabilitación del vínculo'
          : 'Estado del vínculo administrativo'
    : presential && enabled === false
      ? 'Retiro de habilitación presencial educativa'
      : (title[kind] ?? 'Operación administrativa registrada');
  return (
    <article className="education-right education-receipt">
      <h3>{heading}</h3>
      <p>
        <b>Persona:</b>{' '}
        {person
          ? `${person.apellido}, ${person.nombre} · ${person.public_id}`
          : 'Datos de persona no disponibles'}
      </p>
      <p>
        <b>Fecha y hora:</b> {date(o.createdAt, true)} (UTC−03)
      </p>
      <p>
        <b>Administrador:</b> {o.actorName || 'Nombre no disponible'}
      </p>
      {(digital || revoked || presential) && (
        <p>
          <b>Disciplina:</b> {activity ?? 'No disponible en el catálogo actual'}
        </p>
      )}
      {digital && (
        <>
          <p>
            <b>Resultado:</b>{' '}
            {kind === 'renewal'
              ? 'Acceso digital renovado.'
              : kind === 'grant'
                ? 'Acceso digital concedido.'
                : 'Acceso digital registrado.'}
          </p>
          <p>
            <b>Inicio:</b> {date(o.result.startsAt, true)} (UTC−03)
          </p>
          <p>
            <b>Fin excluido:</b> {date(o.result.endsAt, true)} (UTC−03)
          </p>
          {o.result.previousEnd !== undefined && (
            <p>
              <b>Fin anterior:</b>{' '}
              {o.result.previousEnd === null
                ? 'Sin vigencia previa'
                : date(o.result.previousEnd, true)}
            </p>
          )}
          {o.paymentDeclared && (
            <p>
              Pago verificado manualmente. Este recibo de habilitación no es comprobante de cobro ni
              registro contable.
            </p>
          )}
          {o.verificationReference && (
            <p>
              <b>Referencia administrativa:</b> {o.verificationReference}
            </p>
          )}
        </>
      )}
      {revoked && (
        <p>
          <b>Resultado:</b> Derecho revocado
          {o.result.revokedAt !== undefined
            ? ' el ' + date(o.result.revokedAt, true) + ' (UTC−03)'
            : ''}
          .
        </p>
      )}
      {presential && (
        <p>
          <b>Resultado:</b>{' '}
          {enabled === true
            ? 'Habilitado'
            : enabled === false
              ? 'Deshabilitado'
              : 'Estado no informado'}
        </p>
      )}
      {link && (
        <p>
          <b>Resultado:</b>{' '}
          {enabled === true
            ? 'Vínculo habilitado.'
            : enabled === false
              ? 'Vínculo deshabilitado.'
              : 'Estado del vínculo no informado.'}
        </p>
      )}
      {o.reason && (
        <p>
          <b>Motivo:</b> {o.reason}
        </p>
      )}
      <p>
        <b>Revisión:</b>{' '}
        {Number.isSafeInteger(o.result?.revision) ? o.result.revision : 'No informada'}
      </p>
      <details>
        <summary>Datos de auditoría y recuperación</summary>
        {digital && exactDate(o.result.startsAt) && (
          <p>
            <b>Inicio exacto:</b> <code>{exactDate(o.result.startsAt)}</code>
          </p>
        )}
        {digital && exactDate(o.result.endsAt) && (
          <p>
            <b>Fin excluido exacto:</b> <code>{exactDate(o.result.endsAt)}</code>
          </p>
        )}
        {digital && exactDate(o.result.previousEnd) && (
          <p>
            <b>Fin anterior exacto:</b> <code>{exactDate(o.result.previousEnd)}</code>
          </p>
        )}
        {revoked && exactDate(o.result.revokedAt) && (
          <p>
            <b>Revocación exacta:</b> <code>{exactDate(o.result.revokedAt)}</code>
          </p>
        )}
        <p>
          <b>Identificador de operación / recibo:</b> <code>{o.operationId}</code>
        </p>
        {o.result.rightId && (
          <p>
            <b>Identificador del derecho:</b> <code>{o.result.rightId}</code>
          </p>
        )}
        {o.userId && (
          <p>
            <b>Identificador de identidad:</b> <code>{o.userId}</code>
          </p>
        )}
        <p>
          <b>Identificador del administrador:</b> <code>{o.actorId}</code>
        </p>
      </details>
    </article>
  );
}
