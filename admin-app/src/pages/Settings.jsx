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

// Dónde deja el dueño los paquetes de cada paquetería. El seguimiento que ve
// el cliente lo muestra como la parada "Dejado en …" del recorrido y como
// pin en el mapa. Si una queda vacía, el mapa sale de la tienda directo.
const PAQUETERIAS = [
  ['usps', 'USPS', 'Oficina de correos de Hoover'],
  ['ups', 'UPS', 'The UPS Store de Hoover'],
  ['fedex', 'FedEx', 'FedEx Office de Hoover'],
  ['dhl', 'DHL', 'Punto DHL de Hoover'],
];
function DropoffsCard() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    api('/settings/dropoffs').then((d) => setData(d.dropoffs)).catch((e) => setErr(e.message));
  }, []);

  const campo = (c, k, v) => { setOk(''); setData((d) => ({ ...d, [c]: { ...d[c], [k]: v } })); };
  const guardar = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(''); setOk('');
    try {
      const d = await api('/settings/dropoffs', { method: 'PUT', body: { dropoffs: data } });
      setData(d.dropoffs);
      setOk('Guardado. Los clientes ya lo ven en su seguimiento.');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 560, marginTop: 18 }}>
      <h3>¿Dónde dejas los paquetes?</h3>
      <p className="muted" style={{ margin: '0 0 12px' }}>
        La oficina de cada paquetería donde dejas los envíos. El cliente la ve en su seguimiento como la parada
        "Dejado en…" y en el mapa. Si dejas una vacía, el mapa sale directo de la tienda.
      </p>
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}
      {!data ? (!err && <span className="spinner" />) : (
        <form onSubmit={guardar}>
          {PAQUETERIAS.map(([c, nombre, ej]) => (
            <fieldset key={c} className="drop-row">
              <legend>{nombre}</legend>
              <label className="field"><span>Nombre de la oficina</span>
                <input value={data[c]?.name || ''} maxLength={200} placeholder={ej}
                  onChange={(e) => campo(c, 'name', e.target.value)} />
              </label>
              <label className="field"><span>Dirección</span>
                <input value={data[c]?.address || ''} maxLength={200} placeholder="Calle, ciudad, estado y código postal"
                  onChange={(e) => campo(c, 'address', e.target.value)} />
              </label>
            </fieldset>
          ))}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Guardar'}
          </button>
        </form>
      )}
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
        <p className="muted" style={{ margin: '0 0 6px' }}>Usuario: <strong style={{ color: '#111' }}>{user.username}</strong></p>
        <p className="muted" style={{ margin: 0 }}>Rol: {user.role === 'admin' ? 'Administrador' : 'Trabajador'}</p>
      </div>
      {user.role === 'admin' && <DropoffsCard />}
      {user.role === 'admin' && <DemoDataCard />}
    </>
  );
}
