import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import InventoryDetail, { money } from '../components/InventoryDetail.jsx';

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);
  const [showOut, setShowOut] = useState(false); // ver solo los fuera de stock

  const load = useCallback((q = '') => {
    setErr('');
    api('/inventory' + (q ? '?search=' + encodeURIComponent(q) : '')).then((d) => setItems(d.items)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t); }, [search, load]);

  // Los productos sin stock NO salen en la lista normal: se cuentan aparte
  // en la tarjeta "Fuera de stock" (clicable para verlos y poder reabastecer).
  const inStock = useMemo(() => (items || []).filter((i) => Number(i.stock) > 0), [items]);
  const outStock = useMemo(() => (items || []).filter((i) => Number(i.stock) <= 0), [items]);
  const visible = showOut ? outStock : inStock;

  const totals = useMemo(() => {
    if (!items) return null;
    const products = inStock.length;
    const units = inStock.reduce((a, i) => a + (Number(i.stock) || 0), 0);
    const value = inStock.reduce((a, i) => a + (Number(i.stock) || 0) * (Number(i.price) || 0), 0);
    // Inversión = lo que costó el inventario actual (stock × costo).
    // Ganancia potencial = valor de venta − inversión; el % es el margen
    // sobre el precio de venta (costo vs venta).
    const inversion = inStock.reduce((a, i) => a + (Number(i.stock) || 0) * (Number(i.cost) || 0), 0);
    const ganancia = value - inversion;
    const margen = value > 0 ? (ganancia / value) * 100 : 0;
    return { products, units, value, inversion, ganancia, margen };
  }, [items, inStock]);

  const grouped = useMemo(() => {
    const map = {};
    for (const i of visible) {
      const cat = i.category || 'Sin categoría';
      if (!map[cat]) map[cat] = [];
      map[cat].push(i);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [visible]);

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
            <>
              <div className="stat-grid" style={{ marginBottom: 18 }}>
                <div className="stat-card">
                  <div className="k">Productos</div>
                  <div className="v">{totals.products}</div>
                </div>
                <div className="stat-card">
                  <div className="k">Unidades</div>
                  <div className="v">{totals.units}</div>
                </div>
                <div className="stat-card">
                  <div className="k">Valor en inventario</div>
                  <div className="v">{money(totals.value)}</div>
                </div>
                <div className="stat-card">
                  <div className="k">Valor de inversión</div>
                  <div className="v">{money(totals.inversion)}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>stock × costo</div>
                </div>
                <div className="stat-card">
                  <div className="k">Ganancia potencial</div>
                  <div className="v">{money(totals.ganancia)}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {totals.margen.toFixed(1).replace(/\.0$/, '')}% costo vs venta
                  </div>
                </div>
                <div className={'stat-card stat-card-btn' + (showOut ? ' stat-card-on' : '')}
                  role="button" tabIndex={0}
                  onClick={() => setShowOut((v) => !v)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowOut((v) => !v); }}
                  title="Toca para ver los productos fuera de stock">
                  <div className="k">Fuera de stock</div>
                  <div className="v">{outStock.length}</div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {outStock.length === 1 ? 'producto' : 'productos'}
                  </div>
                </div>
              </div>

              {showOut && (
                <div className="row" style={{ gap: 10, marginBottom: 14, alignItems: 'center' }}>
                  <span className="badge badge-off">Viendo solo los productos fuera de stock</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowOut(false)}>Ver los que tienen stock</button>
                </div>
              )}

              {visible.length === 0
                ? <div className="card"><div className="empty">{showOut ? 'Ningún producto fuera de stock.' : 'No hay productos con stock.'}</div></div>
                : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr><th>Producto</th><th className="hide-sm">SKU</th><th>Precio</th><th>Stock</th></tr></thead>
                      <tbody>
                        {grouped.map(([cat, list]) => (
                          <>
                            <tr key={'cat-' + cat} className="inv-cat-row">
                              <td colSpan={4}><span className="inv-cat-name">{cat}</span> <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>{list.reduce((a, i) => a + (Number(i.stock) || 0), 0)} unidades · {money(list.reduce((a, i) => a + (Number(i.stock) || 0) * (Number(i.price) || 0), 0))}</span></td>
                            </tr>
                            {list.map((i) => (
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
                                <td className="muted hide-sm">{i.sku || '—'}</td>
                                <td>{money(i.price)}</td>
                                <td><span className={'badge ' + (Number(i.stock) > 0 ? 'badge-on' : 'badge-off')}>{i.stock}</span></td>
                              </tr>
                            ))}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </>
          )}
    </>
  );
}
