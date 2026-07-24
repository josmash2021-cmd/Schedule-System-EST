import { useEffect, useState, useRef } from 'react';
import { api, apiUpload, photoUrl } from '../api.js';

export const REPAIR_STATUS = [
  { v: 'recibido', l: 'Recibido' },
  { v: 'diagnostico', l: 'Diagnóstico' },
  { v: 'reparacion', l: 'En reparación' },
  { v: 'listo', l: 'Listo' },
  { v: 'entregado', l: 'Entregado' },
];
export const STATUS_BADGE = {
  recibido: 'badge-pendiente', diagnostico: 'badge-confirmada', reparacion: 'badge-confirmada',
  listo: 'badge-atendida', entregado: 'badge-off',
};
export const statusLabel = (v) => (REPAIR_STATUS.find((s) => s.v === v) || {}).l || v;

const EMPTY = {
  device_brand: '', device_model: '', device_serial: '', customer_name: '', customer_phone: '',
  problem: '', diagnosis: '', quoted_price: '', final_price: '', status: 'recibido', assigned_to: '',
};

export default function RepairDetail({ ticketId, workers = [], isAdmin, onClose, onSaved }) {
  const [id, setId] = useState(ticketId || null);
  const [f, setF] = useState(EMPTY);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(!!ticketId);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const fileRef = useRef(null);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const load = (tid) => {
    setLoading(true);
    api('/repairs/' + tid).then(({ ticket }) => {
      setF({
        device_brand: ticket.device_brand || '', device_model: ticket.device_model || '', device_serial: ticket.device_serial || '',
        customer_name: ticket.customer_name || '', customer_phone: ticket.customer_phone || '',
        problem: ticket.problem || '', diagnosis: ticket.diagnosis || '',
        quoted_price: ticket.quoted_price != null ? ticket.quoted_price : '', final_price: ticket.final_price != null ? ticket.final_price : '',
        status: ticket.status, assigned_to: ticket.assigned_to != null ? String(ticket.assigned_to) : '',
      });
      setPhotos(ticket.photos || []);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (ticketId) load(ticketId); }, [ticketId]);

  const save = async () => {
    setErr(''); setOk(''); setSaving(true);
    const body = { ...f, assigned_to: f.assigned_to || null, quoted_price: f.quoted_price === '' ? null : f.quoted_price, final_price: f.final_price === '' ? null : f.final_price };
    try {
      if (id) {
        await api('/repairs/' + id, { method: 'PATCH', body });
        setOk('Cambios guardados.');
      } else {
        const { ticket } = await api('/repairs', { method: 'POST', body });
        setId(ticket.id); // ahora se pueden agregar fotos
        setOk('Reparación creada. Ya puedes agregar fotos.');
      }
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !id) return;
    setErr(''); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
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
        <label className="field"><span>Marca</span><input value={f.device_brand} onChange={set('device_brand')} placeholder="ej. Apple" /></label>
        <label className="field"><span>Modelo</span><input value={f.device_model} onChange={set('device_model')} placeholder="ej. iPhone 12" /></label>
      </div>
      <label className="field"><span>Serie / IMEI</span><input value={f.device_serial} onChange={set('device_serial')} /></label>
      <div className="rd-grid">
        <label className="field"><span>Cliente</span><input value={f.customer_name} onChange={set('customer_name')} /></label>
        <label className="field"><span>Teléfono</span><input value={f.customer_phone} onChange={set('customer_phone')} /></label>
      </div>
      <label className="field"><span>Problema (reporta el cliente)</span><textarea rows="2" value={f.problem} onChange={set('problem')} /></label>
      <label className="field"><span>Diagnóstico (técnico)</span><textarea rows="2" value={f.diagnosis} onChange={set('diagnosis')} /></label>
      <div className="rd-grid">
        <label className="field"><span>Precio cotizado ($)</span><input type="number" min="0" step="0.01" value={f.quoted_price} onChange={set('quoted_price')} /></label>
        <label className="field"><span>Precio final ($)</span><input type="number" min="0" step="0.01" value={f.final_price} onChange={set('final_price')} /></label>
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
