import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const STATUS_LABEL = { pending: 'Pendiente', in_progress: 'En progreso', done: 'Hecha' };
const STATUS_BADGE = { pending: 'badge-pendiente', in_progress: 'badge-confirmada', done: 'badge-atendida' };
const dstr = (d) => (d ? String(d).slice(0, 10) : '');

export default function Tasks() {
  const [tasks, setTasks] = useState(null);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    setErr('');
    api('/tasks').then((d) => setTasks(d.tasks)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    api('/users').then((d) => setUsers(d.users.filter((u) => u.active))).catch(() => {});
  }, [load]);

  const remove = async (t) => {
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    try { await api('/tasks/' + t.id, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  };

  return (
    <>
      <div className="section-head">
        <h1>Tareas</h1>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ Nueva tarea</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      {tasks == null ? <span className="spinner spinner-lg" />
        : tasks.length === 0 ? <div className="card"><div className="empty">No hay tareas. Crea la primera.</div></div>
          : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Tarea</th><th>Asignada a</th><th>Estado</th><th>Para</th><th></th></tr></thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.title}</strong>{t.description && <div className="muted" style={{ fontSize: 12.5 }}>{t.description}</div>}</td>
                      <td>{t.assignee_username ? <span className="badge badge-worker">{t.assignee_username}</span> : <span className="muted">Sin asignar</span>}</td>
                      <td><span className={'badge ' + STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</span></td>
                      <td className="muted">{dstr(t.due_date) || '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ mode: 'edit', task: t })}>Editar</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      {modal && <TaskModal modal={modal} users={users} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </>
  );
}

function TaskModal({ modal, users, onClose, onSaved }) {
  const editing = modal.mode === 'edit';
  const t = modal.task;
  const [title, setTitle] = useState(t ? t.title : '');
  const [description, setDescription] = useState(t && t.description ? t.description : '');
  const [assigned, setAssigned] = useState(t && t.assigned_to ? String(t.assigned_to) : '');
  const [dueDate, setDueDate] = useState(t ? dstr(t.due_date) : '');
  const [status, setStatus] = useState(t ? t.status : 'pending');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <Modal title={editing ? 'Editar tarea' : 'Nueva tarea'} onClose={onClose}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={loading || !title.trim()}>{loading ? <span className="spinner" /> : 'Guardar'}</button>
        </>
      )}>
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
          {users.map((u) => <option key={u.id} value={u.id}>{u.username}{u.role === 'admin' ? ' (admin)' : ''}</option>)}
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
    </Modal>
  );
}
