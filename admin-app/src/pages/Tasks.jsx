import './Tasks.css';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import PageHead from '../components/PageHead.jsx';
import Tabs from '../components/Tabs.jsx';
import { fechaCorta, hoyKey, iniciales } from '../fechas.js';

const STATUS_LABEL = { pending: 'Pendiente', in_progress: 'En progreso', done: 'Hecha' };
const COLUMNAS = ['pending', 'in_progress', 'done'];
const dstr = (d) => (d ? String(d).slice(0, 10) : '');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Vencida = tiene fecha límite anterior a hoy (Chicago) y no está hecha.
const vencida = (t) => t.status !== 'done' && !!t.due_date && dstr(t.due_date) < hoyKey();

// Orden dentro de cada columna: primero lo que vence antes (sin fecha al
// final); en "Hecha", lo último que se terminó arriba.
function ordenar(list, status) {
  const copia = [...list];
  if (status === 'done') {
    return copia.sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
  }
  return copia.sort((a, b) => {
    const da = dstr(a.due_date) || '9999-99-99';
    const db = dstr(b.due_date) || '9999-99-99';
    return da === db ? String(b.created_at || '').localeCompare(String(a.created_at || '')) : da.localeCompare(db);
  });
}

// Clave del filtro por persona: 'u<id>' para un trabajador, 'sin' si no tiene.
const claveDe = (t) => (t.assigned_to ? 'u' + t.assigned_to : 'sin');

export default function Tasks() {
  const [tasks, setTasks] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);
  const [persona, setPersona] = useState('todos');
  const [busy, setBusy] = useState({}); // { [id]: true } mientras se guarda el cambio
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(() => {
    setErr('');
    api('/tasks').then((d) => setTasks(d.tasks)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    api('/users').then((d) => setUsers(d.users.filter((u) => u.active))).catch(() => {});
  }, [load]);

  // /tareas?nueva=1 abre el formulario vacío (mismo criterio que "+ Nuevo").
  useEffect(() => {
    if (!searchParams.get('nueva')) return;
    setModal({ mode: 'create' });
    setSearchParams({}, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cambiar el estado directo desde el tablero (casilla y "Empezar").
  const setEstado = async (t, status) => {
    if (busy[t.id]) return;
    setErr('');
    setBusy((b) => ({ ...b, [t.id]: true }));
    try {
      const res = await api('/tasks/' + t.id, { method: 'PATCH', body: { status } });
      const completed_at = res && res.task ? res.task.completed_at : (status === 'done' ? new Date().toISOString() : null);
      setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, status, completed_at } : x)));
    } catch (e) { setErr(e.message); }
    setBusy((b) => { const n = { ...b }; delete n[t.id]; return n; });
  };

  // Filtro por persona: solo las personas que tienen tareas.
  const personas = useMemo(() => {
    const m = new Map();
    for (const t of tasks || []) {
      const k = claveDe(t);
      if (!m.has(k)) m.set(k, { v: k, l: t.assigned_to ? (t.assignee_username || 'Trabajador') : 'Sin asignar', n: 0 });
      if (t.status !== 'done') m.get(k).n += 1;
    }
    return [...m.values()].sort((a, b) => (a.v === 'sin') - (b.v === 'sin') || a.l.localeCompare(b.l));
  }, [tasks]);

  // Si la persona elegida ya no tiene tareas, volver a "Todos".
  useEffect(() => {
    if (persona !== 'todos' && !personas.some((p) => p.v === persona)) setPersona('todos');
  }, [personas, persona]);

  // Formulario a página completa (sin modal).
  if (modal) {
    return (
      <TaskForm modal={modal} users={users} onBack={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
    );
  }

  const visibles = (tasks || []).filter((t) => persona === 'todos' || claveDe(t) === persona);
  const nPend = visibles.filter((t) => t.status === 'pending').length;
  const nProg = visibles.filter((t) => t.status === 'in_progress').length;
  const nVenc = visibles.filter(vencida).length;
  const sub = tasks == null ? 'Cargando…'
    : tasks.length === 0 ? 'Sin tareas todavía'
      : [plural(nPend, 'pendiente', 'pendientes'), `${nProg} en progreso`, nVenc ? plural(nVenc, 'vencida', 'vencidas') : null]
        .filter(Boolean).join(' · ');
  const abiertas = (tasks || []).filter((t) => t.status !== 'done').length;

  return (
    <div className="tar2">
      <PageHead title="Tareas" sub={sub}>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ Nueva tarea</button>
      </PageHead>
      {personas.length > 1 && (
        <Tabs tabs={[{ v: 'todos', l: 'Todos', n: abiertas }, ...personas]} value={persona} onChange={setPersona} />
      )}
      {err && <div className="alert alert-error">{err}</div>}
      {tasks == null ? <span className="spinner spinner-lg" />
        : tasks.length === 0 ? (
          <div className="empty-state">
            No hay tareas. Crea la primera con <strong>+ Nueva tarea</strong>.
          </div>
        ) : (
          <div className="board tar2-board">
            {COLUMNAS.map((st) => {
              const lista = ordenar(visibles.filter((t) => t.status === st), st);
              return (
                <section key={st} className="bcol tar2-col" aria-label={STATUS_LABEL[st]}>
                  <div className="bcol-h"><b>{STATUS_LABEL[st]}</b><span>{lista.length}</span></div>
                  {lista.length === 0
                    ? <div className="bcol-empty">{st === 'done' ? 'Nada terminado todavía.' : 'Nada aquí.'}</div>
                    : lista.map((t) => (
                      <TaskCard key={t.id} t={t} busy={!!busy[t.id]}
                        onOpen={() => setModal({ mode: 'edit', task: t })}
                        onToggle={() => setEstado(t, t.status === 'done' ? 'pending' : 'done')}
                        onStart={() => setEstado(t, 'in_progress')} />
                    ))}
                </section>
              );
            })}
          </div>
        )}
    </div>
  );
}

