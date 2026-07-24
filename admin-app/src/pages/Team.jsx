import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export default function Team() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => { api('/time').then(setData).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  return (
    <>
      <div className="section-head">
        <h1>Equipo</h1>
        <div className="spacer" />
        <button className="btn btn-secondary btn-sm" onClick={load}>Actualizar</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      {data == null ? <span className="spinner spinner-lg" /> : (
        <>
          <div className="card" style={{ marginBottom: 18 }}>
            <h3>Trabajando ahora ({data.open.length})</h3>
            {data.open.length === 0 ? <div className="muted">Nadie está fichado en este momento.</div> : (
              <div className="stat-grid" style={{ marginBottom: 0 }}>
                {data.open.map((o) => (
                  <div key={o.id} className="stat-card">
                    <div className="k">{o.username}</div>
                    <div className="v" style={{ fontSize: 22 }}>{fmtDur((now - new Date(o.clock_in).getTime()) / 1000)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>desde {new Date(o.clock_in).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <h3>Turnos recientes (7 días)</h3>
            {data.recent.length === 0 ? <div className="muted">Sin turnos registrados.</div> : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Trabajador</th><th>Entrada</th><th>Salida</th><th>Duración</th></tr></thead>
                  <tbody>
                    {data.recent.map((e) => {
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
