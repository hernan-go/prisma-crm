import { useCallback, useEffect, useRef, useState } from 'react';
import { portalClient, PortalError } from './http';
import type { PortalState } from './contracts';
export function portalFailure(error: unknown): PortalState {
  const status = error instanceof PortalError ? error.status : 0;
  return {
    kind:
      (
        {
          400: 'attempt',
          401: 'expired',
          403: 'denied',
          409: 'conflict',
          429: 'rateLimited',
          503: 'unavailable',
        } as const
      )[status as 400] ?? 'error',
  };
}
export function usePortalAuth() {
  const [state, setState] = useState<PortalState>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  const active = useRef(false);
  const mounted = useRef(true);
  const check = useCallback(async () => {
    if (active.current) return;
    const own = ++revision.current;
    setState({ kind: 'loading' });
    try {
      const session = await portalClient.session();
      if (!mounted.current || own !== revision.current) return;
      setState(
        session.authenticated
          ? session.expiresAt <= Date.now()
            ? { kind: 'expired' }
            : { kind: 'authenticated', identity: session.identity, expiresAt: session.expiresAt }
          : { kind: 'anonymous', csrf: session.csrf },
      );
    } catch (error) {
      if (mounted.current && own === revision.current) setState(portalFailure(error));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void check();
    const refresh = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      mounted.current = false;
      ++revision.current;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [check]);
  useEffect(() => {
    if (state.kind !== 'authenticated') return;
    const timer = window.setTimeout(
      () => {
        ++revision.current;
        setState({ kind: 'expired' });
      },
      Math.max(0, state.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [state]);
  async function action(kind: 'login' | 'logout') {
    if (active.current) return;
    active.current = true;
    ++revision.current;
    setBusy(true);
    setNotice('');
    let loggedOut = false;
    try {
      if (kind === 'login') {
        if (state.kind !== 'anonymous') return;
        location.assign(await portalClient.start(state.csrf));
      } else {
        // Hide prior identity immediately, but never claim a successful logout before persistence.
        setState({ kind: 'loading' });
        await portalClient.logout();
        loggedOut = true;
        setNotice('Cerraste tu sesión.');
      }
    } catch (error) {
      if (mounted.current) {
        setState(portalFailure(error));
        if (kind === 'logout')
          setNotice('No pudimos confirmar el cierre de sesión. Volvé a intentar.');
      }
    } finally {
      active.current = false;
      if (mounted.current) {
        setBusy(false);
        if (loggedOut) void check();
      }
    }
  }
  return {
    state,
    busy,
    notice,
    onLogin: () => void action('login'),
    onLogout: () => void action('logout'),
    onRetry: () => void check(),
  };
}
