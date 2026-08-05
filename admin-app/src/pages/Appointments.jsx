import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRoot } from '../api.js';
import CitaForm from '../components/CitaForm.jsx';
import FormPage from '../components/FormPage.jsx';

const ESTADOS = ['pendiente', 'confirmada', 'atendida', 'cancelada'];

function todayChicago() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

// "10:30:00" → "10:30 am"; "15:15:00" → "3:15 pm"
function fmtHora(h) {
  const [hh = 0, mm = 0] = String(h).split(':').map(Number);
  const am = hh < 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${am ? 'am' : 'pm'}`;
}

// "2026-07-25" → "25/07/2026"
const fmtFecha = (f) => String(f).slice(0, 10).split('-').reverse().join('/');

// Dato del detalle: etiqueta arriba, valor abajo (rejilla horizontal).
function Info({ k, v }) {
  return (
    <div className="cita-info">
      <div className="cita-info-k">{k}</div>
      <div className="cita-info-v">{v}</div>
    </div>
  );
}

export default function Appointments() {
  // Permite llegar con ?fecha=YYYY-MM-DD (p. ej. desde el gráfico del Dashboard).
  const [searchParams] = useSearchParams();
  const paramFecha = searchParams.get('fecha');
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(paramFecha || '') ? paramFecha : todayChicago());
  const [all, setAll] = useState(false);
  const [citas, setCitas] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null); // cita abierta en detalle
  const [tick, setTick] = useState(0); // fuerza recarga aunque no cambie el filtro

  const load = useCallback(() => {
    setErr('');
    setCitas(null);
    const q = all ? '' : ('?date=' + date);
    apiRoot('/api/appointments' + q)
      .then((d) => setCitas(d.citas || []))
      .catch((e) => setErr(e.message));
  }, [date, all, tick]);
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

  const remove = async (c) => {
    if (!window.confirm(`¿Eliminar la cita de ${c.nombre} (${fmtFecha(c.fecha)} ${fmtHora(c.hora)})?`)) return;
    setBusy(c.id + 'del');
    try {
      await apiRoot('/api/appointments/' + c.id, { method: 'DELETE' });
      setCitas((list) => list.filter((x) => x.id !== c.id));
      setSelected(null);
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
    } catch (e) {
      setErr(e.message);
    }
  };

  // Alta de cita desde el mostrador (mismo formulario que usa el trabajador).
  if (creating) {
    return (
      <FormPage title="Nueva cita" onBack={() => setCreating(false)} max={640}>
        <CitaForm
          onCancel={() => setCreating(false)}
          onSaved={(cita) => {
            setCreating(false);
            // Saltar al día de la cita nueva. El tick fuerza la recarga aunque
            // la cita sea para el día ya seleccionado (setDate con el mismo
            // valor no re-dispara el efecto y la cita no aparecía).
            if (cita && cita.fecha) { setAll(false); setDate(String(cita.fecha).slice(0, 10)); }
            setTick((t) => t + 1);
          }}
        />
      </FormPage>
    );
  }

  if (editing) {
    return (
      <EditPage
        cita={editing}
        onBack={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    );
  }

  // Detalle de la cita (página completa, info en rejilla horizontal).
  if (selected) {
    const c = (citas && citas.find((x) => x.id === selected.id)) || selected;
    return (
      <FormPage title="Detalle de la cita" onBack={() => setSelected(null)} max={760}>
        <div className="cita-grid">
          <Info k="Fecha" v={fmtFecha(c.fecha)} />
          <Info k="Hora" v={fmtHora(c.hora)} />
          <Info k="Estado" v={<span className={'badge badge-' + c.estado}>{c.estado}</span>} />
          <Info k="Cliente" v={c.nombre} />
          <Info k="Teléfono" v={c.telefono || '—'} />
          <Info k="Correo" v={c.correo || '—'} />
          <Info k="Servicio" v={c.servicio} />
        </div>
        <div className="row" style={{ marginTop: 20, flexWrap: 'wrap' }}>
          <select value={c.estado} disabled={!!busy} onChange={(e) => changeEstado(c, e.target.value)} style={{ width: 'auto' }}>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>Editar</button>
          <button className="btn btn-danger btn-sm" disabled={busy === c.id + 'del'} onClick={() => remove(c)}>
            {busy === c.id + 'del' ? <span className="spinner" /> : 'Eliminar'}
          </button>
        </div>
      </FormPage>
    );
  }

  return (
    <>
      <div className="section-head">
        <div className="spacer" />
        {citas && citas.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={deleteAll}>Eliminar todas</button>
        )}
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nueva cita</button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row citas-filtro">
          <label className="field citas-fecha">
            <span>Fecha</span>
            <input type="date" value={date} disabled={all} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="row citas-todas">
            <input type="checkbox" style={{ width: 'auto' }} checked={all} onChange={(e) => setAll(e.target.checked)} />
            <span className="muted">Ver todas</span>
          </label>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={load}>Actualizar</button>
        </div>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      {citas == null ? <span className="spinner spinner-lg" />
        : citas.length === 0 ? <div className="card"><div className="empty">No hay citas {all ? 'registradas' : 'para esta fecha'}.</div></div>
          : (
            <div className="cita-list">
              {citas.map((c) => (
                <div key={c.id} className="cita-row" onClick={() => setSelected(c)}>
                  <div className="cita-hora">{fmtHora(c.hora)}</div>
                  {all && <div className="cita-fecha muted">{fmtFecha(c.fecha)}</div>}
                  <div className="cita-cliente">{c.nombre}</div>
                  <div className="cita-tel muted">{c.telefono || '—'}</div>
                  <div className="cita-servicio muted">{c.servicio}</div>
                  <select className="estado-select" value={c.estado} disabled={!!busy}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => changeEstado(c, e.target.value)}>
                    {ESTADOS.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
                  </select>
                  <svg className="cita-go" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              ))}
            </div>
          )}

    </>
  );
}

function EditPage({ cita, onBack, onSaved }) {
  const [nombre, setNombre] = useState(cita.nombre || '');
  const [telefono, setTelefono] = useState(cita.telefono || '');
  const [correo, setCorreo] = useState(cita.correo || '');
  const [servicio, setServicio] = useState(cita.servicio || '');
  const [fecha, setFecha] = useState(cita.fecha || '');
  const [hora, setHora] = useState(String(cita.hora || '').slice(0, 5));
  const [estado, setEstado] = useState(cita.estado || 'pendiente');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErr('');
    setSaving(true);
    try {
      await apiRoot('/api/appointments/' + cita.id, {
        method: 'PATCH',
        body: {
          nombre: nombre.trim(), telefono: telefono.trim(), correo: correo.trim() || null,
          servicio: servicio.trim(), fecha, hora, estado,
        },
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <>
      <div className="section-head">
        <div className="spacer" />
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Volver</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="card" style={{ maxWidth: 640 }}>
        <h3>Datos de la cita</h3>
        <label className="field"><span>Cliente</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </label>
        <div className="rd-grid">
          <label className="field"><span>Teléfono</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          <label className="field"><span>Correo (opcional)</span>
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </label>
        </div>
        <label className="field"><span>Servicio</span>
          <input value={servicio} onChange={(e) => setServicio(e.target.value)} />
        </label>
        <div className="rd-grid">
          <label className="field"><span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="field"><span>Hora</span>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
        </div>
        <label className="field"><span>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <button className="btn btn-primary" onClick={save}
            disabled={saving || !nombre.trim() || !telefono.trim() || !servicio.trim() || !fecha || !hora}>
            {saving ? <span className="spinner" /> : 'Guardar cambios'}
          </button>
          <button className="btn btn-ghost" onClick={onBack}>Cancelar</button>
        </div>
      </div>
    </>
  );
}
