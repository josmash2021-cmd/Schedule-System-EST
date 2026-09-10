import { useEffect, useState, useRef } from 'react';
import { api, apiUpload, photoUrl } from '../api.js';

export const REPAIR_STATUS = [
  { v: 'recibido', l: 'Recibido' },
  { v: 'diagnostico', l: 'En revisión' },
  { v: 'reparacion', l: 'En laboratorio' },
  { v: 'listo', l: 'Listo para recoger' },
  { v: 'entregado', l: 'Entregado' },
];
export const STATUS_BADGE = {
  recibido: 'badge-pendiente', diagnostico: 'badge-confirmada', reparacion: 'badge-confirmada',
  listo: 'badge-atendida', entregado: 'badge-off',
};
export const statusLabel = (v) => (REPAIR_STATUS.find((s) => s.v === v) || {}).l || v;

// Tipo de equipo y tipo de servicio (se guardan en repair_tickets).
export const DEVICE_TYPES = [
  { v: 'telefono', l: 'Teléfono' },
  { v: 'tablet', l: 'Tablet' },
  { v: 'laptop', l: 'Laptop' },
];
export const SERVICE_TYPES = [
  { v: 'revision', l: 'Revisión' },
  { v: 'reparacion', l: 'Reparación' },
  { v: 'mantenimiento', l: 'Mantenimiento' },
];
export const deviceTypeLabel = (v) => (DEVICE_TYPES.find((s) => s.v === v) || {}).l || '—';
export const serviceTypeLabel = (v) => (SERVICE_TYPES.find((s) => s.v === v) || {}).l || '—';

// Comprime/redimensiona la imagen en el navegador antes de subir: máx 1600px,
// JPEG calidad 0.85. Reduce ~10-20x el tamaño y convierte HEIC de iPhone a JPG.
// Si algo falla, devuelve el archivo original (fallback seguro).
async function compressImage(file, maxDim = 1600, quality = 0.85) {
  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  try {
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) { bitmap = await createImageBitmap(file); }
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file; // no quedó más chica → original
    const name = (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch (_) {
    return file;
  }
}

const EMPTY = {
  device_type: 'telefono', service_type: 'reparacion',
  device_brand: '', device_model: '', device_serial: '', customer_name: '', customer_phone: '', customer_email: '',
  problem: '', diagnosis: '', quoted_price: '', final_price: '', amount_paid: '', status: 'recibido', assigned_to: '',
  tracking_number: '', carrier: '',
};

// Paqueterías para el envío de vuelta al cliente.
const CARRIERS = [
  { v: '', l: '—' },
  { v: 'usps', l: 'USPS' },
  { v: 'ups', l: 'UPS' },
  { v: 'fedex', l: 'FedEx' },
  { v: 'dhl', l: 'DHL' },
  { v: 'otra', l: 'Otra' },
];

// Teléfono a formato internacional para wa.me (US: 10 dígitos → +1).
export function phoneIntl(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? '1' + d : d;
}

// Saludo según la hora del negocio (America/Chicago), para los mensajes de
// WhatsApp al cliente: buenos días (5-11), buenas tardes (12-18), buenas
// noches (19-4). Se calcula al hacer clic en el botón.
export function saludo() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h >= 5 && h < 12 ? 'buenos días' : h >= 12 && h < 19 ? 'buenas tardes' : 'buenas noches';
}

