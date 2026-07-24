import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const ROLE_LABEL = { admin: 'Admin', worker: 'Trabajador' };

export default function Workers() {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState(null); // { mode, user }
  const [temp, setTemp] = useState(null); // { username, password }

  const load = useCallback(() => {
    setErr('');
    api('/users').then((d) => setUsers(d.users)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="section-head">
        <h1>Trabajadores</h1>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ Nuevo trabajador</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}

      {users == null ? <span className="spinner spinner-lg" />
        : users.length === 0 ? <div className="card"><div className="empty">Aún no hay usuarios.</div></div>
          : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Usuario</th><th>Email</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td><strong>{u.username}</strong>{u.must_change_password && <span className="badge badge-pendiente" style={{ marginLeft: 8, fontSize: 10 }}>pendiente</span>}</td>
                      <td className="muted">{u.email || '—'}</td>
                      <td><span className={'badge badge-' + u.role}>{ROLE_LABEL[u.role]}</span></td>
                      <td><span className={'badge ' + (u.active ? 'badge-on' : 'badge-off')}>{u.active ? 'Activo' : 'Inactivo'}</span></td>
                      <td className="muted">{u.last_login ? new Date(u.last_login).toLocaleString('es') : 'Nunca'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setModal({ mode: 'edit', user: u })}>Gestionar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      {modal && (
        <WorkerModal
          modal={modal}
          onClose={() => setModal(null)}
          onSaved={(t) => { setModal(null); if (t) setTemp(t); load(); }}
        />
      )}

      {temp && (
        <Modal title="Contraseña temporal" onClose={() => setTemp(null)}
          footer={<button className="btn btn-primary" onClick={() => setTemp(null)}>Entendido</button>}>
          <p className="muted" style={{ marginTop: 0 }}>
            Comparte esta contraseña con <strong style={{ color: 'var(--text)' }}>{temp.username}</strong>. No se volverá a mostrar; la cambiará al entrar.
          </p>
          <div className="temp-pass">{temp.password}</div>
        </Modal>
      )}
    </>
  );
}

function WorkerModal({ modal, onClose, onSaved }) {
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

  return (
    <Modal
      title={editing ? 'Gestionar trabajador' : 'Nuevo trabajador'}
      onClose={onClose}
      footer={(
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={loading || (!editing && !username.trim())}>
            {loading ? <span className="spinner" /> : 'Guardar'}
          </button>
        </>
      )}
    >
      {err && <div className="alert alert-error">{err}</div>}
      {!editing
        ? <label className="field"><span>Usuario</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ej. juan.perez" autoFocus />
          </label>
        : <p className="muted" style={{ marginTop: 0 }}>Usuario: <strong style={{ color: 'var(--text)' }}>{u.username}</strong></p>}

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
        <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <button className="btn btn-danger btn-sm" onClick={resetPw} disabled={loading}>Restablecer contraseña</button>
        </div>
      )}
    </Modal>
  );
}
