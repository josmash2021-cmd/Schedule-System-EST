import { useEffect, useState } from 'react';
import { api, apiRoot } from '../api.js';

function todayChicago() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

function StatIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function Stat({ k, v, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <div className="k">{k}</div>
        <div className="stat-ico"><StatIcon>{icon}</StatIcon></div>
      </div>
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
        <Stat k="Trabajadores" v={workers}
          icon={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />
        <Stat k="Administradores" v={admins}
          icon={<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>} />
        <Stat k="Cuentas activas" v={active}
          icon={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>} />
        <Stat k="Citas hoy" v={appts ? appts.length : null}
          icon={<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>} />
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
