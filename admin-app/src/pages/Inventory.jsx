import './Inventory.css';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import BarChart from '../components/BarChart.jsx';
import PageHead from '../components/PageHead.jsx';
import Tabs from '../components/Tabs.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import InventoryDetail, { money } from '../components/InventoryDetail.jsx';

/* Inventario (diseño nuevo, 2026-11-26): título + frase de cómo va, buscador
   y "+ Nuevo producto"; pestañas por categoría + Agotados; grilla de
   tarjetas con foto, precio, stock en color y botones − N + para ajustar sin
   abrir el producto. Tocar la tarjeta abre la ficha (movimientos, fecha de
   compra, borrar). El "Resumen del mes" y la gráfica de inversión siguen
   aquí, plegados detrás del ⋯ (la tabla mes a mes también vive en Ventas). */

// Orden fijo de la tienda (no alfabético): teléfonos primero, repuestos al
// final; lo que no esté en la lista va antes de "Sin categoría".
const ORDEN = ['Teléfonos', 'Tablets', 'Laptop Apple', 'Laptops Windows', 'PC Gaming', 'Consolas', 'Audífonos', 'Accesorios', 'Repuestos'];
const rangoCat = (c) => {
  const i = ORDEN.indexOf(c);
  return i === -1 ? (c === 'Sin categoría' ? 999 : 500) : i;
};
const catDe = (i) => i.category || 'Sin categoría';

// "Quedan pocos": stock ≤ mínimo del producto; sin mínimo, 3 o menos.
const POCOS_SIN_MINIMO = 3;
function estadoStock(i) {
  const s = Number(i.stock) || 0;
  const min = Number(i.min_stock) || 0;
  if (s <= 0) return { cls: 'st-bad', txt: 'Agotado' };
  if (s <= (min > 0 ? min : POCOS_SIN_MINIMO)) return { cls: 'st-warn', txt: `Quedan ${s}` };
  return { cls: 'st-ok', txt: `${s} en stock` };
}

