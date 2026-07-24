import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';

function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}
function hace(atISO, now) {
  const s = Math.max(0, Math.round((now - new Date(atISO).getTime()) / 1000));
  if (s < 60) return `hace ${s}s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)}m`;
  return `hace ${Math.floor(s / 3600)}h`;
}
const SCREEN_LABEL = { reloj: 'Reloj', tareas: 'Tareas', perfil: 'Perfil' };
const ACT_ICON = { clock_in: '●', clock_out: '○', task: '✓' };

export default function Team() {
  const [mon, setMon] = useState(null);       // { working, online, activity }
  const [recent, setRecent] = useState(null); // turnos históricos (/time)
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());
  const timer = useRef(null);

  const loadMonitor = useCallback(() => {
    api('/live/monitor').then(setMon).catch((e) => setErr(e.message));
  }, []);
  const loadRecent = useCallback(() => {
    api('/time').then((d) => setRecent(d.recent)).catch(() => {});
  }, []);

  useEffect(() => {
    loadMonitor();
    loadRecent();
    timer.current = setInterval(loadMonitor, 4000); // sondeo "en vivo"
    return () => clearInterval(timer.current);
  }, [loadMonitor, loadRecent]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const onlineOf = (userId) => mon && mon.online.find((o) => o.userId === userId);
  const onlineNotWorking = mon ? mon.online.filter((o) => !mon.working.some((w) => w.user_id === o.userId)) : [];

  return (
    <>
      <div className="section-head">
        <h1>Equipo</h1>
        <span className="live-dot" title="Actualiza cada 4s">● En vivo</span>
        <div className="spacer" />
        <button className="btn btn-secondary btn-sm" onClick={() => { loadMonitor(); loadRecent(); }}>Actualizar</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      {mon == null ? <span className="spinner spinner-lg" /> : (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Trabajando ahora ({mon.working.length})</h3>
            {mon.working.length === 0 ? <div className="muted">Nadie está fichado en este momento.</div> : (
              <div className="stat-grid" style={{ marginBottom: 0 }}>
                {mon.working.map((w) => {
                  const on = onlineOf(w.user_id);
                  return (
                    <div key={w.id} className="stat-card">
                      <div className="k">{w.username}</div>
                      <div className="v" style={{ fontSize: 22 }}>{fmtDur((now - new Date(w.clock_in).getTime()) / 1000)}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        {on
                          ? <span style={{ color: 'var(--ok)' }}>● en línea{on.screen ? ' · ' + (SCREEN_LABEL[on.screen] || on.screen) : ''}</span>
                          : <span className="muted">app cerrada</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {onlineNotWorking.length > 0 && (
              <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>
                También con la app abierta (sin fichar): {onlineNotWorking.map((o) => o.username).join(', ')}
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Actividad en vivo</h3>
            {mon.activity.length === 0 ? <div className="muted">Sin actividad reciente.</div> : (
              <div className="activity-feed">
                {mon.activity.map((a, i) => (
                  <div key={i} className="activity-row">
                    <span className="activity-ico">{ACT_ICON[a.type] || '•'}</span>
                    <span className="activity-text"><strong>{a.username}</strong> {a.text}</span>
                    <span className="activity-time muted">{hace(a.at, now)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3>Turnos recientes (7 días)</h3>
            {recent == null ? <span className="spinner" />
              : recent.length === 0 ? <div className="muted">Sin turnos registrados.</div> : (
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th>Trabajador</th><th>Entrada</th><th>Salida</th><th>Duración</th></tr></thead>
                    <tbody>
                      {recent.map((e) => {
                        const inT = new Date(e.clock_in);
                        const outT = e.clock_out ? new Date(e.clock_out) : null;
                        const dur = (outT ? outT.getTime() : now) - inT.getTime();
                        return (
                          <tr key={e.id}>
                            <td>{e.username}</td>
                            <td className="muted">{inT.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="muted">{outT ? outT.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : <span className="badge badge-on">en curso</span>}</td>
                            <td><strong>{fmtDur(dur / 1000)}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </>
      )}
    </>
  );
}
