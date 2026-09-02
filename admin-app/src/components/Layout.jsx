import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

function Ico({ children }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const NAV = [
  { to: '/', label: 'Dashboard', end: true, icon: <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></> },
  { to: '/reparaciones', label: 'Reparaciones', icon: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></> },
  { to: '/ventas', label: 'Ventas', icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
  { to: '/facturas', label: 'Facturas', icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" /></> },
  { to: '/ordenes', label: 'Órdenes', icon: <><path d="M5.5 7h13l1.5 13.5a1 1 0 0 1-1 1.1H5a1 1 0 0 1-1-1.1L5.5 7z" transform="translate(0 -1)" /><path d="M8.5 10V6a3.5 3.5 0 0 1 7 0v4" /></> },
  { to: '/citas', label: 'Citas', icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
  { to: '/inventario', label: 'Inventario', icon: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></> },
  { to: '/equipo', label: 'Equipo', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { to: '/trabajadores', label: 'Trabajadores', icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></> },
  { to: '/tareas', label: 'Tareas', icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1 2-2V5a2 2 0 0 1 2-2h11" /></> },
];

const SOON = [
  { label: 'Plano 3D', icon: <><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></> },
];

const TITLES = { '/': 'Dashboard', '/trabajadores': 'Trabajadores', '/tareas': 'Tareas', '/equipo': 'Equipo', '/reparaciones': 'Reparaciones', '/ventas': 'Ventas', '/facturas': 'Facturas', '/ordenes': 'Órdenes', '/inventario': 'Inventario', '/citas': 'Citas', '/ajustes': 'Ajustes' };

export default function Layout({ children }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const title = TITLES[loc.pathname] || 'Panel';

  return (
    <div className="shell">
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <aside className={'sidebar' + (open ? ' open' : '')}>
        <div className="brand">
          <img className="brand-logo" src="/x/static/img/logo-cruise.png" alt="ElectronicST" />
          <div><strong>ElectronicST</strong><span>Panel de gestión</span></div>
        </div>
        <div className="nav-label">Menú</div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
            className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
            <Ico>{n.icon}</Ico>{n.label}
          </NavLink>
        ))}
        <div className="nav-sep" />
        <div className="nav-label">Próximamente</div>
        {SOON.map((n) => (
          <div key={n.label} className="nav-item disabled" title="Próximamente">
            <Ico>{n.icon}</Ico>{n.label}<span className="soon">PRONTO</span>
          </div>
        ))}
        <div className="spacer" />
        <div className="nav-sep" />
        <NavLink to="/ajustes" onClick={() => setOpen(false)}
          className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
          <Ico><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Ico>Ajustes
        </NavLink>
      </aside>

      <div className="main">
        <div className="topbar">
          <button className="burger" onClick={() => setOpen((v) => !v)} aria-label="Menú">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          </button>
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
    </div>
  );
}
