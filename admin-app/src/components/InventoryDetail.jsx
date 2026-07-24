import { useEffect, useState } from 'react';
import { api } from '../api.js';

const REASONS = ['entrada', 'salida', 'venta', 'uso', 'ajuste', 'devolución'];
export const money = (n) => (n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

const EMPTY = { name: '', sku: '', category: '', description: '', price: '', cost: '', min_stock: '' };

export default function InventoryDetail({ itemId, isAdmin, onClose, onSaved }) {
  const [id, setId] = useState(itemId || null);
  const [f, setF] = useState(EMPTY);
  const [stock, setStock] = useState(0);
  const [movs, setMovs] = useState([]);
  const [loading, setLoading] = useState(!!itemId);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('entrada');
  const [note, setNote] = useState('');

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const load = (iid) => {
    setLoading(true);
    api('/inventory/' + iid).then(({ item, movements }) => {
      setF({ name: item.name || '', sku: item.sku || '', category: item.category || '', description: item.description || '', price: item.price != null ? item.price : '', cost: item.cost != null ? item.cost : '', min_stock: item.min_stock != null ? item.min_stock : '' });
      setStock(item.stock);
      setMovs(movements || []);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (itemId) load(itemId); }, [itemId]);

  const save = async () => {
    setErr(''); setOk(''); setSaving(true);
    const body = { ...f, price: f.price === '' ? null : f.price, cost: f.cost === '' ? null : f.cost, min_stock: f.min_stock === '' ? 0 : f.min_stock };
    try {
      if (id) { await api('/inventory/' + id, { method: 'PATCH', body }); setOk('Cambios guardados.'); }
      else { const { item } = await api('/inventory', { method: 'POST', body: { ...body, stock: 0 } }); setId(item.id); setStock(item.stock); setOk('Producto creado. Ya puedes ajustar el stock.'); }
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const adjust = async (sign) => {
    const q = Math.abs(Math.floor(Number(qty)));
    if (!q || !id) { setErr('Cantidad inválida.'); return; }
    setErr(''); setBusy(true);
    try {
      const { item } = await api('/inventory/' + id + '/adjust', { method: 'POST', body: { delta: sign * q, reason, note: note || null } });
      setStock(item.stock);
      setNote('');
      const { movements } = await api('/inventory/' + id + '/movements');
      setMovs(movements);
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const del = async () => {
    if (!window.confirm('¿Eliminar este producto? (se conserva el historial)')) return;
    try { await api('/inventory/' + id, { method: 'DELETE' }); if (onSaved) onSaved(); if (onClose) onClose(); }
    catch (e) { setErr(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>;

  const low = id && f.min_stock !== '' && Number(stock) <= Number(f.min_stock);

  return (
    <div className="repair-detail">
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      {/* Stock actual */}
      {id != null && (
        <div className={'stock-banner' + (low ? ' low' : '')}>
          <div><div className="muted" style={{ fontSize: 12 }}>En stock</div><div className="stock-num">{stock}</div></div>
          {low && <span className="badge badge-pendiente">Bajo mínimo</span>}
        </div>
      )}

      {/* Datos del producto */}
      {isAdmin ? (
        <>
          <label className="field"><span>Nombre</span><input value={f.name} onChange={set('name')} placeholder="ej. Cable USB-C" /></label>
          <div className="rd-grid">
            <label className="field"><span>SKU / código</span><input value={f.sku} onChange={set('sku')} /></label>
            <label className="field"><span>Categoría</span><input value={f.category} onChange={set('category')} /></label>
          </div>
          <div className="rd-grid">
            <label className="field"><span>Precio venta ($)</span><input type="number" min="0" step="0.01" value={f.price} onChange={set('price')} /></label>
            <label className="field"><span>Costo ($)</span><input type="number" min="0" step="0.01" value={f.cost} onChange={set('cost')} /></label>
          </div>
          <label className="field"><span>Stock mínimo (alerta)</span><input type="number" min="0" step="1" value={f.min_stock} onChange={set('min_stock')} /></label>
          <label className="field"><span>Descripción</span><textarea rows="2" value={f.description} onChange={set('description')} /></label>
        </>
      ) : (
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>{f.name}</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {[f.sku && ('SKU ' + f.sku), f.category].filter(Boolean).join(' · ')}
          </div>
          {f.price !== '' && <div style={{ marginTop: 6 }}>Precio: <strong>{money(f.price)}</strong></div>}
          {f.description && <p className="muted" style={{ fontSize: 13 }}>{f.description}</p>}
        </div>
      )}

      {/* Ajuste de stock */}
      {id != null ? (
        <div className="rd-photos">
          <strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>Ajustar stock</strong>
          <div className="adjust-row">
            <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 80 }} />
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }}>
              {REASONS.map((rz) => <option key={rz} value={rz}>{rz}</option>)}
            </select>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" style={{ marginTop: 8 }} />
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => adjust(1)}>＋ Entrada</button>
            <button className="btn btn-danger" style={{ flex: 1 }} disabled={busy} onClick={() => adjust(-1)}>− Salida</button>
          </div>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>Guarda el producto para poder ajustar su stock.</div>
      )}

      {/* Movimientos */}
      {id != null && movs.length > 0 && (
        <div>
          <strong style={{ fontSize: 14, display: 'block', margin: '4px 0 8px' }}>Movimientos</strong>
          <div className="activity-feed">
            {movs.map((m) => (
              <div key={m.id} className="activity-row">
                <span className={'mov-delta ' + (m.delta > 0 ? 'pos' : 'neg')}>{m.delta > 0 ? '+' : ''}{m.delta}</span>
                <span className="activity-text">{m.reason || 'ajuste'}{m.note ? ' · ' + m.note : ''}{m.username ? ' · ' + m.username : ''}</span>
                <span className="activity-time muted">{new Date(m.created_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rd-actions">
        {isAdmin && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : (id ? 'Guardar datos' : 'Crear producto')}</button>}
        {isAdmin && id && <button className="btn btn-danger" onClick={del}>Eliminar</button>}
        {onClose && <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
      </div>
    </div>
  );
}
