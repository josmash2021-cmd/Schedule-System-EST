import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import InventoryDetail, { money } from '../components/InventoryDetail.jsx';

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);

  const load = useCallback((q = '') => {
    setErr('');
    api('/inventory' + (q ? '?search=' + encodeURIComponent(q) : '')).then((d) => setItems(d.items)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t); }, [search, load]);

  const shown = items ? items.filter((i) => !lowOnly || i.stock <= i.min_stock) : [];

  return (
    <>
      <div className="section-head">
        <h1>Inventario</h1>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setDetail({ id: null })}>+ Nuevo producto</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}

      <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="Buscar por nombre, SKU o categoría…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 340 }} />
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /><span className="muted">Solo bajo mínimo</span></label>
      </div>

      {items == null ? <span className="spinner spinner-lg" />
        : shown.length === 0 ? <div className="card"><div className="empty">{search || lowOnly ? 'Sin resultados.' : 'No hay productos. Crea el primero.'}</div></div>
          : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th></tr></thead>
                <tbody>
                  {shown.map((i) => {
                    const low = i.stock <= i.min_stock;
                    return (
                      <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => setDetail({ id: i.id })}>
                        <td><strong>{i.name}</strong>{i.sku && <div className="muted" style={{ fontSize: 12 }}>{i.sku}</div>}</td>
                        <td className="muted">{i.category || '—'}</td>
                        <td>{money(i.price)}</td>
                        <td><span className={'badge ' + (low ? 'badge-pendiente' : 'badge-on')}>{i.stock}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

      {detail && (
        <Modal wide title={detail.id ? 'Producto' : 'Nuevo producto'} onClose={() => { setDetail(null); load(search); }}>
          <InventoryDetail itemId={detail.id} isAdmin onClose={() => { setDetail(null); load(search); }} onSaved={() => load(search)} />
        </Modal>
      )}
    </>
  );
}
