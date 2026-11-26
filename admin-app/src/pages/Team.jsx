import './Team.css';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api } from '../api.js';
import PageHead from '../components/PageHead.jsx';
import { fechaCorta, diaCorto, diaKey, hoyKey, iniciales } from '../fechas.js';

/* Asistencia (ruta /equipo). Quién trabaja ahora y cuántas horas lleva cada
   uno hoy y en la semana (lun–dom, hora de Chicago). Todo se calcula en el
   cliente con los turnos de /time (últimos 7 días: alcanza justo para la
   semana en curso, por eso no hay flechas para semanas anteriores) más los
   turnos abiertos de /live/monitor, que se consulta cada 4 s. */

const TZ = 'America/Chicago';
const META_SEMANA = 40 * 3600; // barra de la semana contra 40 h
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const SCREEN_LABEL = { reloj: 'Reloj', tareas: 'Tareas', perfil: 'Perfil' };
const ACT_ICON = { clock_in: '●', clock_out: '○', task: '✓' };
const ACT_VISIBLES = 6;

// Duración con segundos (turno en curso, lista de turnos).
function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}
// Horas trabajadas: "8h", "6h 30m", "45m", "0h".
function fmtHM(sec) {
  const min = Math.floor(Math.max(0, sec) / 60);
  const h = Math.floor(min / 60); const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}
