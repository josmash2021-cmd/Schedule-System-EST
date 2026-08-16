import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import InventoryDetail, { money } from '../components/InventoryDetail.jsx';

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);

  const load = useCallback((q = '') => {
    setErr('');
    api('/inventory' + (q ? '?search=' + encodeURIComponent(q) : '')).then((d) => setItems(d.items)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t); }, [search, load]);

  if (detail) {
    const back = () => { setDetail(null); load(search); };
    return (
      <FormPage title={detail.id ? 'Producto' : 'Nuevo producto'} onBack={back}>
        <InventoryDetail itemId={detail.id} isAdmin onClose={back} onSaved={() => load(search)} />
      </FormPage>
    );
  }

  return (
    <>
      <div className="section-head">
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setDetail({ id: null })}>+ Nuevo producto</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}

      <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="Buscar por nombre, SKU o categoría…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 340 }} />
      </div>

      {items == null ? <span className="spinner spinner-lg" />
        : items.length === 0 ? <div className="card"><div className="empty">{search ? 'Sin resultados.' : 'No hay productos. Crea el primero.'}</div></div>
          : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Producto</th><th className="hide-sm">Categoría</th><th>Precio</th><th>Stock</th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => setDetail({ id: i.id })}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {i.image_url && (
                            <img src={i.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }} />
                          )}
                          <div>
                            <strong>{i.name}</strong>
                            {i.sku && <div className="muted" style={{ fontSize: 12 }}>{i.sku}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="muted hide-sm">{i.category || '—'}</td>
                      <td>{money(i.price)}</td>
                      <td><span className="badge badge-on">{i.stock}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </>
  );
}
