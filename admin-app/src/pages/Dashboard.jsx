import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiRoot } from '../api.js';
import BarChart from '../components/BarChart.jsx';

// Fecha "de negocio": el taller opera en hora de Chicago.
function chicagoKey(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

// Claves YYYY-MM-DD de la semana actual (lunes a domingo), en hora de Chicago.
// La aritmética se hace en UTC para no arrastrar el huso local del navegador.
function currentWeekKeys() {
  const [y, m, d] = chicagoKey().split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function StatIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function Stat({ k, v, icon, to }) {
  const body = (
    <>
      <div className="stat-top">
        <div className="k">{k}</div>
        <div className="stat-ico"><StatIcon>{icon}</StatIcon></div>
      </div>
      <div className="v">{v == null ? <span className="spinner" /> : v}</div>
    </>
  );
  if (to) return <Link to={to} className="stat-card stat-link">{body}</Link>;
  return <div className="stat-card">{body}</div>;
}

// Pastel (dona) SVG simple: compara dos o más valores con leyenda.
function Donut({ slices }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 140 140" className="donut" role="img" aria-label="Gráfico de pastel">
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f0f0f2" strokeWidth="20" />
          {total > 0 && slices.map((s, i) => {
            const frac = s.value / total;
            const el = (
              <circle key={i} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="20"
                strokeDasharray={`${Math.max(0, frac * C - 2)} ${C}`} strokeDashoffset={-acc * C}
                className="donut-slice" style={{ animationDelay: `${i * 160}ms` }} />
            );
            acc += frac;
            return el;
          })}
        </g>
        <text x="70" y="68" textAnchor="middle" className="donut-total">{total}</text>
        <text x="70" y="84" textAnchor="middle" className="donut-lbl">esta semana</text>
      </svg>
      <div className="pie-legend">
        {slices.map((s, i) => (
          <div key={i} className="pie-row">
            <span className="pie-dot" style={{ background: s.color }} />
            <span className="pie-name">{s.label}</span>
            <span className="pie-val">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState(null);
  const [appts, setAppts] = useState(null);
  const [weekAppts, setWeekAppts] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [err, setErr] = useState('');
  const [simBusy, setSimBusy] = useState(false);

  // TEMPORAL: botón de simulación (quitar cuando el dueño termine la prueba).
  const simulate = async () => {
    if (!window.confirm('¿Cargar datos de demostración? Crea trabajadores, reparaciones, ventas, citas e inventario de prueba.')) return;
    setSimBusy(true);
    try {
      const d = await api('/simulate', { method: 'POST' });
      const c = d.created || {};
      window.alert(`Datos creados: ${c.repairs || 0} reparaciones, ${c.citas || 0} citas, ${c.items || 0} productos, ${c.workers || 0} trabajadores nuevos.`);
      window.location.reload();
    } catch (e) {
      setErr(e.message);
      setSimBusy(false);
    }
  };

  useEffect(() => {
    api('/users').then((d) => setUsers(d.users)).catch((e) => setErr(e.message));
    apiRoot('/api/appointments?date=' + chicagoKey())
      .then((d) => setAppts(d.citas || []))
      .catch(() => setAppts([]));
    apiRoot('/api/appointments')
      .then((d) => setWeekAppts(d.citas || []))
      .catch(() => setWeekAppts([]));
    api('/repairs').then((d) => setTickets(d.tickets || [])).catch(() => setTickets([]));
    api('/inventory').then((d) => setInventory(d.items || [])).catch(() => setInventory([]));
  }, []);

  const weekKeys = currentWeekKeys();
  const inWeek = (key) => weekKeys.includes(key);

  const workers = users ? users.filter((u) => u.role === 'worker').length : null;

  // Reparaciones creadas esta semana.
  const weekRepairs = tickets ? tickets.filter((t) => inWeek(chicagoKey(new Date(t.created_at)))) : null;

  // Ventas de la semana: tickets entregados, sumando final_price por día.
  let salesByDay = null;
  let salesTotal = null;
  if (tickets) {
    salesByDay = weekKeys.map(() => 0);
    for (const t of tickets) {
      if (t.status !== 'entregado' || !t.delivered_at) continue;
      const idx = weekKeys.indexOf(chicagoKey(new Date(t.delivered_at)));
      if (idx >= 0) salesByDay[idx] += Number(t.final_price) || 0;
    }
    salesTotal = salesByDay.reduce((a, b) => a + b, 0);
  }

  // Ventas de hoy en $ y conteos semanales para el pastel.
  const todayKey = chicagoKey();
  let salesToday = null;
  let weekSalesCount = null;
  let weekOpenCount = null;
  if (tickets) {
    salesToday = tickets
      .filter((t) => t.status === 'entregado' && t.delivered_at && chicagoKey(new Date(t.delivered_at)) === todayKey)
      .reduce((a, t) => a + (Number(t.final_price) || 0), 0);
    weekSalesCount = tickets.filter((t) => t.status === 'entregado' && t.delivered_at && inWeek(chicagoKey(new Date(t.delivered_at)))).length;
    weekOpenCount = weekRepairs.filter((t) => t.status !== 'entregado').length;
  }

  // Citas por día de la semana.
  let apptsByDay = null;
  let apptsTotal = null;
  if (weekAppts) {
    apptsByDay = weekKeys.map(() => 0);
    for (const c of weekAppts) {
      const idx = weekKeys.indexOf(String(c.fecha).slice(0, 10));
      if (idx >= 0) apptsByDay[idx] += 1;
    }
    apptsTotal = apptsByDay.reduce((a, b) => a + b, 0);
  }

  return (
    <div className="dashboard">
      {err && <div className="alert alert-error">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-secondary btn-sm" onClick={simulate} disabled={simBusy}>
          {simBusy ? <span className="spinner" /> : 'Simulación (demo)'}
        </button>
      </div>
      <div className="stat-grid">
        <Stat k="Ventas de hoy" v={salesToday == null ? null : usd.format(salesToday)} to="/ventas"
          icon={<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>} />
        <Stat k="Trabajadores" v={workers} to="/trabajadores"
          icon={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />
        <Stat k="Reparaciones esta semana" v={weekRepairs ? weekRepairs.length : null} to="/reparaciones"
          icon={<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></>} />
        <Stat k="Total de inventario" v={inventory ? inventory.reduce((a, i) => a + (i.stock || 0), 0) : null} to="/inventario"
          icon={<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>} />
      </div>
      <div className="dash-layout">
        <div className="dash-main">
          <div className="chart-grid">
            <div className="card">
              <h3><Link to="/ventas" className="chart-link">Ventas de la semana →</Link>{salesTotal != null && <span className="chart-total">{usd.format(salesTotal)}</span>}</h3>
              {salesByDay == null ? <span className="spinner" />
                : <BarChart data={salesByDay} keys={weekKeys} labels={DAY_LABELS} highlight={chicagoKey()} height={210}
                    format={(v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0))}
                    onDay={(key) => navigate('/ventas?fecha=' + key)} />}
            </div>
            <div className="card">
              <h3>Citas de la semana{apptsTotal != null && <span className="chart-total">{apptsTotal}</span>}</h3>
              {apptsByDay == null ? <span className="spinner" />
                : <BarChart data={apptsByDay} keys={weekKeys} labels={DAY_LABELS} highlight={chicagoKey()} height={210}
                    format={(v) => String(v)}
                    onDay={(key) => navigate('/citas?fecha=' + key)} />}
            </div>
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
        </div>
        <div className="card">
          <h3>Ventas vs reparaciones (semana)</h3>
          {weekSalesCount == null ? <span className="spinner" />
            : weekSalesCount + weekOpenCount === 0 ? <div className="empty">Sin datos esta semana.</div>
              : (
                <Donut slices={[
                  { label: 'Ventas (entregadas)', value: weekSalesCount, color: '#111111' },
                  { label: 'Reparaciones en proceso', value: weekOpenCount, color: '#cfcfd6' },
                ]} />
              )}
        </div>
      </div>
    </div>
  );
}
