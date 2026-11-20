import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { PortalView } from './PortalView';
import { usePortalAuth } from './usePortalAuth';
import './portal.css';
function Portal() {
  return <PortalView {...usePortalAuth()} />;
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="portal-card">
        <h1>No pudimos mostrar tu acceso</h1>
        <p>Volvé a cargar la página para comprobar tu sesión.</p>
        <button onClick={() => location.reload()}>Volver a cargar</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <Boundary>
    <Portal />
  </Boundary>,
);
