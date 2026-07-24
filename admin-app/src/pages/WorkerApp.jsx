import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';

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

export default function WorkerApp() {
  const { user } = useAuth();
  const [tab, setTab] = useState('reloj');
  return (
    <div className="wapp">
      <div className="wapp-head">
        <div className="brand-dot">E</div>
        <div><strong>ElectronicST</strong><div className="muted" style={{ fontSize: 12 }}>Hola, {user.username}</div></div>
      </div>
      <div className="wapp-body">
        {tab === 'reloj' && <RelojTab />}
        {tab === 'tareas' && <TareasTab />}
        {tab === 'perfil' && <PerfilTab />}
      </div>
      <nav className="wapp-tabs">
        <TabBtn id="reloj" cur={tab} set={setTab} label="Reloj" icon={<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>} />
        <TabBtn id="tareas" cur={tab} set={setTab} label="Tareas" icon={<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>} />
        <TabBtn id="perfil" cur={tab} set={setTab} label="Perfil" icon={<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 12 0v1" /></>} />
      </nav>
    </div>
  );
}

function TabBtn({ id, cur, set, label, icon }) {
  return (
    <button className={'wtab' + (cur === id ? ' active' : '')} onClick={() => set(id)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
      <span>{label}</span>
    </button>
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
      <h3 style={{ marginBottom: 12 }}>Mis tareas</h3>
      {active.length === 0 && done.length === 0 && <div className="empty">No tienes tareas asignadas.</div>}
      {active.map((t) => <TaskCard key={t.id} t={t} onStatus={setStatus} />)}
      {done.length > 0 && <div className="muted" style={{ margin: '18px 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em' }}>Completadas</div>}
      {done.map((t) => <TaskCard key={t.id} t={t} onStatus={setStatus} />)}
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

function PerfilTab() {
  const { user, logout } = useAuth();
  const [showPw, setShowPw] = useState(false);
  return (
    <div className="wsection">
      <div className="card">
        <h3>Mi cuenta</h3>
        <p className="muted" style={{ margin: '0 0 4px' }}>Usuario: <strong style={{ color: 'var(--text)' }}>{user.username}</strong></p>
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
