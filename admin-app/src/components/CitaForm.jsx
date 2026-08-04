import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Formulario de cita nueva. Lo usan la página de Citas del admin y la del
// trabajador, así que los dos crean citas exactamente igual.
const SERVICIOS = ['Consulta', 'Mantenimiento', 'Reparacion'];

function todayChicago() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

// "10:30" → "10:30 am"
function fmtHora(h) {
  const [hh = 0, mm = 0] = String(h).split(':').map(Number);
  const am = hh < 12;
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${am ? 'am' : 'pm'}`;
}

export default function CitaForm({ onSaved, onCancel }) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [servicio, setServicio] = useState(SERVICIOS[0]);
  const [otro, setOtro] = useState('');
  const [fecha, setFecha] = useState(todayChicago());
  const [hora, setHora] = useState('');
  const [slots, setSlots] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // Horarios del día elegido: los ocupados se muestran, pero no se pueden
  // elegir (así se ve por qué falta un hueco en vez de dar un 409 al guardar).
  useEffect(() => {
    let vivo = true;
    setSlots(null);
    setErr('');
    api('/appointments/slots?date=' + encodeURIComponent(fecha))
      .then((d) => { if (vivo) setSlots(d.slots || []); })
      .catch((e) => { if (vivo) { setSlots([]); setErr(e.message); } });
    return () => { vivo = false; };
  }, [fecha]);

  // Si el hueco elegido deja de estar libre (o se cambia de día), se suelta.
  useEffect(() => {
    if (!slots) return;
    const libre = slots.find((s) => s.hora === hora && !s.ocupado);
    if (!libre) setHora('');
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const servicioFinal = servicio === 'Otro' ? otro.trim() : servicio;
  const listo = nombre.trim() && telefono.trim() && servicioFinal && fecha && hora && !saving;

  const guardar = async () => {
    setErr('');
    setSaving(true);
    try {
      const d = await api('/appointments', {
        method: 'POST',
        body: {
          nombre: nombre.trim(), telefono: telefono.trim(), correo: correo.trim() || null,
          servicio: servicioFinal, fecha, hora,
        },
      });
      onSaved(d.cita);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  const libres = slots ? slots.filter((s) => !s.ocupado) : [];

  return (
    <>
      {err && <div className="alert alert-error">{err}</div>}
      <label className="field"><span>Cliente</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellido" autoFocus />
      </label>
      <div className="rd-grid">
        <label className="field"><span>Teléfono</span>
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="(205) 555-0000" />
        </label>
        <label className="field"><span>Correo (opcional)</span>
          <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </label>
      </div>
      <label className="field"><span>Servicio</span>
        <select value={servicio} onChange={(e) => setServicio(e.target.value)}>
          {SERVICIOS.map((s) => <option key={s} value={s}>{s}</option>)}
          <option value="Otro">Otro…</option>
        </select>
      </label>
      {servicio === 'Otro' && (
        <label className="field"><span>¿Qué servicio?</span>
          <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Describe el servicio" />
        </label>
      )}
      <div className="rd-grid">
        <label className="field"><span>Fecha</span>
          <input type="date" value={fecha} min={todayChicago()} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </label>
        <label className="field"><span>Hora</span>
          {slots == null
            ? <div style={{ padding: '10px 0' }}><span className="spinner" /></div>
            : (
              <select value={hora} onChange={(e) => setHora(e.target.value)} disabled={!libres.length}>
                <option value="">{libres.length ? 'Elige una hora' : 'Sin horarios libres este día'}</option>
                {slots.map((s) => (
                  <option key={s.hora} value={s.hora} disabled={s.ocupado}>
                    {fmtHora(s.hora)}{s.ocupado ? ' — ocupado' : ''}
                  </option>
                ))}
              </select>
            )}
        </label>
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <button className="btn btn-primary" onClick={guardar} disabled={!listo}>
          {saving ? <span className="spinner" /> : 'Crear cita'}
        </button>
        {onCancel && <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>}
      </div>
    </>
  );
}
