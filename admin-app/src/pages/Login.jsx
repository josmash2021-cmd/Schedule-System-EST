import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión.');
      setShake(true);
      setTimeout(() => setShake(false), 400);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className={'login-card' + (shake ? ' shake' : '')} onSubmit={submit}>
        <div className="brand"><img className="brand-logo" src="/api/admin/static/img/logo-dark.png" alt="ElectronicST" /><strong>ElectronicST</strong></div>
        <h1>Panel de gestión</h1>
        <p className="sub">Ingresa con tu cuenta.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field"><span>Usuario</span>
          <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label className="field"><span>Contraseña</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button className="btn btn-primary btn-block" disabled={loading || !username || !password}>
          {loading ? <span className="spinner" /> : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
