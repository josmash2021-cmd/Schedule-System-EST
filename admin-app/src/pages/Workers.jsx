import './Workers.css';
import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import FormPage from '../components/FormPage.jsx';
import PageHead from '../components/PageHead.jsx';
import { hace, iniciales } from '../fechas.js';

const ROLE_LABEL = { admin: 'Admin', worker: 'Trabajador' };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export default function Workers() {
  const { user: yo } = useAuth() || {};
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null); // { mode, user }
  const [temp, setTemp] = useState(null); // { username, password }
  const [busy, setBusy] = useState({}); // { [id]: true } mientras cambia Activo/Inactivo

  const load = useCallback(() => {
    setErr('');
    api('/users').then((d) => setUsers(d.users)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Interruptor Activo/Inactivo de la tarjeta: es el mismo PATCH que el campo
  // "Estado" de Gestionar. El servidor impide desactivarse a uno mismo y
  // dejar el sistema sin administradores activos (muestra su mensaje).
  const setActivo = async (u, active) => {
    if (busy[u.id]) return;
    if (!active && !window.confirm(`¿Desactivar a "${u.username}"?\n\nYa no podrá entrar al panel hasta que lo vuelvas a activar. Su historial no se borra.`)) return;
    setErr('');
    setBusy((b) => ({ ...b, [u.id]: true }));
    try {
      const res = await api('/users/' + u.id, { method: 'PATCH', body: { active } });
      setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, ...(res && res.user ? res.user : {}), active } : x)));
    } catch (e) { setErr(e.message); }
    setBusy((b) => { const n = { ...b }; delete n[u.id]; return n; });
  };

  // Formulario a página completa (sin modal).
  if (modal) {
    return (
      <WorkerForm
        modal={modal}
        onBack={() => setModal(null)}
        onSaved={(t) => { setModal(null); if (t) setTemp(t); load(); }}
      />
    );
  }

  // Contraseña temporal: también a página completa centrada.
  if (temp) {
    return (
      <FormPage title="Contraseña temporal" onBack={() => setTemp(null)} max={440}>
        <p className="muted" style={{ marginTop: 0 }}>
          Comparte esta contraseña con <strong>{temp.username}</strong>. No se volverá a mostrar; la cambiará al entrar.
        </p>
        <div className="temp-pass">{temp.password}</div>
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={() => setTemp(null)}>Entendido</button>
        </div>
      </FormPage>
    );
  }

  const lista = users || [];
  const nAct = lista.filter((u) => u.active).length;
  const nPw = lista.filter((u) => u.must_change_password).length;
  const sub = users == null ? 'Cargando…'
    : [plural(lista.length, 'cuenta', 'cuentas'), plural(nAct, 'activa', 'activas'),
      nPw ? `${nPw} ${nPw === 1 ? 'debe' : 'deben'} cambiar su contraseña` : null].filter(Boolean).join(' · ');

  return (
    <div className="tra2">
      <PageHead title="Trabajadores" sub={sub}>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ Nuevo trabajador</button>
      </PageHead>
      {err && <div className="alert alert-error">{err}</div>}

      {users == null ? <span className="spinner spinner-lg" />
        : users.length === 0 ? <div className="empty-state">Aún no hay usuarios. Crea el primero con <strong>+ Nuevo trabajador</strong>.</div>
          : (
            <div className="tra2-grid">
              {lista.map((u) => {
                const soyYo = yo && yo.id === u.id;
                return (
                  <div key={u.id} className={'tra2-card' + (u.active ? '' : ' tra2-off')}>
                    <div className="tra2-top">
                      <span className="av">{iniciales(u.username)}</span>
                      <div className="tra2-who">
                        <div className="tra2-line">
                          <span className="tra2-name">{u.username}{soyYo && <span className="tra2-me"> · tú</span>}</span>
                          <span className={'st ' + (u.role === 'admin' ? 'st-strong' : 'st-muted') + ' tra2-role'}>{ROLE_LABEL[u.role] || u.role}</span>
                        </div>
                        <div className="tra2-sub">{u.last_login ? `Último acceso ${hace(u.last_login)}` : 'Todavía no ha entrado'}</div>
                        {u.email && <div className="tra2-mail" title={u.email}>{u.email}</div>}
                      </div>
                    </div>
                    {u.must_change_password && (
                      <div className="tra2-tags"><span className="st st-warn tra2-pw">Debe cambiar su contraseña</span></div>
                    )}
                    <div className="tra2-foot">
                      <label className={'tra2-sw-wrap' + (soyYo ? ' tra2-locked' : '')}
                        title={soyYo ? 'No puedes desactivar tu propia cuenta' : (u.active ? 'Desactivar la cuenta' : 'Activar la cuenta')}>
                        <button type="button" role="switch" aria-checked={!!u.active}
                          aria-label={(u.active ? 'Desactivar' : 'Activar') + ' a ' + u.username}
                          className={'tra2-sw' + (u.active ? ' on' : '')}
                          disabled={soyYo || !!busy[u.id]}
                          onClick={() => setActivo(u, !u.active)} />
                        <span className="tra2-sw-l">{u.active ? 'Activo' : 'Inactivo'}</span>
                      </label>
                      <button className="btn btn-secondary btn-sm" onClick={() => setModal({ mode: 'edit', user: u })}>Gestionar</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
    </div>
  );
}

function WorkerForm({ modal, onBack, onSaved }) {
  const editing = modal.mode === 'edit';
  const u = modal.user;
  const [username, setUsername] = useState(u ? u.username : '');
  const [email, setEmail] = useState(u && u.email ? u.email : '');
  const [role, setRole] = useState(u ? u.role : 'worker');
  const [active, setActive] = useState(u ? u.active : true);
  const [customPw, setCustomPw] = useState(false);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setErr('');
    setLoading(true);
    try {
      if (editing) {
        await api('/users/' + u.id, { method: 'PATCH', body: { email: email || null, role, active } });
        onSaved();
      } else {
        const body = { username: username.trim().toLowerCase(), email: email || null, role };
        if (password) body.password = password;
        const res = await api('/users', { method: 'POST', body });
        onSaved(res.tempPassword ? { username: res.user.username, password: res.tempPassword } : null);
      }
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  };

  const resetPw = async () => {
    setErr('');
    setLoading(true);
    try {
      const res = await api('/users/' + u.id + '/reset-password', { method: 'POST' });
      onSaved({ username: u.username, password: res.tempPassword });
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  };

  // Borrado definitivo. El historial (reparaciones, tareas, ventas) no se
  // borra: esas filas quedan sin trabajador asignado.
  const removeUser = async () => {
    if (!window.confirm(`¿Eliminar a "${u.username}" definitivamente?\n\nPierde el acceso al panel y sus fichajes se borran. Las reparaciones, tareas y ventas que hizo NO se borran: quedan sin trabajador asignado.\n\nSi solo quieres quitarle el acceso, ponlo como Inactivo.`)) return;
    setErr('');
    setLoading(true);
    try {
      await api('/users/' + u.id, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  };

  return (
    <FormPage title={editing ? 'Gestionar trabajador' : 'Nuevo trabajador'} onBack={onBack} max={480}>
      {err && <div className="alert alert-error">{err}</div>}
      {!editing
        ? <label className="field"><span>Usuario</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ej. juan.perez" autoFocus />
          </label>
        : <p className="muted" style={{ marginTop: 0 }}>Usuario: <strong>{u.username}</strong></p>}

      <label className="field"><span>Email (opcional)</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field"><span>Rol</span>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="worker">Trabajador</option>
          <option value="admin">Administrador</option>
        </select>
      </label>

      {editing && (
        <label className="field"><span>Estado</span>
          <select value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
        </label>
      )}

      {!editing && (
        customPw
          ? <label className="field"><span>Contraseña (mín. 10)</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          : (
            <p className="muted" style={{ fontSize: 13 }}>
              Se generará una contraseña temporal automáticamente.{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCustomPw(true)}>Definir una yo</button>
            </p>
          )
      )}

      {editing && (
        <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid rgba(0, 0, 0, 0.1)' }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-danger btn-sm" onClick={resetPw} disabled={loading}>Restablecer contraseña</button>
            <button className="btn btn-danger btn-sm" onClick={removeUser} disabled={loading}>Eliminar trabajador</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            Eliminar es definitivo. Para quitarle el acceso sin borrarlo, ponlo como Inactivo.
          </p>
        </div>
      )}

      <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onBack}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={loading || (!editing && !username.trim())}>
          {loading ? <span className="spinner" /> : 'Guardar'}
        </button>
      </div>
    </FormPage>
  );
}
