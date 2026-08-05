import { useEffect, useState } from 'react';
import { api } from '../api.js';

/* Registrar una venta de mostrador. Líneas de dos tipos:
   - producto del inventario (descuenta stock; precio prellenado, editable)
   - concepto libre (nombre + precio a mano)
   El total lo recalcula el servidor; aquí solo se muestra. */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PAGOS = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'], ['otro', 'Otro']];

let SEQ = 1;
const nuevaLinea = () => ({ uid: SEQ++, item_id: '', name: '', qty: 1, price: '' });

export default function SaleForm({ onSaved, onCancel }) {
  const [inv, setInv] = useState(null);
  const [lineas, setLineas] = useState([nuevaLinea()]);
  const [pago, setPago] = useState('efectivo');
  const [nota, setNota] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/inventory').then((d) => setInv(d.items || [])).catch(() => setInv([]));
  }, []);

  const setLinea = (uid, patch) => setLineas((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const quitar = (uid) => setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.uid !== uid) : ls));

  // Elegir producto: prellena el precio de lista (editable después).
  const elegir = (l, value) => {
    if (value === 'libre') return setLinea(l.uid, { item_id: '', name: '', price: '' });
    const p = (inv || []).find((x) => String(x.id) === value);
    setLinea(l.uid, { item_id: value, name: p ? p.name : '', price: p && p.price != null ? String(p.price) : '' });
  };

  const total = lineas.reduce((a, l) => {
    const q = Number(l.qty) || 0;
    const p = Number(l.price);
    return a + (Number.isFinite(p) ? q * p : 0);
  }, 0);

  const completa = (l) => (l.item_id || l.name.trim()) && Number(l.qty) >= 1 && (l.item_id ? true : l.price !== '' && Number(l.price) >= 0);
  const listo = lineas.every(completa) && !saving;

  const guardar = async () => {
    setErr('');
    setSaving(true);
    try {
      const items = lineas.map((l) => (l.item_id
        ? { item_id: Number(l.item_id), qty: Number(l.qty), price: l.price === '' ? null : Number(l.price) }
        : { name: l.name.trim(), qty: Number(l.qty), price: Number(l.price) }));
      const d = await api('/sales', { method: 'POST', body: { items, payment_method: pago, note: nota.trim() || null } });
      onSaved(d.sale);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  if (inv == null) return <div style={{ textAlign: 'center', padding: 30 }}><span className="spinner spinner-lg" /></div>;

  return (
    <>
      {err && <div className="alert alert-error">{err}</div>}
      {lineas.map((l) => (
        <div key={l.uid} className="venta-linea">
          <label className="field vl-prod"><span>Producto</span>
            <select value={l.item_id || 'libre'} onChange={(e) => elegir(l, e.target.value)}>
              <option value="libre">Concepto libre…</option>
              {inv.map((p) => (
                <option key={p.id} value={p.id} disabled={p.stock < 1}>
                  {p.name}{p.stock < 1 ? ' — sin stock' : ` (${p.stock})`}
                </option>
              ))}
            </select>
          </label>
          {!l.item_id && (
            <label className="field vl-nombre"><span>Concepto</span>
              <input value={l.name} onChange={(e) => setLinea(l.uid, { name: e.target.value })} placeholder="ej. Instalación de mica" />
            </label>
          )}
          <label className="field vl-qty"><span>Cant.</span>
            <input type="number" min="1" max="999" value={l.qty} onChange={(e) => setLinea(l.uid, { qty: e.target.value })} />
          </label>
          <label className="field vl-precio"><span>Precio</span>
            <input type="number" min="0" step="0.01" value={l.price} onChange={(e) => setLinea(l.uid, { price: e.target.value })} placeholder="0.00" />
          </label>
          <button type="button" className="btn btn-ghost btn-sm vl-x" onClick={() => quitar(l.uid)}
            disabled={lineas.length === 1} title="Quitar línea">✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLineas((ls) => [...ls, nuevaLinea()])}>
        + Agregar línea
      </button>

      <div className="rd-grid" style={{ marginTop: 16 }}>
        <label className="field"><span>Pago</span>
          <select value={pago} onChange={(e) => setPago(e.target.value)}>
            {PAGOS.map(([v, l2]) => <option key={v} value={v}>{l2}</option>)}
          </select>
        </label>
        <label className="field"><span>Nota (opcional)</span>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="ej. cliente frecuente" />
        </label>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <strong style={{ fontSize: 20 }}>Total: {usd.format(total)}</strong>
        <div className="spacer" />
        {onCancel && <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>}
        <button className="btn btn-primary" onClick={guardar} disabled={!listo}>
          {saving ? <span className="spinner" /> : 'Registrar venta'}
        </button>
      </div>
    </>
  );
}
