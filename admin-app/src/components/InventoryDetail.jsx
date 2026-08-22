import { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiUpload } from '../api.js';

export const money = (n) => (n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

const CATEGORIES = [
  { value: 'Laptop Apple', label: 'Laptop Apple' },
  { value: 'Tablets', label: 'Tablets' },
  { value: 'Laptops Windows', label: 'Laptops Windows' },
  { value: 'Teléfonos', label: 'Teléfonos' },
  { value: 'PC Gaming', label: 'PC Gaming' },
];

const EMPTY = { name: '', sku: '', category: '', description: '', price: '', cost: '', stock: '' };
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

// Las líneas de la descripción se guardan como "Clave: Valor" en español
// (Almacenamiento: 256GB); al reabrir se mapean de vuelta a los campos.
const SPEC_KEYMAP = {
  'procesador': 'processor', 'ram': 'ram', 'almacenamiento': 'storage',
  'color': 'color', 'condición': 'condition', 'condicion': 'condition',
  'cargador incluido': 'charger', 'cargador': 'charger',
  'liberado': 'unlocked', 'garantía': 'warranty', 'garantia': 'warranty',
};

function parseDescription(desc) {
  const specs = {};
  if (!desc) return specs;
  for (const line of String(desc).split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = SPEC_KEYMAP[line.slice(0, idx).trim().toLowerCase()];
      if (key) specs[key] = line.slice(idx + 1).trim();
    }
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

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const fileRef = useRef(null);

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
        image_url: item.image_url || '',
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

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = async () => {
    if (!id) { setPhotoFile(null); setPhotoPreview(null); if (fileRef.current) fileRef.current.value = ''; return; }
    if (!window.confirm('¿Eliminar la foto de este producto?')) return;
    setBusy(true);
    try {
      await api('/inventory/' + id + '/photo', { method: 'DELETE' });
      setF((s) => ({ ...s, image_url: '' }));
      setPhotoFile(null);
      setPhotoPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const uploadPendingPhoto = async (productId) => {
    if (!photoFile || !productId) return;
    const form = new FormData();
    form.append('photo', photoFile);
    await apiUpload('/inventory/' + productId + '/photo', form);
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const save = async () => {
    setErr(''); setOk(''); setSaving(true);
    const body = {
      ...f,
      price: cleanMoney(f.price),
      cost: cleanMoney(f.cost),
      stock: f.stock === '' ? 0 : Number(f.stock),
      description: buildDescription(specs, currentCategory),
    };
    if (!body.name) { setErr('El nombre es obligatorio.'); setSaving(false); return; }

    try {
      if (id) {
        await api('/inventory/' + id, { method: 'PATCH', body });
        await uploadPendingPhoto(id);
        load(id);
        setOk('Cambios guardados.');
      } else {
        const { item } = await api('/inventory', { method: 'POST', body });
        setId(item.id);
        await uploadPendingPhoto(item.id);
        setOk('Producto creado.');
        if (onSaved) onSaved();
        if (onClose) onClose();
        return;
      }
      if (onSaved) onSaved();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  const del = async () => {
    if (!window.confirm('¿Eliminar este producto? (se conserva el historial)')) return;
    try { await api('/inventory/' + id, { method: 'DELETE' }); if (onSaved) onSaved(); if (onClose) onClose(); }
    catch (e) { setErr(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>;

  const currentPhoto = photoPreview || (f.image_url ? f.image_url : null);

  // Margen en vivo: aparece en cuanto hay precio de venta y costo.
  // % = (venta − costo) / venta × 100 (misma fórmula que el resumen de Inventario).
  const priceN = cleanMoney(f.price);
  const costN = cleanMoney(f.cost);
  const ganancia = priceN != null && costN != null ? priceN - costN : null;
  const margen = ganancia != null && priceN > 0 ? (ganancia / priceN) * 100 : null;

  return (
    <div className="repair-detail inv-form">
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      {isAdmin ? (
        <>
          <label className="field inv-c1"><span>Nombre</span><input value={f.name} onChange={setField('name')} placeholder="ej. MacBook Air 13" /></label>

          {ganancia != null && (
            <div className="rd-photos inv-c2 inv-margin">
              <strong style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>Ganancia por unidad</strong>
              <div className={'inv-margin-amount' + (ganancia < 0 ? ' neg' : '')}>{money(ganancia)}</div>
              {ganancia < 0 && <div className="muted" style={{ fontSize: 12.5 }}>El costo supera al precio de venta.</div>}
            </div>
          )}

          <div className="rd-grid inv-c1">
            <label className="field"><span>SKU / código</span><input value={f.sku} onChange={setField('sku')} /></label>
            <label className="field"><span>Categoría</span>
              <select value={f.category} onChange={setField('category')}>
                <option value="">Selecciona…</option>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          </div>
          <div className="rd-grid inv-c1">
            <label className="field"><span>Precio venta ($)</span><input value={formatMoneyInput(f.price)} onChange={handlePrice('price')} placeholder="$0" /></label>
            <label className="field"><span>Costo ($)</span><input value={formatMoneyInput(f.cost)} onChange={handlePrice('cost')} placeholder="$0" /></label>
          </div>
          <label className="field inv-c1"><span>Cantidad</span><input inputMode="numeric" value={f.stock}
            onChange={(e) => setF((s) => ({ ...s, stock: e.target.value.replace(/[^\d]/g, '') }))} /></label>

          {currentCategory && (
            <div className="rd-photos inv-c1">
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

          {margen != null && (
            <div className="rd-photos inv-c2 inv-margin">
              <strong style={{ fontSize: 14, display: 'block', marginBottom: 6 }}>Margen de ganancia</strong>
              <div className={'inv-margin-amount' + (margen < 0 ? ' neg' : '')}>{margen.toFixed(1).replace(/\.0$/, '')}%</div>
              <div className="muted" style={{ fontSize: 12.5 }}>del precio de venta</div>
            </div>
          )}

          <div className="rd-photos inv-c2">
            <strong style={{ fontSize: 14, display: 'block', marginBottom: 10 }}>Foto del producto</strong>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} />
            {currentPhoto && (
              <div style={{ marginTop: 12 }}>
                <div className="photo-thumb" style={{ width: 120, height: 120, display: 'inline-block', verticalAlign: 'top' }}>
                  <img src={currentPhoto} alt="Vista previa" />
                </div>
                <button className="btn btn-danger btn-sm" style={{ marginLeft: 10, verticalAlign: 'top' }} onClick={removePhoto} disabled={busy}>Quitar</button>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="card inv-full" style={{ marginBottom: 14 }}>
          <strong>{f.name}</strong>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {[f.sku && ('SKU ' + f.sku), f.category].filter(Boolean).join(' · ')}
          </div>
          {f.price !== '' && <div style={{ marginTop: 6 }}>Precio: <strong>{money(cleanMoney(f.price))}</strong></div>}
          {f.description && <p className="muted" style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{f.description}</p>}
        </div>
      )}

      {id != null && movements.length > 0 && (
        <div className="inv-c2">
          <strong style={{ fontSize: 14, display: 'block', margin: '4px 0 8px' }}>Movimientos</strong>
          <div className="activity-feed" style={{ maxHeight: 240, overflowY: 'auto' }}>
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

      <div className="rd-actions inv-full">
        {isAdmin && <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : 'Guardar'}</button>}
        {isAdmin && id && <button className="btn btn-danger" onClick={del}>Eliminar</button>}
        {onClose && <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>}
      </div>
    </div>
  );
}
