import { Logout } from './Auth';
import { FacilitatorPayments } from './FacilitatorPayments';
import { FormsImport } from './FormsImport';
import { PeriodForm } from './Periods';
import { useEffect, useState, createContext, useContext } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Database,
  Wallet,
  Coins,
  Receipt,
  Settings,
  PanelLeftClose,
  Plus,
} from 'lucide-react';
import { api } from './api';
import { ErrorBox, Loading, Empty } from './components';
import { formatMoney } from '../shared/domain';
import { People, PersonDetail } from './People';
import { Monthly, Agenda, Payments, Advertising, Configuration } from './Management';
import { ImportPeople } from './ImportPeople';
export const PeriodContext = createContext<{ period: number; periods: any[] }>({
  period: 0,
  periods: [],
});
export const usePeriod = () => useContext(PeriodContext);
export const periodName = (p: any) =>
  p
    ? `${new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date(p.year, p.month - 1, 15))} ${p.year}`
    : '';
const nav = [
  ['/', 'Dashboard', LayoutDashboard],
  ['/personas', 'BBDD Personas', Database],
  ['/gestion', 'Inscriptos Período', Users],
  ['/agenda', 'Agenda Período', CalendarDays],
  ['/pagos', 'Cobros Período', Wallet],
  ['/pago-facilitadores', 'Pago facilitadores', Coins],
  ['/publicidad', 'Gastos Período', Receipt],
  ['/configuracion', 'Configuración', Settings],
] as const;
export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [period, setPeriod] = useState(0);
  const [create, setCreate] = useState(false);
  const [toast, setToast] = useState('');
  const q = useQuery({ queryKey: ['periods'], queryFn: () => api<any[]>('/periods') });
  useEffect(() => {
    if (!q.isFetching && q.data && !q.data.some((p) => p.id === period)) setPeriod(q.data[0]?.id || 0);
  }, [q.data, q.isFetching, period]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const listener = (e: Event) => {
      setToast((e as CustomEvent).detail);
      clearTimeout(t);
      t = setTimeout(() => setToast(''), 3500);
    };
    window.addEventListener('toast', listener);
    return () => {
      clearTimeout(t);
      window.removeEventListener('toast', listener);
    };
  }, []);
  return (
    <PeriodContext.Provider value={{ period, periods: q.data || [] }}>
      <div className={`app ${collapsed ? 'collapsed' : ''}`}>
        <aside>
          <div className="brand">
            <img className="brand-logo" src="/branding/logo_prisma.svg" alt="PRISMA" />
            <div>
              <b>PRISMA</b>
              <small>Gestión del espacio</small>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Colapsar o expandir menú"
          >
            <PanelLeftClose size={18} />
          </button>
          <nav>
            {nav.map(([path, label, Icon]) => (
              <NavLink key={path} to={path} end={path === '/'} title={label}>
                <Icon size={19} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className="dot" /> Espacio de administración<small>Jesica y Hernán</small>
          </div>
        </aside>
        <div className="workspace">
          <header>
            <div className="breadcrumb">
              PRISMA <span>/</span> Administración
            </div>
            <div className="period-control">
              <Logout />
              <label>
                Período
                <select
                  aria-label="Período activo"
                  value={period}
                  onChange={(e) => setPeriod(Number(e.target.value))}
                >
                  <option value={0} disabled>
                    Seleccionar período
                  </option>
                  {q.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {periodName(p)}
                      {p.status === 'closed' ? ' · Cerrado' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="icon"
                title="Crear nuevo período"
                aria-label="Crear nuevo período"
                onClick={() => setCreate(true)}
              >
                <Plus size={19} />
              </button>
            </div>
          </header>
          <main>
            <ErrorBox error={q.error} />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/personas" element={<People />} />
              <Route path="/personas/:id" element={<PersonDetail />} />
              <Route path="/importar-forms" element={<FormsImport />} />
              <Route path="/importar" element={<ImportPeople />} />
              <Route path="/gestion" element={<Monthly />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/pagos" element={<Payments />} />
              <Route path="/pago-facilitadores" element={<FacilitatorPayments />} />
              <Route path="/publicidad" element={<Advertising />} />
              <Route path="/configuracion" element={<Configuration />} />
              <Route path="*" element={<Empty>Página no encontrada.</Empty>} />
            </Routes>
          </main>
          <footer>
            PRISMA CRM <span>America/Argentina/Cordoba · ARS</span>
          </footer>
        </div>
      </div>
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
      {create && <PeriodForm close={() => setCreate(false)} onCreated={setPeriod} />}
    </PeriodContext.Provider>
  );
}
function Dashboard() {
  const { period, periods } = usePeriod();
  const q = useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => api(`/dashboard?period_id=${period}`),
    enabled: !!period,
  });
  if (!period) return <Empty>Creá un período con el botón + para comenzar.</Empty>;
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RESUMEN DEL ESPACIO</span>
          <h1>Dashboard</h1>
          <p>Una mirada a {periodName(periods.find((p) => p.id === period))}.</p>
        </div>
        <NavLink className="button primary" to="/gestion">
          <Plus size={17} /> Nueva inscripción
        </NavLink>
      </div>
      <div className="stats">
        {[
          ['Personas inscriptas', d.people],
          ['Inscripciones', d.enrollments],
          ['Total a cobrar', formatMoney(d.due)],
          ['Total cobrado', formatMoney(d.paid)],
        ].map(([label, value]) => (
          <article className="stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Período seleccionado</small>
          </article>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>Inscripciones por actividad</h2>
            <span className="chip">{d.activities.length} actividades</span>
          </div>
          {d.activities.map((a: any) => (
            <div className="activity-count" key={a.name}>
              <div>
                <span>{a.name}</span>
                <b>{a.count}</b>
              </div>
              <div className="track">
                <i
                  style={{
                    width: `${Math.max(0, (a.count / Math.max(1, ...d.activities.map((x: any) => x.count))) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </section>
        <div className="stack">
          <section className="panel">
            <h2>Carteras del mes</h2>
            <div className="wallet">
              <span className="wallet-icon">
                <Wallet size={21} />
              </span>
              <div>
                <b>Cartera Hernán</b>
                <small>Transferencias</small>
              </div>
              <strong>{formatMoney(d.transfer)}</strong>
            </div>
            <div className="wallet">
              <span className="wallet-icon">
                <Wallet size={21} />
              </span>
              <div>
                <b>Cartera Jesica</b>
                <small>Efectivo</small>
              </div>
              <strong>{formatMoney(d.cash)}</strong>
            </div>
          </section>
          <section className="panel balance-panel">
            <span className="eyebrow">SALDOS DEL MES</span>
            <h2>{formatMoney(d.pending)}</h2>
            <p>Pendiente de cobro</p>
            <small>Saldo a favor: {formatMoney(d.credit)}</small>
            {Number(d.undefined_accounts) > 0 && (
              <p className="info">
                {d.undefined_accounts} cuentas con importe a cobrar no definido.
              </p>
            )}
            <NavLink to="/pagos">Ver cuentas y movimientos →</NavLink>
          </section>
        </div>
      </div>
    </>
  );
}
