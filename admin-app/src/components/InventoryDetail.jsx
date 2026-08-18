import { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiUpload } from '../api.js';
import { compressImage } from './RepairDetail.jsx';

const REASONS = ['entrada', 'salida', 'venta', 'uso', 'ajuste', 'devolución'];
export const money = (n) => (n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

// Slots de foto: 1 = principal (la de arriba en la web), 2 y 3 = galería.
const PHOTO_SLOTS = [
  { slot: 1, col: 'image_url', label: 'Foto principal (la de arriba)' },
  { slot: 2, col: 'image2_url', label: 'Foto 2 (galería de abajo)' },
  { slot: 3, col: 'image3_url', label: 'Foto 3 (galería de abajo)' },
];

const CATEGORIES = [
  { value: 'Laptop Apple', label: 'Laptop Apple' },
  { value: 'Tablets', label: 'Tablets' },
  { value: 'Laptops Windows', label: 'Laptops Windows' },
  { value: 'Teléfonos', label: 'Teléfonos' },
  { value: 'PC Gaming', label: 'PC Gaming' },
];

const EMPTY = { name: '', sku: '', category: '', description: '', price: '', cost: '', stock: '', subtitle: '', show_on_web: false };
const EMPTY_SPECS = {
  processor: '',
  ram: '',
  storage: '',
  color: '',
  condition: '',
  charger: '',
  warranty: '',
  unlocked: '',
};

function isComputer(category) {
  return category === 'Laptop Apple' || category === 'Laptops Windows' || category === 'PC Gaming';
}

function parseDescription(desc) {
  const specs = {};
  if (!desc) return specs;
  for (const line of String(desc).split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) specs[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return specs;
}

function buildDescription(specs, category) {
  const lines = [];
  const computer = isComputer(category);
  if (computer && specs.processor) lines.push(`Procesador: ${specs.processor}`);
  if (computer && specs.ram) lines.push(`RAM: ${specs.ram}`);
  if (specs.storage) lines.push(`Almacenamiento: ${specs.storage}`);
  if (specs.color) lines.push(`Color: ${specs.color}`);
  if (computer && specs.condition) lines.push(`Condición: ${specs.condition}`);
  if (computer && specs.charger) lines.push(`Cargador incluido: ${specs.charger}`);
  if (!computer && specs.unlocked) lines.push(`Liberado: ${specs.unlocked}`);
  if (specs.warranty) lines.push(`Garantía: ${specs.warranty}`);
  return lines.join('\n');
}

function formatMoneyInput(raw) {
  const digits = String(raw || '').replace(/[^\d.]/g, '');
  const parts = digits.split('.');
  const whole = parts[0] ? Number(parts[0] || 0).toLocaleString('en-US') : '0';
  if (parts.length > 1) return '$' + whole + '.' + parts[1].slice(0, 2);
  return '$' + whole;
}

function cleanMoney(raw) {
  const v = String(raw || '').replace(/[^\d.]/g, '');
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default function InventoryDetail({ itemId, isAdmin, onClose, onSaved }) {
  const [id, setId] = useState(itemId || null);
  const [f, setF] = useState(EMPTY);
  const [specs, setSpecs] = useState(EMPTY_SPECS);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(!!itemId);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('entrada');
  const [direction, setDirection] = useState('in');
  const [note, setNote] = useState('');

  // Fotos pendientes de subir por slot: { 1: {file, preview}, ... }
  const [photos, setPhotos] = useState({});
  const fileRefs = { 1: useRef(null), 2: useRef(null), 3: useRef(null) };

  const setField = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const load = (iid) => {
    setLoading(true);
    api('/inventory/' + iid).then(({ item, movements: movs }) => {
      setF({
        name: item.name || '',
        sku: item.sku || '',
        category: item.category || '',
        description: item.description || '',
        price: item.price != null ? String(item.price) : '',
        cost: item.cost != null ? String(item.cost) : '',
        stock: item.stock != null ? String(item.stock) : '',
        subtitle: item.subtitle || '',
        show_on_web: !!item.show_on_web,
        image_url: item.image_url || '',
        image2_url: item.image2_url || '',
        image3_url: item.image3_url || '',
      });
      setSpecs({ ...EMPTY_SPECS, ...parseDescription(item.description) });
      setMovements(movs || []);
    }).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { if (itemId) load(itemId); }, [itemId]);

  const currentCategory = f.category || '';
  const computer = useMemo(() => isComputer(currentCategory), [currentCategory]);

  const updateSpecs = (k) => (e) => setSpecs((s) => ({ ...s, [k]: e.target.value }));

  const handlePrice = (k) => (e) => {
    const val = formatMoneyInput(e.target.value);
    setF((s) => ({ ...s, [k]: val }));
  };

  const handlePhoto = (slot) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotos((p) => ({ ...p, [slot]: { file, preview: URL.createObjectURL(file) } }));
  };

  const clearSlot = (slot) => {
    setPhotos((p) => { const n = { ...p }; delete n[slot]; return n; });
    if (fileRefs[slot].current) fileRefs[slot].current.value = '';
  };

  const removePhoto = async (slot, col) => {
    if (!id) { clearSlot(slot); return; }
    if (!window.confirm('¿Eliminar esta foto del producto?')) return;
    setBusy(true);
    try {
      await api('/inventory/' + id + '/photo?slot=' + slot, { method: 'DELETE' });
      setF((s) => ({ ...s, [col]: '' }));
      clearSlot(slot);
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  // Sube las fotos elegidas (comprimidas) tras guardar el producto.
  const uploadPendingPhotos = async (productId) => {
    for (const { slot } of PHOTO_SLOTS) {
      const p = photos[slot];
      if (!p || !productId) continue;
      const img = await compressImage(p.file);
      const form = new FormData();
      form.append('photo', img);
      await apiUpload('/inventory/' + productId + '/photo?slot=' + slot, form);
      clearSlot(slot);
    }
  };

  const save = async () => {
    setErr(''); setOk(''); setSaving(true);
    const body = {
      ...f,
      price: cleanMoney(f.price),
      cost: cleanMoney(f.cost),
      stock: f.stock === '' ? 0 : Number(f.stock),
      description: buildDescription(specs, currentCategory),
      show_on_web: !!f.show_on_web,
    };
    // Las URLs de foto las manejan los endpoints de subida, no el PATCH.
    delete body.image_url; delete body.image2_url; delete body.image3_url;
    if (!body.name) { setErr('El nombre es obligatorio.'); setSaving(false); return; }

    try {
      if (id) {
        await api('/inventory/' + id, { method: 'PATCH', body });
        await uploadPendingPhotos(id);
        load(id);
        setOk('Cambios guardados.');
      } else {
        const { item } = await api('/inventory', { method: 'POST', body });
        setId(item.id);
        await uploadPendingPhotos(item.id);
        setOk('Producto creado.');
        if (onSaved) onSaved();
        if (onClose) onClose();
        return;
      }
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const adjust = async () => {
    const q = Math.abs(Math.floor(Number(qty)));
    if (!q || !id) { setErr('Cantidad inválida.'); return; }
    const delta = direction === 'out' ? -q : q;
    setErr(''); setBusy(true);
    try {
      const { item } = await api('/inventory/' + id + '/adjust', { method: 'POST', body: { delta, reason, note: note || null } });
      setF((s) => ({ ...s, stock: String(item.stock) }));
      setNote('');
      const { movements: movs } = await api('/inventory/' + id + '/movements');
      setMovements(movs);
      setOk('Ajuste guardado.');
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const del = async () => {
    if (!window.confirm('¿Eliminar este producto? (se conserva el historial)')) return;
    try { await api('/inventory/' + id, { method: 'DELETE' }); if (onSaved) onSaved(); if (onClose) onClose(); }
    catch (e) { setErr(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>;

  return (
    <div className="repair-detail">
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      {isAdmin ? (
        <>
          <label className="field"><span>Nombre</span><input value={f.name} onChange={setField('name')} placeholder="ej. MacBook Air 13" /></label>
          <div className="rd-grid">
            <label className="field"><span>SKU / código</span><input value={f.sku} onChange={setField('sku')} /></label>
            <label className="field"><span>Categoría</span>
              <select value={f.category} onChange={setField('category')}>
                <option value="">Selecciona…</option>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <div className="rd-grid">
            <label className="field"><span>Precio venta ($)</span><input value={formatMoneyInput(f.price)} onChange={handlePrice('price')} placeholder="$0" /></label>
            <label className="field"><span>Costo ($)</span><input value={formatMoneyInput(f.cost)} onChange={handlePrice('cost')} placeholder="$0" /></label>
          </div>
          <label className="field"><span>Cantidad</span><input type="number" min="0" step="1" value={f.stock} onChange={setField('stock')} /></label>

          {currentCategory && (
            <div className="rd-photos">
              <strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>Especificaciones</strong>
              {computer && (
                <>
                  <div className="rd-grid">
                    <label className="field"><span>Procesador</span><input value={specs.processor} onChange={updateSpecs('processor')} placeholder="ej. Intel i5" /></label>
                    <label className="field"><span>RAM</span><input value={specs.ram} onChange={updateSpecs('ram')} placeholder="ej. 8GB" /></label>
                  </div>
                </>
              )}
              <div className="rd-grid">
                <label className="field"><span>Almacenamiento</span><input value={specs.storage} onChange={updateSpecs('storage')} placeholder="ej. 256GB SSD" /></label>
                <label className="field"><span>Color</span><input value={specs.color} onChange={updateSpecs('color')} placeholder="ej. Gris espacial" /></label>
              </div>
              {computer && (
                <div className="rd-grid">
                  <label className="field"><span>Condición</span><input value={specs.condition} onChange={updateSpecs('condition')} placeholder="ej. Usada, como nueva" /></label>
                  <label className="field"><span>Cargador incluido</span>
                    <select value={specs.charger} onChange={updateSpecs('charger')}>
                      <option value="">Selecciona…</option>
                      <option value="Sí">Sí</option>
                      <option value="No">No</option>
                    </select>
                  </label>
                </div>
              )}
              {!computer && (
                <label className="field"><span>Liberado</span>
                  <select value={specs.unlocked} onChange={updateSpecs('unlocked')}>
                    <option value="">Selecciona…</option>
                    <option value="Sí">Sí</option>
                    <option value="No">No</option>
                  </select>
                </label>
              )}
              <label className="field"><span>Garantía</span>
                <select value={specs.warranty} onChange={updateSpecs('warranty')}>
                  <option value="">Selecciona…</option>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </select>
              </label>
            </div>
          )}

          <div className="rd-photos">
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>Página web</strong>
            <label className="row" style={{ gap: 8, cursor: 'pointer', marginBottom: 10 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={!!f.show_on_web}
                onChange={(e) => setF((s) => ({ ...s, show_on_web: e.target.checked }))} />
              <span style={{ fontSize: 14 }}>Mostrar este producto en la página web</span>
            </label>
            <label className="field"><span>Subtítulo web</span>
              <input value={f.subtitle} onChange={setField('subtitle')} placeholder="ej. 256 GB · Titanio azul · Desbloqueado" />
            </label>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              El título es el nombre del producto y la descripción son las especificaciones. Si el stock llega a 0, el producto sale de la página solo.
            </div>
            {PHOTO_SLOTS.map(({ slot, col, label }) => {
              const current = (photos[slot] && photos[slot].preview) || f[col] || null;
              return (
                <div key={slot} style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 10, marginTop: 10 }}>
                  <strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>{label}</strong>
                  <input ref={fileRefs[slot]} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto(slot)} />
                  {current && (
                    <div style={{ marginTop: 10 }}>
                      <div className="photo-thumb" style={{ width: 110, height: 110, display: 'inline-block', verticalAlign: 'top' }}>
                        <img src={current} alt="Vista previa" />
                      </div>
                      <button className="btn btn-danger btn-sm" style={{ marginLeft: 10, verticalAlign: 'top' }}
                        onClick={() => removePhoto(slot, col)} disabled={busy}>Quitar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card" style={{ marginBottom: 14 }}>
          <strong>{f.name}</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {[f.sku && ('SKU ' + f.sku), f.category].filter(Boolean).join(' · ')}
          </div>
          {f.price !== '' && <div style={{ marginTop: 6 }}>Precio: <strong>{money(cleanMoney(f.price))}</strong></div>}
          {f.description && <p className="muted" style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{f.description}</p>}
        </div>
      )}

      {id != null && (
        <div className="rd-photos">
          <strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>Ajustar stock</strong>
          <div className="adjust-row">
            <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 80 }} />
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }}>
              {REASONS.map((rz) => <option key={rz} value={rz}>{rz}</option>)}
            </select>
            <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ flex: 1 }}>
              <option value="in">Entrada (+)</option>
              <option value="out">Salida (−)</option>
            </select>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" style={{ marginTop: 8 }} />
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={adjust}>Guardar</button>
          </div>
        </div>
      )}

      {id != null && movements.length > 0 && (
        <div>
          <strong style={{ fontSize: 14, display: 'block', margin: '4px 0 8px' }}>Movimientos</strong>
          <div className="activity-feed">
            {movements.map((m) => (
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
        {isAdmin && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : 'Guardar'}</button>}
        {isAdmin && id && <button className="btn btn-danger" onClick={del}>Eliminar</button>}
        {onClose && <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
      </div>
    </div>
  );
}
