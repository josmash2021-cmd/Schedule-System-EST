import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';

export default function WorkerHome() {
  const { user, logout } = useAuth();
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand"><img className="brand-logo" src="/api/admin/static/img/logo-cruise.png" alt="ElectronicST" /><strong>ElectronicST</strong></div>
        <h1>Hola, {user.username}</h1>
        <p className="sub">Tu app de trabajador estará disponible muy pronto. Por ahora puedes gestionar tu cuenta.</p>
        {showPw
          ? <ChangePasswordForm onDone={() => setShowPw(false)} />
          : <button className="btn btn-secondary btn-block" onClick={() => setShowPw(true)}>Cambiar mi contraseña</button>}
        <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 12 }} onClick={() => logout()}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