// Tarjeta del tablero: casilla redonda (hecha / desmarcar), título,
// descripción corta, asignado y fecha. Tocarla abre la edición.
function TaskCard({ t, busy, onOpen, onToggle, onStart }) {
  const hecha = t.status === 'done';
  const venc = vencida(t);
  const due = dstr(t.due_date);
  const parar = (fn) => (e) => { e.stopPropagation(); fn(); };
  const teclado = (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } };

  let fecha;
  if (hecha) {
    fecha = <span className="st st-ok">{t.completed_at ? 'hecha ' + fechaCorta(t.completed_at, { conHora: false }) : 'hecha'}</span>;
  } else if (due) {
    fecha = <span className={'st ' + (venc ? 'st-bad' : due === hoyKey() ? 'st-warn' : '')}>{fechaCorta(due, { conHora: false })}{venc ? ' · vencida' : ''}</span>;
  } else {
    fecha = <span className="st st-muted">Sin fecha</span>;
  }

  return (
    <div className={'bcard click tar2-card' + (hecha ? ' tar2-done' : '') + (venc ? ' tar2-late' : '')}
      role="button" tabIndex={0} onClick={onOpen} onKeyDown={teclado} title="Abrir para editar">
      <div className="tar2-top">
        <button type="button" className={'tar2-check' + (hecha ? ' on' : '')} disabled={busy}
          role="checkbox" aria-checked={hecha}
          aria-label={hecha ? 'Desmarcar: vuelve a pendiente' : 'Marcar como hecha'}
          title={hecha ? 'Desmarcar (vuelve a pendiente)' : 'Marcar como hecha'}
          onClick={parar(onToggle)} />
        <div className="tar2-txt">
          <div className="bcard-title tar2-title">{t.title}</div>
          {t.description && <div className="bcard-sub tar2-desc">{t.description}</div>}
        </div>
      </div>
      <div className="bcard-foot tar2-foot">
        <span className="tar2-who">
          {t.assignee_username
            ? <><span className="av av-sm">{iniciales(t.assignee_username)}</span><span className="tar2-name">{t.assignee_username}</span></>
            : <span className="st st-muted">Sin asignar</span>}
        </span>
        {fecha}
      </div>
      {t.status === 'pending' && (
        <div className="tar2-step">
          <button type="button" className="btn-step" disabled={busy} onClick={parar(onStart)}>Empezar →</button>
        </div>
      )}
    </div>
  );
}

function TaskForm({ modal, users, onBack, onSaved }) {
  const editing = modal.mode === 'edit';
  const t = modal.task;
  const [title, setTitle] = useState(t ? t.title : '');
  const [description, setDescription] = useState(t && t.description ? t.description : '');
  const [assigned, setAssigned] = useState(t && t.assigned_to ? String(t.assigned_to) : '');
  const [dueDate, setDueDate] = useState(t ? dstr(t.due_date) : '');
  const [status, setStatus] = useState(t ? t.status : 'pending');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Si la tarea está asignada a alguien que ya no está activo, se conserva
  // como opción para no perder la asignación al guardar.
  const opciones = t && t.assigned_to && !users.some((u) => u.id === t.assigned_to)
    ? [...users, { id: t.assigned_to, username: (t.assignee_username || 'Trabajador') + ' (inactivo)', role: 'worker' }]
    : users;

  const save = async () => {
    setErr('');
    setLoading(true);
    try {
      const body = { title: title.trim(), description: description || null, assigned_to: assigned || null, due_date: dueDate || null };
      if (editing) { body.status = status; await api('/tasks/' + t.id, { method: 'PATCH', body }); }
      else await api('/tasks', { method: 'POST', body });
      onSaved();
    } catch (e) { setErr(e.message); setLoading(false); }
  };

  // Eliminar (antes era un botón en cada fila de la tabla).
  const remove = async () => {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    setErr('');
    setLoading(true);
    try { await api('/tasks/' + t.id, { method: 'DELETE' }); onSaved(); } catch (e) { setErr(e.message); setLoading(false); }
  };

  return (
    <FormPage title={editing ? 'Editar tarea' : 'Nueva tarea'} onBack={onBack} max={480}>
      {err && <div className="alert alert-error">{err}</div>}
      <label className="field"><span>Título</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="ej. Revisar inventario de iPhones" />
      </label>
      <label className="field"><span>Descripción (opcional)</span>
        <textarea rows="3" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="field"><span>Asignar a</span>
        <select value={assigned} onChange={(e) => setAssigned(e.target.value)}>
          <option value="">Sin asignar</option>
          {opciones.map((u) => <option key={u.id} value={u.id}>{u.username}{u.role === 'admin' ? ' (admin)' : ''}</option>)}
        </select>
      </label>
      <label className="field"><span>Fecha límite (opcional)</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>
      {editing && (
        <label className="field"><span>Estado</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En progreso</option>
            <option value="done">Hecha</option>
          </select>
        </label>
      )}
      <div className="row tar2-form-acts">
        {editing && (
          <button type="button" className="btn btn-ghost btn-sm tar2-del" onClick={remove} disabled={loading}>Eliminar tarea</button>
        )}
        <div className="spacer" />
        <button className="btn btn-secondary" onClick={onBack}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={loading || !title.trim()}>{loading ? <span className="spinner" /> : 'Guardar'}</button>
      </div>
    </FormPage>
  );
}