// Ícono simple (solo trazo, sin cuadro de fondo) cuando el producto no tiene foto.
function IconoProducto({ item }) {
  const t = `${item.category || ''} ${item.name || ''}`.toLowerCase();
  const p = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (/bater/.test(t)) return <svg {...p}><rect x="3" y="7" width="16" height="10" rx="2" /><path d="M21 10.5v3M7 10v4M10.5 10v4" /></svg>;
  if (/laptop|macbook|notebook/.test(t)) return <svg {...p}><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></svg>;
  if (/tablet|ipad/.test(t)) return <svg {...p}><rect x="5" y="2.5" width="14" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>;
  if (/\bpc\b|monitor|imac/.test(t)) return <svg {...p}><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" /></svg>;
  if (/consola|playstation|xbox|nintendo/.test(t)) return <svg {...p}><path d="M7 9h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.8A3 3 0 0 1 3 14v-1a4 4 0 0 1 4-4Z" /><path d="M8 11.5v2M7 12.5h2M16 12h.01M17.5 13.5h.01" /></svg>;
  if (/aud[ií]fono|airpods|headphone/.test(t)) return <svg {...p}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>;
  if (/tel[eé]fono|iphone|pantalla|galaxy|celular/.test(t)) return <svg {...p}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>;
  return <svg {...p}><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></svg>;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export default function Inventory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState(null); // todos los productos (la búsqueda filtra en el cliente)
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todos'); // 'todos' | 'agotados' | 'cat:<categoría>'
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState(null);
  const [verResumen, setVerResumen] = useState(false); // Resumen del mes + gráfica (⋯)

  const load = useCallback(() => {
    setErr('');
    api('/inventory').then((d) => setItems(d.items || [])).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Menú "+ Nuevo": /inventario?nueva=1 abre el formulario de producto nuevo.
  useEffect(() => {
    if (!searchParams.get('nueva')) return;
    setDetail({ id: null });
    setSearchParams({}, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Stock − N + (misma llamada que el stock editable de antes) ----------
     PATCH /inventory/:id { stock } — el server registra el movimiento de
     inventario por la diferencia. Los toques seguidos se juntan en UNA sola
     llamada (y un solo movimiento) a los 450 ms del último toque. */
  const pendientes = useRef({}); // id → { timer, original, target }
  const enviarStock = async (id, p) => {
    delete pendientes.current[id];
    if (p.target === p.original) return;
    try {
      const d = await api('/inventory/' + id, { method: 'PATCH', body: { stock: p.target } });
      if (d && d.item) setItems((list) => (list || []).map((x) => (x.id === id ? { ...x, ...d.item } : x)));
    } catch (e) {
      setErr(e.message);
      load(); // vuelve al stock real si falló
    }
  };
  const cambiarStock = (item, nuevo, espera = 450) => {
    const n = Math.max(0, Math.floor(Number(nuevo) || 0));
    const p = pendientes.current[item.id] || (pendientes.current[item.id] = { original: Number(item.stock) || 0 });
    p.target = n;
    clearTimeout(p.timer);
    setErr('');
    setItems((list) => (list || []).map((x) => (x.id === item.id ? { ...x, stock: n } : x)));
    p.timer = setTimeout(() => enviarStock(item.id, p), espera);
  };
  // − / +: suma sobre el valor en espera (toques más rápidos que el render).
  const sumarStock = (item, delta) => {
    const p = pendientes.current[item.id];
    cambiarStock(item, (p ? p.target : Number(item.stock) || 0) + delta);
  };
  // Al abrir una ficha se mandan ya los ajustes en espera (la ficha lee del server).
  const enviarPendientes = () => {
    for (const [id, p] of Object.entries(pendientes.current)) { clearTimeout(p.timer); enviarStock(Number(id), p); }
  };
  useEffect(() => () => enviarPendientes(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const abrir = (id) => { enviarPendientes(); setDetail({ id }); };

  /* ---------- Listas y totales ---------- */
  // Búsqueda por nombre, SKU o categoría (los mismos campos que buscaba el server).
  const buscados = useMemo(() => {
    const t = search.trim().toLowerCase();
    const list = items || [];
    if (!t) return list;
    return list.filter((i) => [i.name, i.sku, i.category].some((v) => v && String(v).toLowerCase().includes(t)));
  }, [items, search]);

  const categorias = useMemo(() => {
    const map = {};
    for (const i of buscados) map[catDe(i)] = (map[catDe(i)] || 0) + 1;
    return Object.entries(map).sort(([a], [b]) => rangoCat(a) - rangoCat(b) || a.localeCompare(b, 'es'));
  }, [buscados]);
  const agotadosBuscados = buscados.filter((i) => Number(i.stock) <= 0).length;

  // Si la pestaña elegida se queda sin productos (búsqueda), vuelve a Todos.
  useEffect(() => {
    if (tab.startsWith('cat:') && !categorias.some(([c]) => 'cat:' + c === tab)) setTab('todos');
  }, [categorias, tab]);

  const visibles = useMemo(() => {
    const list = tab === 'agotados' ? buscados.filter((i) => Number(i.stock) <= 0)
      : tab.startsWith('cat:') ? buscados.filter((i) => 'cat:' + catDe(i) === tab)
        : buscados;
    // Con stock primero (por categoría de la tienda), los agotados al final.
    return [...list].sort((a, b) => ((Number(a.stock) <= 0) - (Number(b.stock) <= 0))
      || rangoCat(catDe(a)) - rangoCat(catDe(b)) || catDe(a).localeCompare(catDe(b), 'es')
      || String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  }, [buscados, tab]);

  const totals = useMemo(() => {
    if (!items) return null;
    const units = items.reduce((a, i) => a + Math.max(0, Number(i.stock) || 0), 0);
    const value = items.reduce((a, i) => a + Math.max(0, Number(i.stock) || 0) * (Number(i.price) || 0), 0);
    // Inversión = lo que costó el inventario actual (stock × costo).
    // Ganancia potencial = valor de venta − inversión; el % es el margen
    // sobre el precio de venta (costo vs venta).
    const inversion = items.reduce((a, i) => a + Math.max(0, Number(i.stock) || 0) * (Number(i.cost) || 0), 0);
    const ganancia = value - inversion;
    const margen = value > 0 ? (ganancia / value) * 100 : 0;
    const agotados = items.filter((i) => Number(i.stock) <= 0).length;
    return { products: items.length, units, value, inversion, ganancia, margen, agotados };
  }, [items]);

  const sub = totals && [
    plural(totals.products, 'producto', 'productos'),
    plural(totals.units, 'unidad', 'unidades'),
    `vale ${money(totals.inversion)} a costo`,
    totals.agotados > 0 && plural(totals.agotados, 'agotado', 'agotados'),
  ].filter(Boolean).join(' · ');

  /* ---------- Resumen del mes + inversión por mes (plegado, desde el ⋯) ---------- */
  const [compras, setCompras] = useState(null); // mercancía comprada por mes
  const [stockMes, setStockMes] = useState(null); // inventario al cierre de cada mes
  const [datosVentas, setDatosVentas] = useState(null); // ventas/gastos por mes
  useEffect(() => {
    if (!verResumen || compras) return;
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
  }, [verResumen]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [compras, stockMes, datosVentas, comprasOffset]); // eslint-disable-line react-hooks/exhaustive-deps

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
  }, [compras]); // eslint-disable-line react-hooks/exhaustive-deps

  if (detail) {
    const back = () => { setDetail(null); load(); };
    return (
      <FormPage title={detail.id ? 'Producto' : 'Nuevo producto'} onBack={back} max={1080}>
        <InventoryDetail itemId={detail.id} isAdmin onClose={back} onSaved={() => load()} />
      </FormPage>
    );
  }

  const tabs = [
    { v: 'todos', l: 'Todos', n: buscados.length },
    ...categorias.map(([c, n]) => ({ v: 'cat:' + c, l: c, n })),
    { v: 'agotados', l: 'Agotados', n: agotadosBuscados },
  ];

  return (
    <div className="inventory-page inv2">
      <PageHead title="Inventario" sub={sub} search={search} onSearch={setSearch}
        searchPlaceholder="Buscar nombre, SKU o categoría…">
        <button className="btn btn-primary" onClick={() => setDetail({ id: null })}>+ Nuevo producto</button>
        <MoreMenu items={[
          { label: verResumen ? 'Ocultar resumen del mes' : 'Ver resumen del mes e inversión', onClick: () => setVerResumen((v) => !v) },
        ]} />
      </PageHead>
      {err && <div className="alert alert-error">{err}</div>}

      {items == null ? <span className="spinner spinner-lg" />
        : items.length === 0 ? <div className="empty-state">No hay productos. Crea el primero.</div>
          : (
            <>
              <div className="mini-kpis">
                <div className="mini-kpi">
                  <div className="k">Valor a costo</div>
                  <div className="v">{money(totals.inversion)}</div>
                  <div className="s">lo que te costó (stock × costo)</div>
                </div>
                <div className="mini-kpi">
                  <div className="k">Valor a precio de venta</div>
                  <div className="v">{money(totals.value)}</div>
                  <div className="s">{plural(totals.units, 'unidad', 'unidades')}</div>
                </div>
                <div className="mini-kpi">
                  <div className="k">Ganancia potencial</div>
                  <div className="v">{money(totals.ganancia)}</div>
                  <div className="s">{totals.margen.toFixed(1).replace(/\.0$/, '')}% costo vs venta</div>
                </div>
                <button type="button" className={'mini-kpi inv2-kpi-btn' + (tab === 'agotados' ? ' on' : '')}
                  onClick={() => setTab((t) => (t === 'agotados' ? 'todos' : 'agotados'))}
                  title="Ver los productos agotados">
                  <div className="k">Agotados</div>
                  <div className={'v' + (totals.agotados > 0 ? ' inv2-v-bad' : '')}>{totals.agotados}</div>
                  <div className="s">{totals.agotados === 1 ? 'producto por reponer' : 'productos por reponer'}</div>
                </button>
              </div>

              {verResumen && (
                <div className="inv2-resumen">
                  {/* Resumen del mes: inversión, ventas, ganancia e inventario
                      que quedó al cierre (en dinero). Flechas ‹ › cambian de mes. */}
                  <div className="card">
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
                        {/* "Quedó en inventario" solo aplica a meses ya cerrados:
                            el mes en curso aún no tiene cierre. */}
                        {comprasOffset < 0 && (
                          <div className="stat-card">
                            <div className="k">Quedó en inventario</div>
                            <div className="v">{resumenMes.valorCierre == null ? '—' : money(resumenMes.valorCierre)}</div>
                            {resumenMes.valorCierre != null && (
                              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                                {resumenMes.stockCierre} {resumenMes.stockCierre === 1 ? 'unidad' : 'unidades'} (a costo, lo que te costaron)
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inversión total mes a mes (entradas de stock × costo). */}
                  {comprasChart && comprasChart.keys.length > 0 && (
                    <div className="card">
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
                </div>
              )}

              <Tabs tabs={tabs} value={tab} onChange={setTab} />
              {/* Subtotal de la categoría elegida (lo que antes iba en la fila de la categoría). */}
              {tab.startsWith('cat:') && visibles.length > 0 && (
                <div className="inv2-catline">
                  {tab.slice(4)}: {plural(visibles.reduce((a, i) => a + Math.max(0, Number(i.stock) || 0), 0), 'unidad', 'unidades')}
                  {' · '}{money(visibles.reduce((a, i) => a + Math.max(0, Number(i.stock) || 0) * (Number(i.price) || 0), 0))} a precio de venta
                </div>
              )}

              {visibles.length === 0 ? (
                <div className="empty-state">
                  {tab === 'agotados' ? 'Ningún producto agotado.' : search ? 'Ningún producto coincide con la búsqueda.' : 'No hay productos en esta categoría.'}
                </div>
              ) : (
                <div className="inv2-grid">
                  {visibles.map((i) => {
                    const est = estadoStock(i);
                    const stock = Number(i.stock) || 0;
                    return (
                      <div key={i.id} className={'inv2-card' + (stock <= 0 ? ' inv2-out' : '')}
                        role="button" tabIndex={0} title="Abrir producto"
                        onClick={() => abrir(i.id)}
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(i.id); } }}>
                        <div className="inv2-ph">
                          {i.image_url ? <img src={i.image_url} alt="" loading="lazy" /> : <IconoProducto item={i} />}
                        </div>
                        <div className="inv2-name" title={i.name}>{i.name}</div>
                        <div className="inv2-meta">{[i.sku, catDe(i)].filter(Boolean).join(' · ')}</div>
                        <div className="inv2-price">{money(i.price)}</div>
                        <div className="inv2-stock">
                          <span className={'st ' + est.cls}>{est.txt}</span>
                          {/* Ajuste rápido: no abre la tarjeta. El número también se puede escribir. */}
                          <span className="inv2-step" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                            <button type="button" aria-label={`Quitar una unidad de ${i.name}`} disabled={stock <= 0}
                              onClick={() => sumarStock(i, -1)}>−</button>
                            <input
                              key={i.id + ':' + stock}
                              className="inv2-n"
                              defaultValue={stock}
                              inputMode="numeric"
                              aria-label={`Unidades de ${i.name}`}
                              title="Escribe la cantidad (0 = agotado)"
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => { e.target.value = e.target.value.replace(/[^\d]/g, ''); }}
                              onBlur={(e) => { const n = Number(e.target.value.replace(/[^\d]/g, '')) || 0; if (n !== stock) cambiarStock(i, n, 0); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                            />
                            <button type="button" aria-label={`Agregar una unidad de ${i.name}`}
                              onClick={() => sumarStock(i, 1)}>+</button>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
    </div>
  );
}
