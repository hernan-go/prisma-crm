import { Logout } from './Auth';
import { FacilitatorPayments } from './FacilitatorPayments';
import { FormsImport } from './FormsImport';
import { PeriodForm } from './Periods';
import { useEffect, useState, createContext, useContext } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
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
  BarChart3,
  Menu,
  X,
} from 'lucide-react';
import { api } from './api';
import { ErrorBox, Empty, PageTitle, useDisclosure } from './components';
import { Dashboard } from './Dashboard';
import { People, PersonDetail } from './People';
import { Monthly, Agenda, Payments, Configuration } from './Management';
import { Expenses } from './Expenses';
import { ImportPeople } from './ImportPeople';
import { Statistics } from './Statistics';
import './administrative.css';
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
  ['/pago-facilitadores', 'Pago Facilitadores', Coins],
  ['/publicidad', 'Gastos Período', Receipt],
  ['/estadisticas', 'Estadísticas', BarChart3],
  ['/configuracion', 'Configuración', Settings],
] as const;

const sectionDescriptions: Record<string, string> = {
  '/personas': 'Un registro por persona, toda su historia en un lugar.',
  '/gestion': 'Personas incorporadas explícitamente al período seleccionado.',
  '/agenda': 'Horarios y asistentes del período seleccionado.',
  '/pagos': 'Cuentas mensuales, movimientos y carteras.',
  '/pago-facilitadores': 'Importes manuales y movimientos por actividad del período seleccionado.',
  '/publicidad': 'Organizá los gastos del período por categorías.',
  '/configuracion': 'Catálogo global, facilitadores y oferta mensual independiente.',
  '/importar':
    'Seleccioná, revisá las columnas y confirmá cada registro. El archivo original se conserva.',
  '/importar-forms':
    'Preferí CSV. Revisá cada persona, sus inscripciones y la cuenta del período antes de confirmar.',
};

function PeriodSelector({
  period,
  periods,
  onChange,
  onCreate,
  compactClosed = false,
}: {
  period: number;
  periods: any[];
  onChange: (value: number) => void;
  onCreate?: () => void;
  compactClosed?: boolean;
}) {
  return (
    <>
      <label>
        Período
        <select
          aria-label="Período activo"
          value={period}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          <option value={0} disabled>
            Seleccionar período
          </option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {compactClosed && p.status === 'closed'
                ? `${new Intl.DateTimeFormat('es-AR', { month: 'short' }).format(new Date(p.year, p.month - 1, 15))} ${p.year}`
                : periodName(p)}
              {p.status === 'closed' ? ' · Cerrado' : ''}
            </option>
          ))}
        </select>
      </label>
      {onCreate && (
        <button
          className="icon"
          title="Crear nuevo período"
          aria-label="Crear nuevo período"
          onClick={onCreate}
        >
          <Plus size={19} />
        </button>
      )}
    </>
  );
}

function MobileHeader({
  pathname,
  selector,
  disclosure,
}: {
  pathname: string;
  selector: React.ReactNode;
  disclosure: ReturnType<typeof useDisclosure>;
}) {
  const { open, setOpen, root, trigger, id } = disclosure;
  const { period, periods } = usePeriod();
  const sectionPath = pathname.startsWith('/personas/') ? '/personas' : pathname;
  const title =
    nav.find(([path]) => path === sectionPath)?.[1] ||
    (pathname === '/importar'
      ? 'Importar personas'
      : pathname === '/importar-forms'
        ? 'Importar inscripciones desde Google Forms PRISMA'
        : 'Página no encontrada');
  const description =
    sectionPath === '/'
      ? `Una mirada a ${periodName(periods.find((p) => p.id === period)) || 'tu espacio'}.`
      : sectionDescriptions[sectionPath];
  return (
    <div
      className="mobile-header mobile-only"
      ref={root}
      onPointerDown={(e) => {
        if (open && !(e.target as HTMLElement).closest('.mobile-menu, .mobile-menu-toggle'))
          setOpen(false);
      }}
    >
      <div className="mobile-topbar">
        <div className="brand">
          <img className="brand-logo" src="/branding/logo_prisma.svg" alt="" />
          <b>PRISMA</b>
        </div>
        <button
          ref={trigger}
          type="button"
          className="icon mobile-menu-toggle"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={23} /> : <Menu size={23} />}
        </button>
      </div>
      <PageTitle title={title} description={description} />
      <div className="period-control mobile-period" hidden={open}>
        {selector}
      </div>
      {open && (
        <div id={id} className="mobile-menu">
          <nav aria-label="Secciones">
            {nav.map(([path, label, Icon]) => (
              <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)}>
                <Icon size={19} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="mobile-session">
            <Logout />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [period, setPeriod] = useState(0);
  const [create, setCreate] = useState(false);
  const [toast, setToast] = useState('');
  const location = useLocation();
  const mobileMenu = useDisclosure();
  useEffect(() => {
    mobileMenu.setOpen(false);
  }, [location.key, mobileMenu.setOpen]);
  const q = useQuery({ queryKey: ['periods'], queryFn: () => api<any[]>('/periods') });
  useEffect(() => {
    if (!q.isFetching && q.data && !q.data.some((p) => p.id === period))
      setPeriod(q.data[0]?.id || 0);
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
      <div
        className={`app ${collapsed ? 'collapsed' : ''} ${mobileMenu.open ? 'mobile-menu-open' : ''}`}
      >
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
          <MobileHeader
            pathname={location.pathname}
            disclosure={mobileMenu}
            selector={
              <PeriodSelector
                period={period}
                periods={q.data || []}
                onChange={setPeriod}
                onCreate={() => setCreate(true)}
                compactClosed
              />
            }
          />
          <header className="desktop-header">
            <div className="breadcrumb">
              PRISMA <span>/</span> Administración
            </div>
            <div className="period-control">
              <Logout />
              <PeriodSelector
                period={period}
                periods={q.data || []}
                onChange={setPeriod}
                onCreate={() => setCreate(true)}
              />
            </div>
          </header>
          <main
            className={
              [
                '/personas',
                '/gestion',
                '/agenda',
                '/pagos',
                '/pago-facilitadores',
                '/publicidad',
                '/importar',
                '/importar-forms',
              ].includes(location.pathname) || location.pathname.startsWith('/personas/')
                ? 'administrative-page'
                : undefined
            }
          >
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
              <Route path="/publicidad" element={<Expenses />} />
              <Route path="/estadisticas" element={<Statistics />} />
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