export default function RepairDetail({ ticketId, workers = [], isAdmin, onClose, onSaved, onCreated }) {
  const [id, setId] = useState(ticketId || null);
  const [f, setF] = useState(EMPTY);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(!!ticketId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [sendingTrack, setSendingTrack] = useState(false); // correo de seguimiento
  const [trackToken, setTrackToken] = useState(null); // token público del link track.html
  const fileRef = useRef(null);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const load = (tid) => {
    setLoading(true);
    api('/repairs/' + tid).then(({ ticket }) => {
      setF({
        device_type: ticket.device_type || 'telefono', service_type: ticket.service_type || 'reparacion',
        device_brand: ticket.device_brand || '', device_model: ticket.device_model || '', device_serial: ticket.device_serial || '',
        customer_name: ticket.customer_name || '', customer_phone: ticket.customer_phone || '', customer_email: ticket.customer_email || '',
        problem: ticket.problem || '', diagnosis: ticket.diagnosis || '',
        quoted_price: ticket.quoted_price != null ? ticket.quoted_price : '', final_price: ticket.final_price != null ? ticket.final_price : '',
        amount_paid: ticket.amount_paid != null ? ticket.amount_paid : '',
        status: ticket.status, assigned_to: ticket.assigned_to != null ? String(ticket.assigned_to) : '',
        tracking_number: ticket.tracking_number || '', carrier: ticket.carrier || '',
      });
      setTrackToken(ticket.track_token || null);
      setPhotos(ticket.photos || []);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (ticketId) load(ticketId); }, [ticketId]);

  const bodyPayload = () => ({
    ...f, assigned_to: f.assigned_to || null,
    quoted_price: f.quoted_price === '' ? null : f.quoted_price,
    final_price: f.final_price === '' ? null : f.final_price,
    amount_paid: f.amount_paid === '' ? null : f.amount_paid,
  });

  const save = async () => {
    setErr(''); setOk(''); setSaving(true);
    const body = bodyPayload();
    try {
      if (id) {
        await api('/repairs/' + id, { method: 'PATCH', body });
        setOk('Cambios guardados.');
      } else {
        const { ticket } = await api('/repairs', { method: 'POST', body });
        // Con onCreated: volver a la lista (las fotos se agregan reabriendo la
        // reparación). Sin él: quedarse para subir fotos de una vez.
        if (onCreated) { if (onSaved) onSaved(); onCreated(ticket); return; }
        setId(ticket.id); // ahora se pueden agregar fotos
        setTrackToken(ticket.track_token || null);
        setOk('Reparación creada. Ya puedes agregar fotos.');
      }
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  // Guarda la ficha (para que el tracking quede registrado) y manda al
  // cliente el correo con el link de seguimiento de su reparación.
  const sendTrackEmail = async () => {
    setErr(''); setOk(''); setSendingTrack(true);
    try {
      await api('/repairs/' + id, { method: 'PATCH', body: bodyPayload() });
      const r = await api('/repairs/' + id + '/send-tracking', { method: 'POST' });
      setOk(r.sent
        ? 'Correo de seguimiento enviado al cliente.'
        : 'El servidor no envió el correo (revisa las credenciales de Gmail).');
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSendingTrack(false); }
  };

  // WhatsApp: abre wa.me con el mensaje ya escrito (número de rastreo + link
  // de track.html). También guarda la ficha primero.
  const sendTrackWhatsApp = async () => {
    setErr(''); setOk('');
    try {
      await api('/repairs/' + id, { method: 'PATCH', body: bodyPayload() });
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); return; }
    const device = [f.device_brand, f.device_model].filter(Boolean).join(' ') || 'equipo';
    const link = window.location.origin + '/track?t=' + trackToken;
    const msg = `Hola${f.customer_name ? ' ' + f.customer_name : ''}, ${saludo()}. El repuesto que necesita tu ${device} ya está en camino hacia nosotros.\n` +
      `Número de rastreo: ${f.tracking_number}${f.carrier && f.carrier !== 'otra' ? ' (' + f.carrier.toUpperCase() + ')' : ''}\n` +
      `Puedes rastrear el paquete y el estado de tu reparación aquí: ${link}`;
    window.open('https://wa.me/' + phoneIntl(f.customer_phone) + '?text=' + encodeURIComponent(msg), '_blank');
    setOk('Se abrió WhatsApp con el mensaje listo para enviar.');
  };

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !id) return;
    setErr(''); setUploading(true);
    try {
      const img = await compressImage(file);
      const fd = new FormData();
      fd.append('photo', img);
      const { photo } = await apiUpload('/repairs/' + id + '/photos', fd);
      setPhotos((p) => [...p, photo]);
    } catch (e2) { setErr(e2.message); }
    finally { setUploading(false); }
  };

  const delPhoto = async (pid) => {
    try { await api('/repairs/' + id + '/photos/' + pid, { method: 'DELETE' }); setPhotos((p) => p.filter((x) => x.id !== pid)); }
    catch (e) { setErr(e.message); }
  };

  const delTicket = async () => {
    if (!window.confirm('¿Eliminar esta reparación y sus fotos?')) return;
    try { await api('/repairs/' + id, { method: 'DELETE' }); if (onSaved) onSaved(); if (onClose) onClose(); }
    catch (e) { setErr(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>;

  return (
    <div className="repair-detail">
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      <div className="rd-grid">
        <label className="field"><span>Tipo de equipo</span>
          <select value={f.device_type} onChange={set('device_type')}>{DEVICE_TYPES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        </label>
        <label className="field"><span>Servicio</span>
          <select value={f.service_type} onChange={set('service_type')}>{SERVICE_TYPES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        </label>
      </div>
      <div className="rd-grid">
        <label className="field"><span>Marca</span><input value={f.device_brand} onChange={set('device_brand')} placeholder="ej. Apple" /></label>
        <label className="field"><span>Modelo</span><input value={f.device_model} onChange={set('device_model')} placeholder="ej. iPhone 12" /></label>
      </div>
      <label className="field"><span>Serie / IMEI</span><input value={f.device_serial} onChange={set('device_serial')} /></label>
      <div className="rd-grid">
        <label className="field"><span>Cliente</span><input value={f.customer_name} onChange={set('customer_name')} /></label>
        <label className="field"><span>Teléfono</span><input value={f.customer_phone} onChange={set('customer_phone')} /></label>
      </div>
      <label className="field"><span>Correo del cliente (para enviarle el seguimiento)</span><input type="email" value={f.customer_email} onChange={set('customer_email')} placeholder="cliente@correo.com" /></label>
      <label className="field"><span>Problema (reporta el cliente)</span><textarea rows="2" value={f.problem} onChange={set('problem')} /></label>
      <label className="field"><span>Diagnóstico (técnico)</span><textarea rows="2" value={f.diagnosis} onChange={set('diagnosis')} /></label>
      <div className="rd-grid">
        <label className="field"><span>Precio cotizado ($)</span><input type="number" min="0" step="0.01" value={f.quoted_price} onChange={set('quoted_price')} /></label>
        <label className="field"><span>Precio final ($)</span><input type="number" min="0" step="0.01" value={f.final_price} onChange={set('final_price')} /></label>
      </div>
      <div className="rd-grid">
        <label className="field"><span>Abonado por el cliente ($)</span><input type="number" min="0" step="0.01" value={f.amount_paid} onChange={set('amount_paid')} placeholder="0.00" /></label>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {(() => {
              const total = f.final_price !== '' ? Number(f.final_price) : (f.quoted_price !== '' ? Number(f.quoted_price) : 0);
              const paid = Number(f.amount_paid) || 0;
              if (!total) return 'Sin precio aún.';
              const rest = Math.max(total - paid, 0);
              const pct = Math.round((paid / total) * 100);
              return paid > 0 ? `Abonado ${pct}% · Resta $${rest.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : 'Sin abonos registrados.';
            })()}
          </span>
        </div>
      </div>
      <div className="rd-grid">
        <label className="field"><span>Estado</span>
          <select value={f.status} onChange={set('status')}>{REPAIR_STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        </label>
        {workers.length > 0 && (
          <label className="field"><span>Técnico asignado</span>
            <select value={f.assigned_to} onChange={set('assigned_to')}>
              <option value="">Sin asignar</option>
              {workers.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </label>
        )}
      </div>

      {/* Seguimiento del repuesto en camino al taller: número de rastreo +
          paquetería, y botones para mandar el link de track.html al cliente
          por correo o WhatsApp. Los botones guardan la ficha antes de enviar. */}
      <div className="rd-ship">
        <strong style={{ fontSize: 14 }}>Seguimiento del repuesto</strong>
        <div className="rd-grid" style={{ marginTop: 10 }}>
          <label className="field"><span>Número de seguimiento</span><input value={f.tracking_number} onChange={set('tracking_number')} placeholder="ej. 9400 1000 0000 0000 0000 00" /></label>
          <label className="field"><span>Paquetería</span>
            <select value={f.carrier} onChange={set('carrier')}>{CARRIERS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
          </label>
        </div>
        {id ? (
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button className="btn btn-secondary btn-sm" onClick={sendTrackEmail}
              disabled={sendingTrack || !f.tracking_number || !f.customer_email}
              title={!f.customer_email ? 'Falta el correo del cliente' : (!f.tracking_number ? 'Falta el número de seguimiento' : 'Enviar correo con el link de seguimiento')}>
              {sendingTrack ? <span className="spinner" /> : '✉ Enviar por correo'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={sendTrackWhatsApp}
              disabled={!f.tracking_number || !f.customer_phone || !trackToken}
              title={!f.customer_phone ? 'Falta el teléfono del cliente' : (!f.tracking_number ? 'Falta el número de seguimiento' : 'Abrir WhatsApp con el mensaje listo')}>
              Enviar por WhatsApp
            </button>
            {f.tracking_number && (!f.customer_email || !f.customer_phone) && (
              <span className="muted" style={{ fontSize: 12 }}>
                {!f.customer_email ? 'Sin correo guardado. ' : ''}{!f.customer_phone ? 'Sin teléfono guardado.' : ''}
              </span>
            )}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Guarda primero la reparación para poder enviar el seguimiento.</div>
        )}
      </div>

      {/* Fotos */}
      <div className="rd-photos">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>Fotos {photos.length ? `(${photos.length})` : ''}</strong>
          {id
            ? <button className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileRef.current && fileRef.current.click()}>{uploading ? <span className="spinner" /> : '＋ Agregar foto'}</button>
            : <span className="muted" style={{ fontSize: 12 }}>Guarda primero para agregar fotos</span>}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPick} />
        </div>
        {photos.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>Sin fotos.</div> : (
          <div className="photo-grid">
            {photos.map((p) => (
              <div key={p.id} className="photo-thumb">
                <a href={photoUrl(p.filename)} target="_blank" rel="noreferrer"><img src={photoUrl(p.filename)} alt="foto" /></a>
                <button className="photo-del" title="Eliminar" onClick={() => delPhoto(p.id)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rd-actions">
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : (id ? 'Guardar cambios' : 'Crear reparación')}</button>
        {isAdmin && id && <button className="btn btn-danger" onClick={delTicket}>Eliminar</button>}
        {onClose && <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
      </div>
    </div>
  );
}
