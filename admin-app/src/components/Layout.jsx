import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api, apiRoot } from '../api.js';

/* Shell del panel: menú lateral agrupado por el día de trabajo (Taller,
   Tienda, Equipo) con numeritos de pendientes y botón "+ Nuevo" para crear
   lo más común en un clic. En teléfono/tableta (≤820px) el menú lateral se
   esconde y queda UN solo menú: la barra fija de abajo, cuyo botón "Más"
   sube una hoja con "Crear nuevo" y el resto de páginas. */

// Íconos de línea limpia, un solo color y sin cuadro de fondo:
// los mismos del Dashboard. Dibujados a mano (sin librerías).
function Ico({ children }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const I = {
  dashboard: <><rect x="3.5" y="3.5" width="7" height="9" rx="2" /><rect x="13.5" y="3.5" width="7" height="5" rx="2" /><rect x="13.5" y="11.5" width="7" height="9" rx="2" /><rect x="3.5" y="15.5" width="7" height="5" rx="2" /></>,
  reparaciones: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3-3a6 6 0 0 1-7.9 7.9l-6.4 6.4a2.1 2.1 0 0 1-3-3l6.4-6.4a6 6 0 0 1 7.9-7.9z" /></>,
  citas: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 9.5h17" /><circle className="dot" cx="15.5" cy="15" r="1.6" /></>,
  ventas: <><circle cx="12" cy="12" r="9" /><path d="M14.8 9.4c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2 2.8.9 2.8 2.1-1.2 2-2.8 2c-1.3 0-2.4-.6-2.9-1.5" /><path d="M12 6.5V8M12 16v1.5" /></>,
  ordenes: <><path d="M5.2 8h13.6l1.2 11.2a1.6 1.6 0 0 1-1.6 1.8H5.6A1.6 1.6 0 0 1 4 19.2z" /><path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5" /></>,
  inventario: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5L12 12l8-4.5M12 12v9M8 5.3l8 4.5" /></>,
  facturas: <><path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3v5h5M8.5 13h7M8.5 16.5h4.5" /></>,
  clientes: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20v-1a5.5 5.5 0 0 1 11 0v1" /><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M17.5 13.8a5.5 5.5 0 0 1 4 5.2v1" /></>,
  tareas: <><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 12.2l2.7 2.6L16 9.5" /></>,
  asistencia: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  trabajadores: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5v-1A6.5 6.5 0 0 1 11 13h2a6.5 6.5 0 0 1 6.5 6.5v1" /></>,
  ajustes: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  mas: <><circle cx="6.5" cy="12" r="1.2" className="dot" /><circle cx="12" cy="12" r="1.2" className="dot" /><circle cx="17.5" cy="12" r="1.2" className="dot" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  salir: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
};

// count: clave del contador de pendientes que lleva el ítem (ver useCounts).
const GRUPOS = [
  { label: null, items: [{ to: '/', label: 'Dashboard', end: true, icon: I.dashboard }] },
  { label: 'Taller', items: [
    { to: '/reparaciones', label: 'Reparaciones', icon: I.reparaciones, count: 'reparaciones' },
    { to: '/citas', label: 'Citas', icon: I.citas, count: 'citas' },
  ] },
  { label: 'Tienda', items: [
    { to: '/ventas', label: 'Ventas', icon: I.ventas },
    { to: '/ordenes', label: 'Órdenes', icon: I.ordenes, count: 'ordenes' },
    { to: '/inventario', label: 'Inventario', icon: I.inventario, count: 'inventario' },
    { to: '/facturas', label: 'Facturas', icon: I.facturas },
    { to: '/clientes', label: 'Clientes', icon: I.clientes },
  ] },
  { label: 'Equipo', items: [
    { to: '/tareas', label: 'Tareas', icon: I.tareas },
    { to: '/equipo', label: 'Asistencia', icon: I.asistencia },
    { to: '/trabajadores', label: 'Trabajadores', icon: I.trabajadores },
  ] },
];

// "+ Nuevo": cada página abre su formulario al llegar con ?nueva=1.
const NUEVO = [
  { to: '/ventas?nueva=1', label: 'Venta', icon: I.ventas },
  { to: '/facturas?nueva=1', label: 'Factura', icon: I.facturas },
  { to: '/reparaciones?nueva=1', label: 'Reparación', icon: I.reparaciones },
  { to: '/citas?nueva=1', label: 'Cita', icon: I.citas },
];

// Barra de abajo en teléfono: lo más usado + "Más" (sube la hoja con el resto).
const BOTTOM = [
  { to: '/', label: 'Inicio', end: true, icon: I.dashboard },
  { to: '/reparaciones', label: 'Reparar', icon: I.reparaciones, count: 'reparaciones' },
  { to: '/ventas', label: 'Ventas', icon: I.ventas },
  { to: '/ordenes', label: 'Órdenes', icon: I.ordenes, count: 'ordenes' },
];

// Hoja de "Más": todas las páginas que no están en la barra, + Ajustes.
const EN_BARRA = new Set(BOTTOM.map((b) => b.to));
const MAS_PAGINAS = [
  ...GRUPOS.flatMap((g) => g.items).filter((n) => !EN_BARRA.has(n.to)),
  { to: '/ajustes', label: 'Ajustes', icon: I.ajustes },
];

const TITLES = { '/': 'Dashboard', '/trabajadores': 'Trabajadores', '/tareas': 'Tareas', '/equipo': 'Asistencia', '/reparaciones': 'Reparaciones', '/ventas': 'Ventas', '/facturas': 'Facturas', '/clientes': 'Clientes', '/ordenes': 'Órdenes', '/inventario': 'Inventario', '/citas': 'Citas', '/ajustes': 'Ajustes' };

const COUNT_TITLE = {
  reparaciones: (n) => `${n} para atender (piezas que llegaron o equipos listos para entregar)`,
  citas: (n) => `${n} cita${n === 1 ? '' : 's'} hoy`,
  ordenes: (n) => `${n} pedido${n === 1 ? '' : 's'} por enviar`,
  inventario: (n) => `${n} producto${n === 1 ? '' : 's'} agotado${n === 1 ? '' : 's'}`,
};

function chicagoHoy() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

// Numeritos de pendientes del menú (mismos criterios que "Necesita atención"
// del Dashboard). Se recargan al cambiar de página (máx. cada 20 s) y cada
// minuto. Si una API falla, ese numerito simplemente no se muestra.
function useCounts(pathname) {
  const [counts, setCounts] = useState({});
  const last = useRef(0);
  const cargar = useCallback(() => {
    last.current = Date.now();
    const set = (k, v) => setCounts((c) => ({ ...c, [k]: v }));
    api('/repairs').then((d) => set('reparaciones', (d.tickets || []).filter((t) =>
      t.status === 'listo' || (t.ship_tag === 'Delivered' && ['recibido', 'diagnostico'].includes(t.status))).length)).catch(() => {});
    api('/orders').then((d) => set('ordenes', (d.orders || []).filter((o) => o.ship_status === 'pendiente').length)).catch(() => {});
    api('/inventory').then((d) => set('inventario', (d.items || []).filter((i) => (Number(i.stock) || 0) <= 0).length)).catch(() => {});
    apiRoot('/api/appointments?date=' + chicagoHoy()).then((d) => set('citas', (d.citas || []).filter((c) =>
      !['atendida', 'cancelada'].includes(c.estado)).length)).catch(() => {});
  }, []);
  useEffect(() => {
    const id = setInterval(cargar, 60000);
    return () => clearInterval(id);
  }, [cargar]);
  useEffect(() => {
    if (Date.now() - last.current > 20000) cargar();
  }, [pathname, cargar]);
  return counts;
}

function Badge({ n, k }) {
  if (!n) return null;
  return <span className="nav-count" title={COUNT_TITLE[k] ? COUNT_TITLE[k](n) : undefined}>{n > 99 ? '99+' : n}</span>;
}

export default function Layout({ children }) {
  const { logout } = useAuth();
  const [mas, setMas] = useState(false); // hoja de "Más" (solo teléfono)
  const [nuevo, setNuevo] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const title = TITLES[loc.pathname] || 'Panel';
  const counts = useCounts(loc.pathname);
  const sheetRef = useRef(null);
  const drag = useRef(null);
  // "Más" queda marcado en la barra si la página actual vive dentro de la hoja.
  const enMas = MAS_PAGINAS.some((n) => n.to === loc.pathname);

  // La hoja se cierra al cambiar de página y con Escape; mientras está
  // abierta, la página de atrás no se desplaza.
  useEffect(() => { setMas(false); }, [loc.pathname, loc.search]);
  useEffect(() => {
    if (!mas) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMas(false); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [mas]);

  // Deslizar la agarradera hacia abajo cierra la hoja (como en iPhone).
  const grabDown = (e) => { drag.current = { y: e.clientY, dy: 0 }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const grabMove = (e) => {
    const d = drag.current; const el = sheetRef.current;
    if (!d || !el) return;
    d.dy = Math.max(0, e.clientY - d.y);
    el.classList.add('dragging');
    el.style.transform = `translateY(${d.dy}px)`;
  };
  const grabUp = () => {
    const d = drag.current; const el = sheetRef.current;
    drag.current = null;
    if (!d || !el) return;
    el.classList.remove('dragging');
    el.style.transform = '';
    if (d.dy > 70) setMas(false);
  };

  const ir = (to) => { setNuevo(false); setMas(false); navigate(to); };
  const item = (n) => (
    <NavLink key={n.to} to={n.to} end={n.end}
      className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
      <Ico>{n.icon}</Ico><span className="nav-txt">{n.label}</span>
      {n.count && <Badge n={counts[n.count]} k={n.count} />}
    </NavLink>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src="/x/static/img/logo-cruise.png" alt="ElectronicST" />
          <div><strong>ElectronicST</strong><span>Panel de gestión</span></div>
        </div>

        <div className={'nuevo' + (nuevo ? ' nuevo-open' : '')}>
          <button type="button" className="nuevo-btn" onClick={() => setNuevo((v) => !v)} aria-expanded={nuevo}>
            <Ico>{I.plus}</Ico>Nuevo<span className="nuevo-caret" aria-hidden="true">▾</span>
          </button>
          {nuevo && (
            <div className="nuevo-menu">
              {NUEVO.map((n) => (
                <button key={n.to} type="button" className="nuevo-opt" onClick={() => ir(n.to)}>
                  <Ico>{n.icon}</Ico>{n.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="nav-scroll">
          {GRUPOS.map((g) => (
            <div key={g.label || 'inicio'} className="nav-group">
              {g.label && <div className="nav-label">{g.label}</div>}
              {g.items.map(item)}
            </div>
          ))}
        </nav>

        <div className="nav-sep" />
        {item({ to: '/ajustes', label: 'Ajustes', icon: I.ajustes })}
      </aside>

      <div className="main">
        <div className="topbar">
          <h2>{title}</h2>
          <div className="spacer" />
          <div className="userchip">
            <button className="btn btn-ghost btn-sm" onClick={() => logout()} title="Cerrar sesión">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Salir
            </button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>

      {/* Teléfono: "Más" sube esta hoja (Crear nuevo + resto de páginas). */}
      <div className={'mas-backdrop' + (mas ? ' open' : '')} onClick={() => setMas(false)} aria-hidden="true" />
      <div ref={sheetRef} className={'mas-sheet' + (mas ? ' open' : '')} role="dialog" aria-modal="true"
        aria-label="Más opciones" inert={mas ? undefined : ''}>
        <div className="mas-grab" onPointerDown={grabDown} onPointerMove={grabMove}
          onPointerUp={grabUp} onPointerCancel={grabUp}>
          <div className="mas-handle" />
        </div>
        <div className="mas-lbl">Crear nuevo</div>
        <div className="mas-new">
          {NUEVO.map((n) => (
            <button key={n.to} type="button" className="mas-new-btn" onClick={() => ir(n.to)}>
              <Ico>{n.icon}</Ico><span>{n.label}</span>
            </button>
          ))}
        </div>
        <div className="mas-lbl">Más páginas</div>
        <nav className="mas-grid" aria-label="Más páginas">
          {MAS_PAGINAS.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setMas(false)}
              className={({ isActive }) => 'mas-item' + (isActive ? ' active' : '')}>
              <span className="mas-ico"><Ico>{n.icon}</Ico>{n.count && <Badge n={counts[n.count]} k={n.count} />}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
          <button type="button" className="mas-item" onClick={() => { setMas(false); logout(); }}>
            <span className="mas-ico"><Ico>{I.salir}</Ico></span><span>Salir</span>
          </button>
        </nav>
      </div>

      {/* Teléfono: barra fija abajo con lo más usado; es el único menú ahí. */}
      <nav className="bottom-bar" aria-label="Accesos rápidos">
        {BOTTOM.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMas(false)}
            className={({ isActive }) => 'bb-item' + (isActive && !mas ? ' active' : '')}>
            <span className="bb-ico"><Ico>{n.icon}</Ico>{n.count && <Badge n={counts[n.count]} k={n.count} />}</span>
            {n.label}
          </NavLink>
        ))}
        <button type="button" className={'bb-item' + (mas || enMas ? ' active' : '')}
          onClick={() => setMas((v) => !v)} aria-expanded={mas}>
          <span className="bb-ico"><Ico>{I.mas}</Ico></span>Más
        </button>
      </nav>
    </div>
  );
}
