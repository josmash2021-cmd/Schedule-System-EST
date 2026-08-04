import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';
import CitaForm from '../components/CitaForm.jsx';
import FormPage from '../components/FormPage.jsx';
import RepairDetail, { STATUS_BADGE, statusLabel } from '../components/RepairDetail.jsx';
import InventoryDetail from '../components/InventoryDetail.jsx';

function chicagoDate(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtHm(sec) {
  sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// En el teléfono manda la app de pestañas abajo; en pantalla de ordenador se
// usa el MISMO shell del admin (sidebar + topbar + tarjetas). 821px es el mismo
// punto de corte donde el panel de admin colapsa su sidebar.
function useIsDesktop() {
  const QUERY = '(min-width: 821px)';
  const [is, setIs] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(QUERY).matches));
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setIs(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return is;
}

function Ico({ children }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}

// Un solo listado de secciones para las dos vistas (pestañas y sidebar).
const TABS = [
  { id: 'reloj', label: 'Reloj', title: 'Mi reloj', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { id: 'tareas', label: 'Tareas', title: 'Mis tareas', icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></> },
  { id: 'citas', label: 'Citas', title: 'Citas', icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></> },
  { id: 'reparaciones', label: 'Reparar', deskLabel: 'Reparaciones', title: 'Reparaciones', icon: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></> },
  { id: 'stock', label: 'Stock', deskLabel: 'Inventario', title: 'Inventario', icon: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></> },
  { id: 'perfil', label: 'Perfil', title: 'Mi cuenta', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" /></> },
];

export default function WorkerApp() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('reloj');
  const desk = useIsDesktop();

  // Heartbeat de presencia: avisa al admin qué pestaña ve, cada 45s y al cambiar.
  useEffect(() => {
    const ping = () => { api('/live/presence', { method: 'POST', body: { screen: tab } }).catch(() => {}); };
    ping();
    const iv = setInterval(ping, 45000);
    return () => clearInterval(iv);
  }, [tab]);

  const body = (
    <>
      {tab === 'reloj' && <RelojTab />}
      {tab === 'tareas' && <TareasTab />}
      {tab === 'citas' && <CitasTab desk={desk} />}
      {tab === 'reparaciones' && <ReparacionesTab desk={desk} />}
      {tab === 'stock' && <StockTab desk={desk} />}
      {tab === 'perfil' && <PerfilTab />}
    </>
  );

  if (desk) {
    const current = TABS.find((t) => t.id === tab);
    return (
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <img className="brand-logo" src="/x/static/img/logo-cruise.png" alt="ElectronicST" />
            <div><strong>ElectronicST</strong><span>Panel de trabajador</span></div>
          </div>
          <div className="nav-label">Menú</div>
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={'nav-item' + (tab === t.id ? ' active' : '')}>
              <Ico>{t.icon}</Ico>{t.deskLabel || t.label}
            </button>
          ))}
          <div className="spacer" />
          <div className="nav-sep" />
          <div className="nav-item disabled" style={{ opacity: 0.75 }}>
            <Ico><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" /></Ico>{user.username}
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <h2>{current ? current.title : 'Panel'}</h2>
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
          <div className="content wdesk">{body}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="wapp">
      <div className="wapp-head">
        <img className="brand-logo" src="/x/static/img/logo-cruise.png" alt="ElectronicST" />
        <div><strong>ElectronicST</strong><div className="muted" style={{ fontSize: 12 }}>Hola, {user.username}</div></div>
      </div>
      <div className="wapp-body">{body}</div>
      <nav className="wapp-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={'wtab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function RelojTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => { api('/time/mine').then(setData).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const on = !!(data && data.open);
  const openIn = on ? new Date(data.open.clock_in).getTime() : null;
  const todaySec = (() => {
    if (!data) return 0;
    const today = chicagoDate(new Date());
    let sec = 0;
    for (const e of data.entries) {
      if (chicagoDate(new Date(e.clock_in)) !== today) continue;
      const end = e.clock_out ? new Date(e.clock_out).getTime() : now;
      sec += (end - new Date(e.clock_in).getTime()) / 1000;
    }
    return sec;
  })();

  const action = async (path) => {
    setBusy(true); setErr('');
    try { await api('/time/' + path, { method: 'POST' }); load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (!data) return <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>;
  return (
    <div className="wsection">
      {err && <div className="alert alert-error">{err}</div>}
      <div className="wclock-grid">
        <div className={'clock-card' + (on ? ' on' : '')}>
          <div className="clock-status">{on ? '● Trabajando' : 'Fuera de turno'}</div>
          <div className="clock-timer">{on ? fmtDur((now - openIn) / 1000) : '00:00:00'}</div>
          <button className={'clock-btn ' + (on ? 'out' : 'in')} disabled={busy} onClick={() => action(on ? 'clock-out' : 'clock-in')}>
            {busy ? <span className="spinner" /> : (on ? 'Fichar salida' : 'Fichar entrada')}
          </button>
        </div>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Horas de hoy</span>
            <strong style={{ fontSize: 20 }}>{fmtHm(todaySec)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

function TareasTab() {
  const [tasks, setTasks] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { api('/tasks/mine').then((d) => setTasks(d.tasks)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (t, status) => {
    try {
      await api('/tasks/' + t.id + '/status', { method: 'PATCH', body: { status } });
      setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, status } : x)));
    } catch (e) { setErr(e.message); }
  };

  if (!tasks) return <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>;
  const active = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');
  return (
    <div className="wsection">
      {err && <div className="alert alert-error">{err}</div>}
      <h3 className="wtitle" style={{ marginBottom: 12 }}>Mis tareas</h3>
      {active.length === 0 && done.length === 0 && <div className="card"><div className="empty">No tienes tareas asignadas.</div></div>}
      <div className="wlist">
        {active.map((t) => <TaskCard key={t.id} t={t} onStatus={setStatus} />)}
      </div>
      {done.length > 0 && <div className="muted" style={{ margin: '18px 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>Completadas</div>}
      <div className="wlist">
        {done.map((t) => <TaskCard key={t.id} t={t} onStatus={setStatus} />)}
      </div>
    </div>
  );
}

function TaskCard({ t, onStatus }) {
  return (
    <div className={'task-card status-' + t.status}>
      <div className="task-main">
        <strong>{t.title}</strong>
        {t.description && <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{t.description}</p>}
        {t.due_date && <span className="badge badge-pendiente" style={{ marginTop: 6, fontSize: 10 }}>Para {String(t.due_date).slice(0, 10)}</span>}
      </div>
      <div className="task-actions">
        {t.status === 'pending' && <button className="btn btn-secondary btn-sm" onClick={() => onStatus(t, 'in_progress')}>Empezar</button>}
        {t.status === 'in_progress' && <button className="btn btn-primary btn-sm" onClick={() => onStatus(t, 'done')}>Completar</button>}
        {t.status === 'done' && <button className="btn btn-ghost btn-sm" onClick={() => onStatus(t, 'pending')}>Reabrir</button>}
      </div>
    </div>
  );
}

// Citas del taller: el trabajador ve la agenda del día, puede crear una cita
// nueva (cliente que llama o entra) y mover su estado. Editar y borrar siguen
// siendo cosa del admin.
const CITA_ESTADOS = ['pendiente', 'confirmada', 'atendida', 'cancelada'];

function citaHora(h) {
  const [hh = 0, mm = 0] = String(h).split(':').map(Number);
  const am = hh < 12;
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${am ? 'am' : 'pm'}`;
}
const citaFecha = (f) => String(f).slice(0, 10).split('-').reverse().join('/');

function CitasTab({ desk }) {
  const [date, setDate] = useState(() => chicagoDate(new Date()));
  const [all, setAll] = useState(false);
  const [citas, setCitas] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false);
  const [tick, setTick] = useState(0); // fuerza recarga aunque no cambie el filtro

  const load = useCallback(() => {
    setErr('');
    setCitas(null);
    api('/appointments' + (all ? '' : '?date=' + date))
      .then((d) => setCitas(d.citas || []))
      .catch((e) => { setErr(e.message); setCitas([]); });
  }, [date, all, tick]);
  useEffect(() => { load(); }, [load]);

  const setEstado = async (c, estado) => {
    setBusy(c.id + estado);
    try {
      await api('/appointments/' + c.id + '/estado', { method: 'PATCH', body: { estado } });
      setCitas((list) => list.map((x) => (x.id === c.id ? { ...x, estado } : x)));
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  };

  if (creating) {
    const back = () => setCreating(false);
    const saved = (cita) => {
      setCreating(false);
      // Saltar al día de la cita recién creada para verla en la lista. OJO:
      // si la cita es para el día que ya estaba puesto, setDate() no cambia
      // nada y el efecto no se dispararía; por eso el tick recarga siempre
      // (era el motivo de que la cita recién creada no apareciera).
      if (cita && cita.fecha) { setAll(false); setDate(String(cita.fecha).slice(0, 10)); }
      setTick((t) => t + 1);
    };
    if (desk) {
      return (
        <div className="wsection">
          <FormPage title="Nueva cita" onBack={back} max={640}>
            <CitaForm onSaved={saved} onCancel={back} />
          </FormPage>
        </div>
      );
    }
    return (
      <div>
        <div className="wrepair-head">
          <button className="btn btn-ghost btn-sm" onClick={back}>‹ Volver</button>
          <strong>Nueva cita</strong>
        </div>
        <div className="wsection"><CitaForm onSaved={saved} onCancel={back} /></div>
      </div>
    );
  }

  return (
    <div className="wsection">
      <div className="row whead">
        <h3 className="wtitle">Citas</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>+ Nueva cita</button>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row citas-filtro">
          <label className="field citas-fecha" style={{ marginBottom: 0 }}>
            <span>Fecha</span>
            <input type="date" value={date} disabled={all} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          <label className="row citas-todas">
            <input type="checkbox" style={{ width: 'auto' }} checked={all} onChange={(e) => setAll(e.target.checked)} />
            <span className="muted">Ver todas</span>
          </label>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={load}>Actualizar</button>
        </div>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      {citas == null ? <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>
        : citas.length === 0 ? <div className="card"><div className="empty">No hay citas {all ? 'registradas' : 'para este día'}.</div></div>
          : (
            <div className="wlist">
              {citas.map((c) => (
                // El desplegable ya muestra el estado actual: poner además la
                // etiqueta de color sería el mismo dato dos veces.
                <div key={c.id} className={'task-card cita-card estado-' + c.estado}>
                  <div className="task-main">
                    <strong>{citaHora(c.hora)} · {c.nombre}</strong>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                      {all ? `${citaFecha(c.fecha)} · ` : ''}{c.servicio}{c.telefono ? ` · ${c.telefono}` : ''}
                    </p>
                  </div>
                  <div className="task-actions">
                    <select value={c.estado} disabled={!!busy} style={{ width: 'auto' }}
                      onChange={(e) => setEstado(c, e.target.value)}>
                      {CITA_ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

function ReparacionesTab({ desk }) {
  const [tickets, setTickets] = useState(null);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null); // { id } | { id: null }

  const load = useCallback(() => { api('/repairs').then((d) => setTickets(d.tickets)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  if (detail) {
    const back = () => { setDetail(null); load(); };
    const title = detail.id ? 'Reparación' : 'Nueva reparación';
    // En web, la misma ficha a página completa que usa el admin.
    if (desk) {
      return (
        <div className="wsection">
          <FormPage title={title} onBack={back}>
            <RepairDetail ticketId={detail.id} workers={[]} isAdmin={false} onClose={back} onSaved={load} />
          </FormPage>
        </div>
      );
    }
    return (
      <div>
        <div className="wrepair-head">
          <button className="btn btn-ghost btn-sm" onClick={back}>‹ Volver</button>
          <strong>{title}</strong>
        </div>
        <div className="wsection">
          <RepairDetail ticketId={detail.id} workers={[]} isAdmin={false} onClose={back} onSaved={load} />
        </div>
      </div>
    );
  }

  return (
    <div className="wsection">
      <div className="row whead">
        <h3 className="wtitle">Reparaciones</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setDetail({ id: null })}>+ Nueva</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      {tickets == null ? <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>
        : tickets.length === 0 ? <div className="card"><div className="empty">No hay reparaciones.</div></div>
          : (
            <div className="wlist">
              {tickets.map((t) => (
                <div key={t.id} className="task-card" style={{ cursor: 'pointer' }} onClick={() => setDetail({ id: t.id })}>
                  <div className="task-main">
                    <strong>{[t.device_brand, t.device_model].filter(Boolean).join(' ') || 'Equipo'}</strong>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>{t.customer_name || '—'}{t.photo_count > 0 ? ` · 📷 ${t.photo_count}` : ''}</p>
                  </div>
                  <span className={'badge ' + STATUS_BADGE[t.status]}>{statusLabel(t.status)}</span>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

function StockTab({ desk }) {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);

  const load = useCallback((q = '') => { api('/inventory' + (q ? '?search=' + encodeURIComponent(q) : '')).then((d) => setItems(d.items)).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t); }, [search, load]);

  if (detail) {
    const back = () => { setDetail(null); load(search); };
    if (desk) {
      return (
        <div className="wsection">
          <FormPage title="Producto" onBack={back}>
            <InventoryDetail itemId={detail.id} isAdmin={false} onClose={back} onSaved={() => load(search)} />
          </FormPage>
        </div>
      );
    }
    return (
      <div>
        <div className="wrepair-head">
          <button className="btn btn-ghost btn-sm" onClick={back}>‹ Volver</button>
          <strong>Producto</strong>
        </div>
        <div className="wsection">
          <InventoryDetail itemId={detail.id} isAdmin={false} onClose={back} onSaved={() => load(search)} />
        </div>
      </div>
    );
  }

  return (
    <div className="wsection">
      <h3 className="wtitle" style={{ marginBottom: 10 }}>Inventario</h3>
      <input className="wsearch" placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
      {err && <div className="alert alert-error">{err}</div>}
      {items == null ? <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>
        : items.length === 0 ? <div className="card"><div className="empty">{search ? 'Sin resultados.' : 'No hay productos.'}</div></div>
          : (
            <div className="wlist">
              {items.map((i) => {
                const low = i.stock <= i.min_stock;
                return (
                  <div key={i.id} className="task-card" style={{ cursor: 'pointer' }} onClick={() => setDetail({ id: i.id })}>
                    <div className="task-main">
                      <strong>{i.name}</strong>
                      <p className="muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>{i.category || i.sku || ''}</p>
                    </div>
                    <span className={'badge ' + (low ? 'badge-pendiente' : 'badge-on')} style={{ fontSize: 14 }}>{i.stock}</span>
                  </div>
                );
              })}
            </div>
          )}
    </div>
  );
}

function PerfilTab() {
  const { user, logout } = useAuth();
  const [showPw, setShowPw] = useState(false);
  return (
    <div className="wsection wperfil">
      <div className="card">
        <h3>Mi cuenta</h3>
        <p className="muted" style={{ margin: '0 0 4px' }}>Usuario: <strong style={{ color: '#111' }}>{user.username}</strong></p>
        <p className="muted" style={{ margin: 0 }}>Rol: Trabajador</p>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h3>Seguridad</h3>
        {showPw
          ? <ChangePasswordForm onDone={() => setShowPw(false)} />
          : <button className="btn btn-secondary btn-block" onClick={() => setShowPw(true)}>Cambiar contraseña</button>}
      </div>
      <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={() => logout()}>Cerrar sesión</button>
    </div>
  );
}
