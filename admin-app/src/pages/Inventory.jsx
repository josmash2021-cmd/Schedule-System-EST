import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import BarChart from '../components/BarChart.jsx';
import InventoryDetail, { money } from '../components/InventoryDetail.jsx';

export default function Inventory() {
  const [items, setItems] = useState(null);
  const [compras, setCompras] = useState(null); // mercancía comprada por mes
  const [stockMes, setStockMes] = useState(null); // inventario al cierre de cada mes
  const [datosVentas, setDatosVentas] = useState(null); // ventas/gastos por mes
  const [search, setSearch] = useState('');
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);
  const [showOut, setShowOut] = useState(false); // ver solo los fuera de stock

  const load = useCallback((q = '') => {
    setErr('');
    api('/inventory' + (q ? '?search=' + encodeURIComponent(q) : '')).then((d) => setItems(d.items)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { const t = setTimeout(() => load(search), 300); return () => clearTimeout(t); }, [search, load]);
  useEffect(() => {
    api('/inventory/purchases-by-month').then((d) => setCompras(d.months || [])).catch(() => setCompras([]));
    api('/inventory/stock-by-month').then((d) => setStockMes(d.months || [])).catch(() => setStockMes([]));
    // Ventas/gastos para el resumen del mes (misma definición que Ventas).
    Promise.all([
      api('/repairs').then((d) => d.tickets || []),
      api('/sales').then((d) => d.sales || []),
      api('/orders').then((d) => d.orders || []),
      api('/expenses').then((d) => d.expenses || []),
    ]).then(([t, s, o, e]) => setDatosVentas({ tickets: t, directas: s, ordenes: o, expenses: e }))
      .catch(() => setDatosVentas({ tickets: [], directas: [], ordenes: [], expenses: [] }));
  }, []);

  // Stock editable directo en la lista: escribe la cantidad y al salir del
  // campo (o Enter) se guarda. 0 = fuera de stock → sale de la lista.
  const [stockBusy, setStockBusy] = useState(0);
  const saveStock = async (i, raw) => {
    const n = Math.max(0, Math.floor(Number(String(raw).replace(/[^\d]/g, '')) || 0));
    if (n === Number(i.stock)) return;
    setErr(''); setStockBusy(i.id);
    try {
      await api('/inventory/' + i.id, { method: 'PATCH', body: { stock: n } });
      load(search);
    } catch (e) { setErr(e.message); }
    setStockBusy(0);
  };

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
    // Orden fijo de la tienda (no alfabético): teléfonos primero, repuestos
    // al final; lo que no esté en la lista va antes de "Sin categoría".
    const ORDEN = ['Teléfonos', 'Tablets', 'Laptop Apple', 'Laptops Windows', 'PC Gaming', 'Consolas', 'Audífonos', 'Accesorios', 'Repuestos'];
    return Object.entries(map).sort(([a], [b]) => {
      const ia = ORDEN.indexOf(a), ib = ORDEN.indexOf(b);
      const ra = ia === -1 ? (a === 'Sin categoría' ? 999 : 500) : ia;
      const rb = ib === -1 ? (b === 'Sin categoría' ? 999 : 500) : ib;
      return ra !== rb ? ra - rb : a.localeCompare(b, 'es');
    });
  }, [visible]);

  // Resumen contable del mes seleccionado (navegación ‹ ›): inversión en
  // mercancía, ventas, ganancia e inventario que quedó al cierre. Misma
  // definición que el "Resumen por mes" de Ventas. Hora de Chicago.
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const [comprasOffset, setComprasOffset] = useState(0); // 0 = mes actual
  const chicagoMonth = (iso) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' })
      .formatToParts(new Date(iso)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    return `${p.year}-${p.month}`;
  };
  const resumenMes = useMemo(() => {
    if (!compras || !stockMes) return null;
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' })
      .formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    const [y, m] = [`${p.year}-${p.month}`].flatMap((k) => k.split('-').map(Number));
    const key = new Date(Date.UTC(y, m - 1 + comprasOffset, 1)).toISOString().slice(0, 7);

    const found = compras.find((x) => x.mes === key);
    const stock = stockMes.find((x) => x.mes === key);

    let ventas = 0;
    let costoVendido = 0;
    let gastos = 0;
    if (datosVentas) {
      for (const t of datosVentas.tickets) {
        if (t.status === 'entregado' && t.delivered_at && chicagoMonth(t.delivered_at) === key) ventas += Number(t.final_price) || 0;
      }
      for (const v of datosVentas.directas) {
        if (chicagoMonth(v.created_at) !== key) continue;
        ventas += Number(v.total) || 0;
        costoVendido += (v.items || []).reduce((a, i) => a + (Number(i.cost) || 0) * (Number(i.qty) || 0), 0);
      }
      for (const o of datosVentas.ordenes) {
        if (chicagoMonth(o.created_at) !== key) continue;
        ventas += Number(o.total) || 0;
        costoVendido += Number(o.costo) || 0;
      }
      for (const e of datosVentas.expenses) {
        if (chicagoMonth(e.created_at) === key) gastos += Number(e.amount) || 0;
      }
    }

    return {
      key,
      label: MESES[Number(key.slice(5, 7)) - 1] + ' ' + key.slice(0, 4),
      inversion: found ? found.total : 0,
      unidadesCompradas: found ? found.unidades : 0,
      ventas,
      costoVendido,
      gastos,
      ganancia: ventas - costoVendido - gastos,
      stockCierre: stock ? stock.unidades : null,
      valorCierre: stock ? stock.valorCosto : null, // siempre a COSTO (lo que costó), no a precio de venta
    };
  }, [compras, stockMes, datosVentas, comprasOffset]);

  // Gráfica de inversión mes a mes (cronológica) + total invertido global.
  const comprasChart = useMemo(() => {
    if (!compras) return null;
    const asc = [...compras].sort((a, b) => (a.mes < b.mes ? -1 : 1));
    const nowKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' })
      .formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
    const cur = `${nowKey.year}-${nowKey.month}`;
    return {
      keys: asc.map((x) => x.mes),
      data: asc.map((x) => x.total),
      labels: asc.map((x) => MESES[Number(x.mes.slice(5, 7)) - 1].slice(0, 3) + ' ' + x.mes.slice(2, 4)),
      highlight: cur,
      totalInvertido: compras.reduce((a, x) => a + x.total, 0),
      totalUnidades: compras.reduce((a, x) => a + x.unidades, 0),
    };
  }, [compras]);

  if (detail) {
    const back = () => { setDetail(null); load(search); };
    return (
      <FormPage title={detail.id ? 'Producto' : 'Nuevo producto'} onBack={back} max={1080}>
        <InventoryDetail itemId={detail.id} isAdmin onClose={back} onSaved={() => load(search)} />
      </FormPage>
    );
  }

  return (
    <div className="inventory-page">
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
              {/* Resumen del mes: inversión, ventas, ganancia e inventario
                  que quedó al cierre (en dinero). Flechas ‹ › cambian de mes. */}
              <div className="card" style={{ marginBottom: 18 }}>
                <div className="stat-top" style={{ marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>Resumen del mes — {resumenMes ? resumenMes.label : '…'}</h3>
                  <div className="gan-arrows">
                    <button type="button" className="gan-arrow" title="Mes anterior"
                      onClick={() => setComprasOffset((o) => o - 1)}>‹</button>
                    <button type="button" className="gan-arrow" title="Mes siguiente" disabled={comprasOffset >= 0}
                      onClick={() => setComprasOffset((o) => Math.min(0, o + 1))}>›</button>
                  </div>
                </div>
                {!resumenMes ? <span className="spinner" /> : (
                  <div className="stat-grid" style={{ margin: 0 }}>
                    <div className="stat-card">
                      <div className="k">Inversión del mes</div>
                      <div className="v">{money(resumenMes.inversion)}</div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{resumenMes.unidadesCompradas} unidades compradas</div>
                    </div>
                    <div className="stat-card">
                      <div className="k">Ventas del mes</div>
                      <div className="v">{money(resumenMes.ventas)}</div>
                      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>mercancía vendida que costó {money(resumenMes.costoVendido)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="k">Ganancia del mes</div>
                      <div className="v">{money(resumenMes.ganancia)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="k">Gastos del mes</div>
                      <div className="v">{money(resumenMes.gastos)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="k">Quedó en inventario</div>
                      <div className="v">{resumenMes.valorCierre == null ? '—' : money(resumenMes.valorCierre)}</div>
                      {resumenMes.valorCierre != null && (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                          {resumenMes.stockCierre} {resumenMes.stockCierre === 1 ? 'unidad' : 'unidades'} (a costo, lo que te costaron)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

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

              {/* Inversión total mes a mes (entradas de stock × costo). */}
              {comprasChart && comprasChart.keys.length > 0 && (
                <div className="card" style={{ marginBottom: 18 }}>
                  <h3>Inversión en inventario por mes</h3>
                  <BarChart data={comprasChart.data} keys={comprasChart.keys} labels={comprasChart.labels}
                    highlight={comprasChart.highlight}
                    format={(v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0))} />
                  <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                    Total invertido: <strong style={{ color: '#111' }}>{money(comprasChart.totalInvertido)}</strong>
                    {' '}· {comprasChart.totalUnidades} unidades en total
                  </div>
                </div>
              )}

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
                                <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                                  <input
                                    key={i.id + ':' + i.stock}
                                    className="stock-inline"
                                    defaultValue={i.stock}
                                    inputMode="numeric"
                                    title="Editar cantidad (0 = fuera de stock)"
                                    disabled={stockBusy === i.id}
                                    onChange={(e) => { e.target.value = e.target.value.replace(/[^\d]/g, ''); }}
                                    onBlur={(e) => saveStock(i, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                                  />
                                </td>
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
    </div>
  );
}
