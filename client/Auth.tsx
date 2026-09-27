import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { Field, ErrorBox, Loading } from './components';
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['auth'],
    queryFn: () => api('/auth/session'),
    retry: false,
    staleTime: 30000,
  });
  const [password, setPassword] = useState('');
  const m = useMutation({
    mutationFn: () => api('/auth/login', 'POST', { password }),
    onSuccess: () => {
      setPassword('');
      qc.clear();
      navigate('/', { replace: true });
    },
    onError: () => setPassword(''),
  });
  useEffect(() => {
    const expired = () => {
      qc.clear();
      navigate('/login', { replace: true });
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [qc, navigate]);
  useEffect(() => {
    if (q.data && !q.data.authenticated) navigate('/login', { replace: true });
  }, [q.data, navigate]);
  if (q.isPending) return <Loading />;
  if (q.data?.authenticated) return children;
  return (
    <main className="login-page">
      <section className="panel login-card">
        <img className="login-logo" src="/branding/logo_prisma.svg" alt="PRISMA" />
        <h1>Acceso administrativo</h1>
        <p>PRISMA CRM</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
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
          <ErrorBox error={q.error || m.error} />
          {q.data?.configured === false && (
            <p className="warning">
              El acceso todavía no está configurado. Ejecutá npm run auth:configure en la terminal
              local y reiniciá el servidor.
            </p>
          )}
          <button className="primary" disabled={!q.data?.configured || m.isPending}>
            {m.isPending ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </main>
  );
}
export function Logout() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const m = useMutation({
    mutationFn: () => api('/auth/logout', 'POST', {}),
    onSuccess: () => {
      qc.clear();
      navigate('/login', { replace: true });
    },
  });
  return (
    <div>
      <button className="subtle" disabled={m.isPending} onClick={() => m.mutate()}>
        Cerrar sesión
      </button>
      <ErrorBox error={m.error} />
    </div>
  );
}
