import { useAuth } from '../auth.jsx';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';

export default function Settings({ forced }) {
  const { user, logout } = useAuth();

  if (forced) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand"><img className="brand-logo" src="/api/admin/static/img/logo-cruise.png" alt="ElectronicST" /><strong>ElectronicST</strong></div>
          <h1>Cambia tu contraseña</h1>
          <p className="sub">Tu cuenta usa una contraseña temporal. Define una nueva para continuar.</p>
          <ChangePasswordForm />
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => logout()}>
            Cancelar y salir
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="section-head"><h1>Ajustes</h1></div>
      <div className="card" style={{ maxWidth: 440 }}>
        <h3>Cambiar mi contraseña</h3>
        <ChangePasswordForm />
      </div>
      <div className="card" style={{ maxWidth: 440, marginTop: 18 }}>
        <h3>Mi cuenta</h3>
        <p className="muted" style={{ margin: '0 0 6px' }}>Usuario: <strong style={{ color: 'var(--text)' }}>{user.username}</strong></p>
        <p className="muted" style={{ margin: 0 }}>Rol: {user.role === 'admin' ? 'Administrador' : 'Trabajador'}</p>
      </div>
    </>
  );
}
