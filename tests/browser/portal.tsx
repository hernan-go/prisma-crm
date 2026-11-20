// Development fixture only. Never imports the HTTP client, never makes API calls.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PortalView } from '../../client/portal/PortalView';
import type { PortalState } from '../../client/portal/contracts';
import '../../client/portal/portal.css';
function Preview() {
  const [state, setState] = useState<PortalState>({
    kind: 'anonymous',
    csrf: 'synthetic-preview-only',
  });
  const [notice, setNotice] = useState('');
  const states: PortalState[] = [
    { kind: 'anonymous', csrf: 'synthetic-preview-only' },
    { kind: 'loading' },
    {
      kind: 'authenticated',
      identity: { displayName: 'Ana Ejemplo', context: 'facilitator' },
      expiresAt: Date.now() + 60000,
    },
    ...(
      ['expired', 'attempt', 'conflict', 'unavailable', 'denied', 'error', 'rateLimited'] as const
    ).map((kind) => ({ kind })),
  ];
  return (
    <>
      <aside
        style={{ padding: '16px', borderBottom: '2px solid #79540c', background: '#fff7df' }}
        aria-label="Controles de previsualización"
      >
        <strong>Previsualización sintética · Sin autenticación real</strong>
        <p>Datos ficticios. No se consulta el backend ni se conceden permisos.</p>
        <label>
          Escenario{' '}
          <select
            style={{ font: 'inherit', padding: 10, maxWidth: '100%' }}
            value={state.kind}
            onChange={(e) => {
              setNotice('');
              setState(states.find((s) => s.kind === e.target.value)!);
            }}
          >
            {states.map((s) => (
              <option key={s.kind} value={s.kind}>
                {
                  {
                    anonymous: 'Sin sesión',
                    loading: 'Cargando',
                    authenticated: 'Sesión válida',
                    expired: 'Sesión vencida',
                    attempt: 'Error de ingreso',
                    conflict: 'Conflicto entre cuentas',
                    unavailable: 'Portal desactivado',
                    denied: 'Acceso no autorizado',
                    error: 'Error de conexión',
                    rateLimited: 'Límite de intentos',
                  }[s.kind]
                }
              </option>
            ))}
          </select>
        </label>
      </aside>
      <PortalView
        state={state}
        busy={false}
        notice={notice}
        onLogin={() => setNotice('Este botón es una demostración. No se inició Google.')}
        onLogout={() => {
          setState(states[0]);
          setNotice('Cierre simulado. No se modificó ninguna sesión real.');
        }}
        onRetry={() => setState(states[0])}
      />
    </>
  );
}
if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />);
