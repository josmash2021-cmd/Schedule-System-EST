import { useEffect, useState, useCallback } from 'react';
import { apiRoot } from '../api.js';

const ESTADOS = ['pendiente', 'confirmada', 'atendida', 'cancelada'];

function todayChicago() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

export default function Appointments() {
  const [date, setDate] = useState(todayChicago());
  const [all, setAll] = useState(false);
  const [citas, setCitas] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    setErr('');
    setCitas(null);
    const q = all ? '' : ('?date=' + date);
    apiRoot('/api/appointments' + q)
      .then((d) => setCitas(d.citas || []))
      .catch((e) => setErr(e.message));
  }, [date, all]);
  useEffect(() => { load(); }, [load]);

  const changeEstado = async (c, estado) => {
    setBusy(c.id + estado);
    try {
      await apiRoot('/api/appointments', { method: 'PATCH', body: { fecha: c.fecha, hora: c.hora, estado } });
      setCitas((list) => list.map((x) => (x.id === c.id ? { ...x, estado } : x)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const deleteAll = async () => {
    if (!window.confirm('¿Eliminar TODAS las citas? Esta acción no se puede deshacer.')) return;
    try {
      await apiRoot('/api/appointments', { method: 'DELETE' });
      load();
    } catch (e) { setErr(e.message); }
  };

  return (
    <>
      <div className="section-head">
        <h1>Citas</h1>
        <div className="spacer" />
        {citas && citas.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={deleteAll}>Eliminar todas</button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="field" style={{ margin: 0 }}>
            <span>Fecha</span>
            <input type="date" value={date} disabled={all} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="row" style={{ gap: 8, marginTop: 18, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={all} onChange={(e) => setAll(e.target.checked)} />
            <span className="muted">Ver todas</span>
          </label>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={load}>Actualizar</button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {citas == null ? <span className="spinner spinner-lg" />
        : citas.length === 0 ? <div className="card"><div className="empty">No hay citas {all ? 'registradas' : 'para esta fecha'}.</div></div>
          : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Servicio</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {citas.map((c) => (
                    <tr key={c.id}>
                      <td className="muted">{c.fecha}</td>
                      <td>{String(c.hora).slice(0, 5)}</td>
                      <td>
                        <strong>{c.nombre}</strong>
                        {c.telefono && <div className="muted" style={{ fontSize: 12.5 }}>{c.telefono}</div>}
                      </td>
                      <td className="muted">{c.servicio}</td>
                      <td>
                        <select
                          value={c.estado}
                          disabled={!!busy}
                          onChange={(e) => changeEstado(c, e.target.value)}
                          style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }}
                        >
                          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </>
  );
}
