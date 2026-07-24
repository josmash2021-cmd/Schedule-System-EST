import { useEffect, useState } from 'react';
import { api, apiRoot } from '../api.js';

function todayChicago() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

function Stat({ k, v }) {
  return (
    <div className="stat-card">
      <div className="k">{k}</div>
      <div className="v">{v == null ? <span className="spinner" /> : v}</div>
    </div>
  );
}

export default function Dashboard() {
  const [users, setUsers] = useState(null);
  const [appts, setAppts] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/users').then((d) => setUsers(d.users)).catch((e) => setErr(e.message));
    apiRoot('/api/appointments?date=' + todayChicago())
      .then((d) => setAppts(d.citas || []))
      .catch(() => setAppts([]));
  }, []);

  const workers = users ? users.filter((u) => u.role === 'worker').length : null;
  const admins = users ? users.filter((u) => u.role === 'admin').length : null;
  const active = users ? users.filter((u) => u.active).length : null;

  return (
    <>
      <div className="section-head"><h1>Resumen</h1></div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="stat-grid">
        <Stat k="Trabajadores" v={workers} />
        <Stat k="Administradores" v={admins} />
        <Stat k="Cuentas activas" v={active} />
        <Stat k="Citas hoy" v={appts ? appts.length : null} />
      </div>
      <div className="card">
        <h3>Citas de hoy</h3>
        {appts == null ? <span className="spinner" />
          : appts.length === 0 ? <div className="empty">No hay citas para hoy.</div>
            : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Estado</th></tr></thead>
                  <tbody>
                    {[...appts].sort((a, b) => (a.hora > b.hora ? 1 : -1)).map((c, i) => (
                      <tr key={i}>
                        <td>{String(c.hora).slice(0, 5)}</td>
                        <td>{c.nombre}</td>
                        <td className="muted">{c.servicio}</td>
                        <td><span className={'badge badge-' + c.estado}>{c.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </>
  );
}
