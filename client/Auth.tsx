import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, type AuthSession } from './api';
import { Field, ErrorBox, Loading } from './components';

const authQuery = {
  queryKey: ['auth'],
  queryFn: () => api<AuthSession>('/auth/session'),
  retry: false,
  staleTime: 30000,
};
async function resetAuth(qc: QueryClient) {
  await qc.cancelQueries();
  qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  window.dispatchEvent(new Event('auth-reset'));
  await qc.resetQueries({ queryKey: ['auth'], exact: true });
}
function authMessage(status: number) {
  if (status === 401)
    return 'Tu sesión venció o fue revocada. Cerrá la sesión antes de volver a ingresar.';
  if (status === 409)
    return 'Hay un conflicto entre métodos de acceso. Cerrá la sesión antes de elegir cómo ingresar.';
  return 'El servicio de acceso no está disponible. Podés reintentar la verificación o cerrar la sesión.';
}
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery(authQuery);
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<number | null>(null);
  const m = useMutation({
    mutationFn: () => api('/auth/login', 'POST', { password }),
    onSuccess: async () => {
      setPassword('');
      await resetAuth(qc);
      navigate('/', { replace: true });
    },
    onError: (error) => {
      setPassword('');
      if (error instanceof ApiError && [409, 503].includes(error.status)) setFailure(error.status);
    },
  });
  useEffect(() => {
    const expired = () => {
      setFailure(401);
      setPassword('');
      void qc.cancelQueries();
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      navigate('/login', { replace: true });
    };
    const reset = () => {
      setFailure(null);
      setPassword('');
    };
    const check = () => {
      void q.refetch().then((result) => {
        if (result.error) setFailure(result.error instanceof ApiError ? result.error.status : 503);
      });
    };
    window.addEventListener('session-expired', expired);
    window.addEventListener('session-check', check);
    window.addEventListener('auth-reset', reset);
    return () => {
      window.removeEventListener('session-expired', expired);
      window.removeEventListener('session-check', check);
      window.removeEventListener('auth-reset', reset);
    };
  }, [qc, navigate, q.refetch]);
  useEffect(() => {
    if (q.data && !q.data.authenticated) navigate('/login', { replace: true });
  }, [q.data, navigate]);
  const blocked =
    failure ??
    (q.error
      ? q.error instanceof ApiError
        ? q.error.status
        : 503
      : q.data?.status === 'invalid'
        ? 401
        : q.data?.status === 'conflict'
          ? 409
          : q.data?.status === 'unavailable'
            ? 503
            : null);
  if (q.isPending && !blocked) return <Loading />;
  if (!blocked && q.data?.authenticated) return children;
  const google = q.data?.googleLogin;
  const googleAvailable = google?.available && !!google.csrf;
  const legacyAvailable = q.data?.legacy?.available ?? q.data?.configured;
  return (
    <main className="login-page">
      <section className="panel login-card">
        <div className="brand login-brand">
          <img className="brand-logo" src="/branding/logo_prisma.svg" alt="PRISMA" />
          <div>
            <b>PRISMA</b>
            <small>Gestión del espacio</small>
          </div>
        </div>
        <h1>Acceso administrativo</h1>
        {blocked ? (
          <div className="auth-options">
            <p role="alert">{authMessage(blocked)}</p>
            <button
              type="button"
              disabled={q.isFetching}
              onClick={async () => {
                const result = await q.refetch();
                if (!result.error) setFailure(null);
              }}
            >
              Volver a verificar
            </button>
            <Logout />
          </div>
        ) : (
          <>
            {googleAvailable && (
              <form className="google-login" method="post" action="/api/auth/google/login/start">
                <input type="hidden" name="csrf" value={google.csrf} />
                <button className="primary" type="submit" disabled={m.isPending}>
                  Ingresar con Google
                </button>
              </form>
            )}
            {google && !googleAvailable && (
              <p role="status">El ingreso con Google no está disponible en este momento.</p>
            )}
            {legacyAvailable ? (
              <form
                className="legacy-login"
                onSubmit={(e) => {
                  e.preventDefault();
                  m.mutate();
                }}
              >
                <h2>Acceso compartido temporal</h2>
                <p>Usá la contraseña compartida solo durante la transición.</p>
                <Field label="Contraseña">
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={1024}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <ErrorBox error={m.error} />
                <button className="primary" disabled={!legacyAvailable || m.isPending}>
                  {m.isPending ? 'Ingresando…' : 'Ingresar con contraseña'}
                </button>
              </form>
            ) : (
              !googleAvailable && (
                <p role="status">
                  El acceso administrativo no está disponible. Contactá a la administración.
                </p>
              )
            )}
          </>
        )}
      </section>
    </main>
  );
}
export function Logout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const session = useQuery(authQuery);
  const m = useMutation({
    mutationFn: () => api('/auth/logout', 'POST', {}),
    onSuccess: async () => {
      await resetAuth(qc);
      navigate('/login', { replace: true });
    },
  });
  return (
    <div className="auth-session">
      {session.data?.authenticated &&
        session.data.method === 'identity' &&
        session.data.identity?.displayName && (
          <p className="session-name">{session.data.identity.displayName}</p>
        )}
      <button className="subtle" disabled={m.isPending} onClick={() => m.mutate()}>
        Cerrar sesión
      </button>
      {m.error && (
        <p role="alert">
          No se pudo cerrar la sesión. Reintentá; el cierre todavía no está confirmado.
        </p>
      )}
    </div>
  );
}