// "hace 12s" · "hace 5m" · "hace 2h" (feed en vivo, con segundos).
function haceSeg(atISO, now) {
  const s = Math.max(0, Math.round((now - new Date(atISO).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  return `hace ${Math.floor(s / 3600)}h`;
}
// Hora del negocio "16:57".
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hora = (v) => fmtHora.format(new Date(v));
const ms = (v) => new Date(v).getTime();

// Desfase (ms) de Chicago respecto a UTC en un instante dado.
const fmtPartes = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function desfase(t) {
  const p = fmtPartes.formatToParts(new Date(t)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return comoUTC - Math.floor(t / 1000) * 1000;
}
// Instante de la medianoche de Chicago de un día 'YYYY-MM-DD' (respeta el cambio de horario).
function medianoche(key) {
  const [y, m, d] = key.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - desfase(guess - desfase(guess));
}
const sumarDia = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
// Los 7 días (lun–dom) de la semana de un día dado, con su inicio y fin.
function semanaDe(hoy) {
  const [y, m, d] = hoy.split('-').map(Number);
  const desdeLunes = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const key = sumarDia(hoy, i - desdeLunes);
    return { key, ini: medianoche(key), fin: medianoche(sumarDia(key, 1)) };
  });
}
const clave = (s) => String(s || '').toLowerCase();

export default function Team() {
  const [mon, setMon] = useState(null);       // { working, online, activity }
  const [recent, setRecent] = useState(null); // turnos históricos (/time, 7 días)
  const [recentErr, setRecentErr] = useState('');
  const [users, setUsers] = useState(null);   // cuentas (para mostrar también a quien no ha fichado)
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const [verTodo, setVerTodo] = useState(false);
  const timer = useRef(null);
  const firma = useRef(null);

  const loadMonitor = useCallback(() => {
    api('/live/monitor').then((d) => { setMon(d); setErr(''); }).catch((e) => setErr(e.message));
  }, []);
  const loadRecent = useCallback(() => {
    api('/time').then((d) => { setRecent(d.recent || []); setRecentErr(''); })
      .catch((e) => setRecentErr(e.message || 'No se pudieron cargar los turnos.'));
  }, []);

  useEffect(() => {
    loadMonitor();
    loadRecent();
    api('/users').then((d) => setUsers(d.users || [])).catch(() => setUsers([]));
    timer.current = setInterval(loadMonitor, 4000); // sondeo "en vivo"
    return () => clearInterval(timer.current);
  }, [loadMonitor, loadRecent]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Cuando alguien ficha entrada o salida (cambia la lista de "trabajando"),
  // se recargan los turnos para que las horas de la semana queden al día.
  const firmaActual = mon ? mon.working.map((w) => w.id).sort().join(',') : null;
  useEffect(() => {
    if (firmaActual == null) return;
    if (firma.current != null && firma.current !== firmaActual) loadRecent();
    firma.current = firmaActual;
  }, [firmaActual, loadRecent]);

  const hoy = hoyKey();
  const semana = useMemo(() => semanaDe(hoy), [hoy]);
  const iHoy = semana.findIndex((d) => d.key === hoy);

  // Turnos = los de /time + los abiertos del monitor que no vengan ahí
  // (p. ej. alguien que olvidó fichar salida hace más de 7 días).
  const turnos = useMemo(() => {
    const list = [...(recent || [])];
    for (const w of (mon && mon.working) || []) {
      if (!list.some((e) => e.id === w.id)) list.push({ ...w, clock_out: null });
    }
    return list;
  }, [recent, mon]);

  // Horas por persona y por día (se cruza cada turno con cada día de la semana).
  const personas = useMemo(() => {
    const m = new Map();
    const asegurar = (username, extra = {}) => {
      const k = clave(username);
      if (!m.has(k)) m.set(k, { username, dias: Array(7).fill(0), semana: 0, salidaHoy: null, ...extra });
      return m.get(k);
    };
    // Trabajadores activos aunque esta semana no hayan fichado.
    for (const u of users || []) {
      if (u.active && u.role !== 'admin') asegurar(u.username, { role: u.role });
    }
    for (const e of turnos) {
      const p = asegurar(e.username);
      const ini = ms(e.clock_in);
      const fin = e.clock_out ? ms(e.clock_out) : now;
      semana.forEach((d, i) => {
        const s = Math.max(0, Math.min(fin, d.fin) - Math.max(ini, d.ini)) / 1000;
        p.dias[i] += s;
        p.semana += s;
      });
      if (e.clock_out && iHoy >= 0 && ms(e.clock_out) >= semana[iHoy].ini && (!p.salidaHoy || ms(e.clock_out) > ms(p.salidaHoy))) {
        p.salidaHoy = e.clock_out;
      }
    }
    for (const w of (mon && mon.working) || []) asegurar(w.username).turno = w;
    for (const o of (mon && mon.online) || []) asegurar(o.username).online = o;
    // Primero quien está trabajando (por hora de entrada), luego por nombre.
    return [...m.values()].sort((a, b) => {
      if (!!a.turno !== !!b.turno) return a.turno ? -1 : 1;
      if (a.turno && b.turno) return ms(a.turno.clock_in) - ms(b.turno.clock_in);
      return a.username.localeCompare(b.username);
    });
  }, [users, turnos, mon, semana, iHoy, now]);

  const totalSemana = personas.reduce((s, p) => s + p.semana, 0);
  const totalDia = semana.map((_, i) => personas.reduce((s, p) => s + p.dias[i], 0));
  const nTrab = mon ? mon.working.length : 0;
  const sub = mon == null ? 'Cargando…'
    : `${nTrab} trabajando ahora` + (recent != null ? ` · ${fmtHM(totalSemana)} esta semana` : '');
  const rango = `${diaCorto(semana[0].key)} – ${diaCorto(semana[6].key)}`;
  const actividad = mon ? (verTodo ? mon.activity : mon.activity.slice(0, ACT_VISIBLES)) : [];

  return (
    <div className="asi2">
      <PageHead title="Asistencia" sub={sub}>
        <span className="live-dot asi2-live" title="Actualiza cada 4s">● En vivo</span>
        <button className="btn btn-secondary btn-sm" onClick={() => { loadMonitor(); loadRecent(); }}>Actualizar</button>
      </PageHead>
      {err && <div className="alert alert-error">{err}</div>}
      {mon == null ? <span className="spinner spinner-lg" /> : (
        <>
          {/* Una tarjeta por trabajador */}
          {personas.length === 0
            ? <div className="empty-state asi2-empty">Todavía no hay trabajadores ni turnos registrados.</div>
            : (
              <div className="asi2-people">
                {personas.map((p) => <PersonaCard key={clave(p.username)} p={p} iHoy={iHoy} now={now} cargando={recent == null} />)}
              </div>
            )}

          {/* Tabla de la semana: horas por día y total por persona */}
          <section className="card asi2-week">
            <div className="asi2-sec-h">
              <h3>Horas de la semana</h3>
              <span className="asi2-range">Esta semana · {rango}</span>
            </div>
            {recentErr && recent == null ? <div className="muted">{recentErr}</div>
              : recent == null ? <span className="spinner" />
                : personas.length === 0 ? <div className="muted">Sin turnos registrados esta semana.</div> : (
                  <div className="asi2-tblwrap">
                    <table className="asi2-table">
                      <thead>
                        <tr>
                          <th>Trabajador</th>
                          {semana.map((d, i) => (
                            <th key={d.key} className={i === iHoy ? 'asi2-today' : ''} title={diaCorto(d.key)}>
                              {DIAS_CORTOS[i]}<small>{Number(d.key.slice(8))}</small>
                            </th>
                          ))}
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {personas.map((p) => (
                          <tr key={clave(p.username)}>
                            <td>{p.username}</td>
                            {p.dias.map((s, i) => (
                              <td key={i} className={(i === iHoy ? 'asi2-today ' : '') + (s < 60 ? 'asi2-zero' : '')}>{s >= 60 ? fmtHM(s) : '—'}</td>
                            ))}
                            <td className="asi2-total">{fmtHM(p.semana)}</td>
                          </tr>
                        ))}
                      </tbody>
                      {personas.length > 1 && (
                        <tfoot>
                          <tr>
                            <td>Equipo</td>
                            {totalDia.map((s, i) => (
                              <td key={i} className={(i === iHoy ? 'asi2-today ' : '') + (s < 60 ? 'asi2-zero' : '')}>{s >= 60 ? fmtHM(s) : '—'}</td>
                            ))}
                            <td className="asi2-total">{fmtHM(totalSemana)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
          </section>

          {/* Actividad en vivo (más compacta, abajo) */}
          <section className="card asi2-act">
            <div className="asi2-sec-h">
              <h3>Actividad en vivo</h3>
              {mon.activity.length > ACT_VISIBLES && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVerTodo((v) => !v)}>
                  {verTodo ? 'Ver menos' : `Ver todo (${mon.activity.length})`}
                </button>
              )}
            </div>
            {mon.activity.length === 0 ? <div className="muted">Sin actividad reciente.</div> : (
              <div className="activity-feed asi2-feed">
                {actividad.map((a, i) => (
                  <div key={i} className="activity-row">
                    <span className="activity-ico">{ACT_ICON[a.type] || '•'}</span>
                    <span className="activity-text"><strong>{a.username}</strong> {a.text}</span>
                    <span className="activity-time muted">{haceSeg(a.at, now)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Turnos de los últimos 7 días (detalle, plegado) */}
          <details className="card asi2-shifts">
            <summary>
              <h3>Turnos de los últimos 7 días{recent ? ` (${recent.length})` : ''}</h3>
              <span className="asi2-sum-hint">Ver detalle</span>
            </summary>
            {recent == null ? (recentErr ? <div className="muted">{recentErr}</div> : <span className="spinner" />)
              : recent.length === 0 ? <div className="muted">Sin turnos registrados.</div> : (
                <div className="table-wrap asi2-shifts-tbl">
                  <table className="data">
                    <thead><tr><th>Trabajador</th><th>Entrada</th><th>Salida</th><th>Duración</th></tr></thead>
                    <tbody>
                      {recent.map((e) => {
                        const inT = ms(e.clock_in);
                        const outT = e.clock_out ? ms(e.clock_out) : null;
                        return (
                          <tr key={e.id}>
                            <td>{e.username}</td>
                            <td className="muted">{fechaCorta(e.clock_in)}</td>
                            <td className="muted">{outT ? hora(e.clock_out) : <span className="st st-ok">en curso</span>}</td>
                            <td><strong>{fmtDur(((outT || now) - inT) / 1000)}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </details>
        </>
      )}
    </div>
  );
}

// Tarjeta de un trabajador: estado (punto verde si está fichado), horas de
// hoy y de la semana, y la barra de la semana contra 40 h.
function PersonaCard({ p, iHoy, now, cargando }) {
  const w = p.turno;
  const on = p.online;
  let estado;
  if (w) {
    const entroHoy = hoyKey() === diaKey(w.clock_in);
    estado = `Trabajando · entró ${entroHoy ? 'a las ' + hora(w.clock_in) : fechaCorta(w.clock_in)}`;
  } else if (p.salidaHoy) {
    estado = `Salió a las ${hora(p.salidaHoy)}`;
  } else {
    estado = 'Hoy no ha entrado';
  }
  const app = on
    ? (w ? `App abierta${on.screen ? ' · ' + (SCREEN_LABEL[on.screen] || on.screen) : ''}` : 'App abierta (sin fichar)')
    : (w ? 'App cerrada' : null);
  const hoySeg = iHoy >= 0 ? p.dias[iHoy] : 0;
  const pct = Math.min(100, (p.semana / META_SEMANA) * 100);

  return (
    <div className={'asi2-card' + (w ? ' asi2-on' : '')}>
      <div className="asi2-top">
        <span className="av">{iniciales(p.username)}</span>
        <div className="asi2-who">
          <div className="asi2-name">{p.username}</div>
          <div className="asi2-state">
            <span className={'asi2-dot' + (w ? ' on' : '')} aria-hidden="true" />
            {estado}
          </div>
          {app && <div className="asi2-app">{app}</div>}
        </div>
      </div>
      <div className="asi2-hrs">
        <span>Hoy <b>{cargando && !w ? '…' : fmtHM(hoySeg)}</b></span>
        <span>Semana <b>{cargando && !w ? '…' : fmtHM(p.semana)}</b></span>
      </div>
      <div className="asi2-bar" role="progressbar" aria-valuemin={0} aria-valuemax={40} aria-valuenow={Math.round(p.semana / 360) / 10}
        aria-label="Horas de la semana contra 40 h" title={`${fmtHM(p.semana)} de 40h esta semana`}>
        <i style={{ width: pct + '%' }} />
      </div>
      {w && <div className="asi2-shift">Turno en curso <b>{fmtDur((now - ms(w.clock_in)) / 1000)}</b></div>}
    </div>
  );
}

