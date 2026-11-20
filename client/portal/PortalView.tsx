import type { PortalState } from './contracts';
const notices = {
  expired: [
    'Tu sesión venció',
    'Cerrá la sesión anterior y volvé a ingresar con tu cuenta autorizada.',
  ],
  conflict: [
    'Hay un conflicto entre cuentas',
    'La cuenta abierta en administración no coincide con este acceso. Cerrá la sesión correspondiente antes de cambiar de cuenta.',
  ],
  unavailable: [
    'El portal no está disponible',
    'No pudimos habilitar el ingreso en este momento. Podés volver a comprobar más tarde.',
  ],
  denied: [
    'Esta cuenta no tiene acceso habilitado',
    'Consultá con PRISMA cuál es tu cuenta autorizada para ingresar.',
  ],
  attempt: [
    'No se pudo completar el ingreso',
    'El intento pudo haber vencido o sido cancelado. Cerrá la sesión anterior para volver a comenzar.',
  ],
  rateLimited: [
    'Esperá un momento',
    'Se realizaron varios intentos. Volvé a comprobar dentro de unos minutos.',
  ],
  error: [
    'No pudimos comprobar tu sesión',
    'Revisá tu conexión y volvé a intentar. Si estabas cerrando sesión, el cierre todavía no está confirmado.',
  ],
} as const;
export function PortalView({
  state,
  busy,
  onLogin,
  onLogout,
  onRetry,
  notice,
}: {
  state: PortalState;
  busy: boolean;
  onLogin(): void;
  onLogout(): void;
  onRetry(): void;
  notice?: string;
}) {
  const authenticated = state.kind === 'authenticated';
  const anonymous = state.kind === 'anonymous';
  const loading = state.kind === 'loading';
  const problem =
    !authenticated && !anonymous && !loading
      ? notices[state.kind as keyof typeof notices]
      : undefined;
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <a href="/app/" aria-label="PRISMA, inicio" className="portal-brand">
          PRISMA<span>Espacio de encuentro y aprendizaje</span>
        </a>
      </header>
      <main id="contenido" className="portal-main" aria-busy={busy || loading}>
        <section className="portal-card" aria-labelledby="portal-title">
          <p className="portal-eyebrow">Portal PRISMA</p>
          <h1 id="portal-title">
            {authenticated
              ? `Hola, ${state.identity.displayName}`
              : problem
                ? problem[0]
                : 'Te damos la bienvenida'}
          </h1>
          {loading ? (
            <p role="status">Comprobando tu sesión…</p>
          ) : authenticated ? (
            <>
              <p>Tu sesión está iniciada.</p>
              <dl className="portal-details">
                <div>
                  <dt>Tu acceso</dt>
                  <dd>Facilitador</dd>
                </div>
                <div>
                  <dt>Estado de sesión</dt>
                  <dd>Activa</dd>
                </div>
              </dl>
              <p className="portal-note">
                Este espacio está en preparación. Por ahora podés comprobar tu acceso y cerrar
                sesión.
              </p>
            </>
          ) : anonymous ? (
            <>
              <p>Ingresá con tu cuenta de Google autorizada para acceder a tu espacio.</p>
              <p className="portal-availability" role="status">
                Servicio disponible
              </p>
            </>
          ) : (
            <p role="alert">{problem?.[1]}</p>
          )}
          {notice && (
            <p role="status" className="portal-notice">
              {notice}
            </p>
          )}
          <div className="portal-actions">
            {anonymous && (
              <button className="portal-primary" disabled={busy} onClick={onLogin}>
                Ingresar con Google
              </button>
            )}
            {!loading && !anonymous && !authenticated && (
              <button className="portal-primary" disabled={busy} onClick={onRetry}>
                Volver a comprobar
              </button>
            )}
            {!loading && !anonymous && (
              <button
                className={authenticated ? 'portal-primary' : 'portal-secondary'}
                disabled={busy}
                onClick={onLogout}
              >
                Cerrar sesión
              </button>
            )}
          </div>
          {busy && <p role="status">Un momento, estamos procesando tu solicitud…</p>}
          <p className="portal-help">
            ¿Necesitás ayuda con tu acceso? Consultá con el equipo de PRISMA.
          </p>
        </section>
      </main>
      <footer className="portal-footer">Un espacio para seguir aprendiendo.</footer>
    </div>
  );
}
