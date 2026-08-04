import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import ChangePasswordForm from '../components/ChangePasswordForm.jsx';

// Restos de la antigua "Simulación (demo)". La tarjeta solo aparece si aún
// queda algo demo en la base; al borrarlo desaparece sola y no vuelve.
function DemoDataCard() {
  const [counts, setCounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/demo-data').then((d) => setCounts(d.counts)).catch(() => setCounts({ total: 0 }));
  }, []);

  if (!counts || !counts.total) return null;

  const purge = async () => {
    if (!window.confirm('¿Eliminar TODOS los datos de demostración? Se borran las reparaciones y citas con teléfono (205) 555-xxxx, el inventario DEMO-* y los usuarios demo.*. Los datos reales no se tocan.')) return;
    setBusy(true);
    setErr('');
    try {
      const d = await api('/demo-data', { method: 'DELETE' });
      setCounts(d.counts);
      const x = d.deleted || {};
      window.alert(`Eliminado: ${x.repairs || 0} reparaciones, ${x.citas || 0} citas, ${x.items || 0} productos y ${x.workers || 0} trabajadores de prueba.`);
      window.location.reload();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 440, marginTop: 18 }}>
      <h3>Datos de demostración</h3>
      {err && <div className="alert alert-error">{err}</div>}
      <p className="muted" style={{ margin: '0 0 12px' }}>
        Quedan {counts.repairs} reparaciones, {counts.citas} citas, {counts.items} productos y {counts.workers} trabajadores de prueba.
        Al eliminarlos, el panel queda solo con información real.
      </p>
      <button className="btn btn-danger btn-sm" onClick={purge} disabled={busy}>
        {busy ? <span className="spinner" /> : 'Eliminar datos de demostración'}
      </button>
    </div>
  );
}

export default function Settings({ forced }) {
  const { user, logout } = useAuth();

  if (forced) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="brand"><img className="brand-logo" src="/x/static/img/logo-cruise.png" alt="ElectronicST" /><strong>ElectronicST</strong></div>
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
      <div className="card" style={{ maxWidth: 440 }}>
        <h3>Cambiar mi contraseña</h3>
        <ChangePasswordForm />
      </div>
      <div className="card" style={{ maxWidth: 440, marginTop: 18 }}>
        <h3>Mi cuenta</h3>
        <p className="muted" style={{ margin: '0 0 6px' }}>Usuario: <strong style={{ color: 'var(--text)' }}>{user.username}</strong></p>
        <p className="muted" style={{ margin: 0 }}>Rol: {user.role === 'admin' ? 'Administrador' : 'Trabajador'}</p>
      </div>
      {user.role === 'admin' && <DemoDataCard />}
    </>
  );
}
