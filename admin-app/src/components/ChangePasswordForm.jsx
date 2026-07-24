import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api, setToken } from '../api.js';

export default function ChangePasswordForm({ onDone }) {
  const { setUser } = useAuth();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [cf, setCf] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setOk('');
    if (nw.length < 10) { setErr('La nueva contraseña debe tener al menos 10 caracteres.'); return; }
    if (nw !== cf) { setErr('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    try {
      const res = await api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: nw } });
      // El token viejo quedó revocado; guardar el nuevo y refrescar el usuario.
      setToken(res.token);
      setUser(res.user);
      setOk('Contraseña actualizada correctamente.');
      setCur(''); setNw(''); setCf('');
      if (onDone) onDone();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}
      <label className="field"><span>Contraseña actual</span>
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
      </label>
      <label className="field"><span>Nueva contraseña (mín. 10)</span>
        <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="field"><span>Repetir nueva contraseña</span>
        <input type="password" value={cf} onChange={(e) => setCf(e.target.value)} autoComplete="new-password" />
      </label>
      <button className="btn btn-primary" disabled={loading || !cur || !nw}>
        {loading ? <span className="spinner" /> : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
