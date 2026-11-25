import { Logout } from './Auth';
import { EducationAccess } from './EducationAccess';
import { FacilitatorPayments } from './FacilitatorPayments';
import { FormsImport } from './FormsImport';
import { PeriodForm } from './Periods';
import { useEffect, useState, createContext, useContext } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
  ChevronLeft,
  ChevronRight,
  Plus,
  BarChart3,
  Menu,
  X,
  BrainCircuit,
  Ticket,
  KeyRound,
} from 'lucide-react';
import { api } from './api';
import { ErrorBox, Empty, PageTitle, useDisclosure } from './components';
import { Dashboard } from './Dashboard';
import { People, PersonDetail } from './People';
import { Monthly, Agenda, Payments, Configuration } from './Management';
import { Expenses } from './Expenses';
import { ImportPeople } from './ImportPeople';
import { Statistics } from './Statistics';
import { Knowledge } from './Knowledge';
import { SpecialEvents, SpecialEventPage } from './SpecialEvents';
import './administrative.css';
export const PeriodContext = createContext<{
  period: number;
  periods: any[];
  selectPeriod?: (period: number) => void;
  createPeriod?: () => void;
}>({
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
  ['/eventos', 'Eventos Especiales', Ticket],
  ['/estadisticas', 'Estadísticas', BarChart3],
  ['/know-how', 'Know-How IA', BrainCircuit],
  ['/accesos-pwa', 'Accesos PWA', KeyRound],
  ['/configuracion', 'Configuración', Settings],
] as const;

function sectionTitle(pathname: string) {
  if (pathname.startsWith('/personas/')) return 'BBDD Personas';
  if (pathname.startsWith('/eventos/')) return 'Eventos Especiales';
  if (pathname === '/importar') return 'Importar personas';
  if (pathname === '/importar-forms') return 'Importar inscripciones';
  return nav.find(([path]) => path === pathname)?.[1] ?? 'Página no encontrada';
}

const sectionDescriptions: Record<string, string> = {
  '/eventos': 'Eventos, participantes y cobros del período seleccionado.',
  '/know-how': 'Documentos privados de esta instalación, independientes de los períodos.',
  '/accesos-pwa': 'Vinculaciones y derechos educativos por persona y actividad.',
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
  showPeriod,
  disclosure,
}: {
  pathname: string;
  selector: React.ReactNode;
  showPeriod: boolean;
  disclosure: ReturnType<typeof useDisclosure>;
}) {
  const { open, setOpen, root, trigger, id } = disclosure;
  const { period, periods } = usePeriod();
  const sectionPath = pathname.startsWith('/personas/')
    ? '/personas'
    : pathname.startsWith('/eventos/')
      ? '/eventos'
      : pathname;
  const title = sectionTitle(pathname);
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
      <div className="period-control mobile-period" hidden={open || !showPeriod}>
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
            <Logout sidebar />
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
  const [statisticsView, setStatisticsView] = useState<'monthly' | 'annual'>('monthly');
  const [toast, setToast] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const showPeriod =
    location.pathname !== '/know-how' &&
    location.pathname !== '/accesos-pwa' &&
    (location.pathname !== '/estadisticas' || statisticsView === 'monthly');
  useEffect(() => {
    setStatisticsView('monthly');
  }, [location.pathname]);
  const [knowledgeUnsaved, setKnowledgeUnsaved] = useState(false);
  const [heldLocation, setHeldLocation] = useState(location);
  const holdKnowledge =
    knowledgeUnsaved && heldLocation.pathname === '/know-how' && location.pathname !== '/know-how';
  useEffect(() => {
    const listener = (event: Event) => setKnowledgeUnsaved(Boolean((event as CustomEvent).detail));
    window.addEventListener('knowledge-unsaved', listener);
    return () => window.removeEventListener('knowledge-unsaved', listener);
  }, []);
  useEffect(() => {
    if (!holdKnowledge) {
      setHeldLocation(location);
      return;
    }
    // Keep the editor mounted while a browser Back/Forward navigation is decided.
    if (window.confirm('Hay cambios sin guardar en Know-How IA. ¿Querés descartarlos y salir?')) {
      setKnowledgeUnsaved(false);
    } else {
      navigate(heldLocation.pathname + heldLocation.search + heldLocation.hash, { replace: true });
    }
  }, [holdKnowledge, heldLocation, location, navigate]);
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
    <PeriodContext.Provider
      value={{
        period,
        periods: q.data || [],
        selectPeriod: setPeriod,
        createPeriod: () => setCreate(true),
      }}
    >
      <div
        className={`app ${location.pathname === '/estadisticas' ? 'statistics-layout' : ''} ${collapsed ? 'collapsed' : ''} ${mobileMenu.open ? 'mobile-menu-open' : ''}`}
      >
        <aside>
          <div className="brand">
            <img className="brand-logo" src="/branding/logo_prisma.svg" alt="PRISMA" />
            <div>
              <b>PRISMA</b>
              <small>Sistema de Gestión</small>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={19} /> : <ChevronLeft size={19} />}
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
            <Logout sidebar />
          </div>
        </aside>
        <div className="workspace">
          <MobileHeader
            pathname={location.pathname}
            showPeriod={showPeriod}
            disclosure={mobileMenu}
            selector={
              <PeriodSelector
                period={period}
                periods={q.data || []}
                onChange={(value) => {
                  setPeriod(value);
                  if (location.pathname.startsWith('/eventos/')) navigate('/eventos');
                }}
                onCreate={() => setCreate(true)}
                compactClosed
              />
            }
          />
          <header className="desktop-header">
            <div className="header-title">
              <h1>{sectionTitle(location.pathname)}</h1>
            </div>
            <div className="period-control">
              {showPeriod && (
                <PeriodSelector
                  period={period}
                  periods={q.data || []}
                  onChange={(value) => {
                    setPeriod(value);
                    if (location.pathname.startsWith('/eventos/')) navigate('/eventos');
                  }}
                  onCreate={() => setCreate(true)}
                />
              )}
            </div>
          </header>
          <div className="shell-breadcrumb" aria-label="Ubicación">
            <span>PRISMA</span>
            <span aria-hidden="true">/</span>
            <span>Administración</span>
          </div>
          <main
            className={
              [
                '/personas',
                '/gestion',
                '/agenda',
                '/pagos',
                '/pago-facilitadores',
                '/publicidad',
                '/eventos',
                '/importar',
                '/importar-forms',
                '/know-how',
              ].includes(location.pathname) ||
              location.pathname.startsWith('/personas/') ||
              location.pathname.startsWith('/eventos/')
                ? 'administrative-page'
                : undefined
            }
          >
            {location.pathname !== '/know-how' && <ErrorBox error={q.error} />}
            <Routes location={holdKnowledge ? heldLocation : location}>
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
              <Route path="/eventos" element={<SpecialEvents />} />
              <Route path="/eventos/:id" element={<SpecialEventPage />} />
              <Route
                path="/estadisticas"
                element={<Statistics view={statisticsView} setView={setStatisticsView} />}
              />
              <Route path="/know-how" element={<Knowledge />} />
              <Route path="/configuracion" element={<Configuration />} />
              <Route path="/accesos-pwa" element={<EducationAccess />} />
              <Route
                path="/configuracion/accesos-digitales"
                element={<Navigate to="/accesos-pwa" replace />}
              />
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
