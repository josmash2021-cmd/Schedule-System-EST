import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import BarChart from '../components/BarChart.jsx';
import FormPage from '../components/FormPage.jsx';
import SaleForm from '../components/SaleForm.jsx';
import PageHead from '../components/PageHead.jsx';
import Tabs from '../components/Tabs.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import { fechaCorta, diaCorto } from '../fechas.js';
import './Sales.css';

/* Ventas (diseño nuevo, 2026-11-26): título "Ventas de <período>" + frase
   corta, pestañas Resumen · Ventas · Gastos · Por mes, y el selector de
   período (Hoy/Semana/Mes/Año con ‹ › para ir a períodos anteriores) que
   comparten Resumen, Ventas y Gastos. Lo peligroso ("Borrar todas las
   ventas") vive en el menú ⋯. */

// Fecha "de negocio": el taller opera en hora de Chicago.
function chicagoParts(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const hour = Number(p.hour) % 24;
  return { key: `${p.year}-${p.month}-${p.day}`, y: Number(p.year), m: Number(p.month), hour };
}

const addDays = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const addMonths = (mk, n) => {
  const [y, m] = mk.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
};
// Lunes–domingo de la semana actual desplazada `off` semanas.
function weekKeysOff(off) {
  const hoy = chicagoParts().key;
  const [y, m, d] = hoy.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const lunes = addDays(hoy, -dow + off * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
}
// Días de una semana que cuentan para ella: la semana en curso se ancla al
// mes de HOY (igual que el KPI de siempre); las pasadas, al mes de su jueves
// (convención ISO). En ambos casos solo cuentan los días de ese mes: cada
// día se suma a su propio mes.
function weekDays(off, curMonthKey) {
  const full = weekKeysOff(off);
  const anchor = off === 0 ? curMonthKey : full[3].slice(0, 7);
  const idx = full.map((_, i) => i).filter((i) => full[i].startsWith(anchor));
  return { full, idx, keys: idx.map((i) => full[i]) };
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DIA_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtBar = (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0));
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PERIODS = [
  { v: 'dia', l: 'Hoy' },
  { v: 'semana', l: 'Semana' },
  { v: 'mes', l: 'Mes' },
  { v: 'ano', l: 'Año' },
];

// Tipo fino de cada venta: para el filtro de la pestaña Ventas y la etiqueta.
const tipoDe = (s) => (s.tipo === 'venta' ? 'mostrador' : s.tipo === 'reparacion' ? 'reparacion' : s.origen === 'fb_marketplace' ? 'fb' : 'web');
const TIPO_LABEL = { mostrador: 'Mostrador', reparacion: 'Reparación', web: 'Web', fb: 'FB Marketplace' };
const TIPOS = [
  { v: 'todas', l: 'Todas' },
  { v: 'mostrador', l: 'Mostrador' },
  { v: 'reparacion', l: 'Reparación' },
  { v: 'web', l: 'Web' },
  { v: 'fb', l: 'FB Marketplace' },
];

// Líneas de impuestos/envío que Stripe agrega a los artículos de una orden:
// no cuentan como "artículo principal".
const LINEA_EXTRA = /^(impuestos?|tax(es)?|sales tax|env[ií]o|shipping)/i;
function articuloPrincipal(items) {
  const prods = (items || []).filter((i) => !LINEA_EXTRA.test(String(i.name || '').trim()));
  const first = prods[0];
  if (!first) return null;
  return (Number(first.qty) > 1 ? `${first.qty}× ` : '') + first.name + (prods.length > 1 ? ` +${prods.length - 1}` : '');
}

// Teléfono en formato US: "+12055550111" → "(205) 555-0111" (si no cuadra, tal cual).
function fmtPhone(p) {
  if (!p) return null;
  let digits = String(p).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length > 11) digits = digits.slice(-10);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return p;
}

// Nombre del mes: "noviembre" (o "octubre 2025" si no es del año en curso).
function mesNombre(mk, yHoy) {
  const [y, m] = mk.split('-').map(Number);
  return MES_LARGO[m - 1] + (y !== yHoy ? ` ${y}` : '');
}

// Qué días cuenta el período elegido, cómo se llama y cuál es el anterior
// (para comparar en el Resumen).
function rango(period, { day, weekOff, month, year }, now) {
  const curMonthKey = now.key.slice(0, 7);
  if (period === 'dia') {
    const prev = addDays(day, -1);
    return {
      match: (cp) => cp.key === day,
      actual: day >= now.key,
      titulo: day === now.key ? 'Ventas de hoy' : day === addDays(now.key, -1) ? 'Ventas de ayer' : `Ventas del ${diaCorto(day)}`,
      grafica: `Ventas por hora (${fechaCorta(day, { conHora: false })})`,
      anterior: { match: (cp) => cp.key === prev, nombre: day === now.key ? 'ayer' : `el ${diaCorto(prev)}` },
    };
  }
  if (period === 'semana') {
    const w = weekDays(weekOff, curMonthKey);
    const wp = weekDays(weekOff - 1, curMonthKey);
    return {
      match: (cp) => w.keys.includes(cp.key),
      actual: weekOff >= 0,
      week: w,
      titulo: weekOff === 0 ? 'Ventas de esta semana' : weekOff === -1 ? 'Ventas de la semana pasada' : `Ventas de la semana del ${diaCorto(w.full[0])}`,
      grafica: weekOff === 0 ? 'Ventas por día (esta semana)' : `Ventas por día (semana del ${diaCorto(w.full[0])})`,
      anterior: { match: (cp) => wp.keys.includes(cp.key), nombre: weekOff === 0 ? 'la semana pasada' : 'la semana anterior' },
    };
  }
  if (period === 'mes') {
    const prev = addMonths(month, -1);
    return {
      match: (cp) => cp.key.slice(0, 7) === month,
      actual: month >= curMonthKey,
      titulo: `Ventas de ${mesNombre(month, now.y)}`,
      grafica: `Ventas por día (${mesNombre(month, now.y)})`,
      anterior: { match: (cp) => cp.key.slice(0, 7) === prev, nombre: mesNombre(prev, now.y) },
    };
  }
  return {
    match: (cp) => cp.y === year,
    actual: year >= now.y,
    titulo: `Ventas de ${year}`,
    grafica: `Ventas por mes (${year})`,
    anterior: { match: (cp) => cp.y === year - 1, nombre: String(year - 1) },
  };
}

// Frase de comparación con el período anterior (Resumen → Vendido).
function comparar(cur, prev, nombre, actual) {
  if (prev <= 0) {
    if (cur <= 0) return { t: actual ? 'sin ventas todavía' : 'sin ventas', c: '' };
    return { t: `${nombre.charAt(0).toUpperCase() + nombre.slice(1)} no tuvo ventas`, c: '' };
  }
  if (cur === prev) return { t: `igual que ${nombre}`, c: '' };
  if (cur > prev) {
    if (actual) return { t: `▲ ya superaste ${nombre}`, c: 'st-ok' };
    return { t: `▲ ${Math.round(((cur - prev) / prev) * 100)}% más que ${nombre}`, c: 'st-ok' };
  }
  if (actual) return { t: `faltan ${usd.format(prev - cur)} para igualar ${nombre}`, c: '' };
  return { t: `▼ ${Math.round(((prev - cur) / prev) * 100)}% menos que ${nombre}`, c: 'st-bad' };
}

// Número que cuenta hacia arriba al cambiar el valor (animación de los KPIs).
function useCountUp(target, dur = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

function Kpi({ label, value, sub, subClass, onClick, title }) {
  const t = useCountUp(value);
  const props = onClick
    ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } }
    : {};
  return (
    <div className={'mini-kpi ven2-kpi' + (onClick ? ' ven2-kpi-btn' : '')} title={title} {...props}>
      <div className="k">{label}</div>
      <div className="v">{usd.format(t)}</div>
      {sub && <div className={'s ' + (subClass || '')}>{sub}</div>}
    </div>
  );
}

// Dato del detalle: etiqueta chica arriba, valor abajo.
function Dato({ k, children }) {
  return (
    <div className="ven2-dato">
      <span>{k}</span>
      <div>{children || '—'}</div>
    </div>
  );
}

// Detalle de una venta (abre debajo de su tarjeta al tocarla).
function SaleDetail({ s, busy, onAnular, navigate }) {
  const facturaBtn = s.tipo === 'online' ? null : s.invoiceId ? (
    <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/facturas?ver=${s.invoiceId}`)}
      title={`Ver la factura ${s.factura || ''}`}>Ver factura</button>
  ) : (
    <button className="btn btn-secondary btn-sm"
      onClick={() => navigate(s.tipo === 'venta' ? `/facturas?venta=${s.ventaId}` : `/facturas?reparacion=${s.repairId}`)}
      title="Crear factura (Bill of Sale)">Facturar</button>
  );
  const ganancia = s.price - (s.costo || 0);
  return (
    <div className="lcard-detail ven2-det">
      <div className="ven2-det-grid">
        {s.tipo === 'online' && (
          <>
            <Dato k="Cliente">{s.cliente}</Dato>
            <Dato k="Email">{s.email}</Dato>
            <Dato k="Teléfono">{fmtPhone(s.telefono)}</Dato>
            <Dato k="Dirección de envío">
              {s.direccion && <span style={{ whiteSpace: 'pre-line' }}>{String(s.direccion).split(' | ').filter(Boolean).join('\n')}</span>}
            </Dato>
            <Dato k="Origen">{s.origen === 'fb_marketplace' ? 'FB Marketplace' : 'Website'} · {fechaCorta(s.when)}</Dato>
          </>
        )}
        {s.tipo === 'venta' && (
          <>
            <Dato k="Cliente">{s.cliente}</Dato>
            <Dato k="Factura">{s.factura || 'sin factura'}</Dato>
            <Dato k="Pago">{s.pago || 'mostrador'}</Dato>
            <Dato k="Atendió">{s.quien}</Dato>
            <Dato k="Fecha">{fechaCorta(s.when)}</Dato>
            {s.nota && <Dato k="Nota">{s.nota}</Dato>}
          </>
        )}
        {s.tipo === 'reparacion' && (
          <>
            <Dato k="Cliente">{s.cliente}</Dato>
            <Dato k="Teléfono">{fmtPhone(s.telefono)}</Dato>
            <Dato k="Equipo">{s.concepto}</Dato>
            <Dato k="Atendió">{s.quien}</Dato>
            <Dato k="Entregada">{fechaCorta(s.when)}</Dato>
            {s.factura && <Dato k="Factura">{s.factura}</Dato>}
          </>
        )}
      </div>

      {(s.tipo === 'online' || s.tipo === 'venta') && (s.items || []).length > 0 && (
        <div className="ven2-items">
          <span className="ven2-lbl">Artículos</span>
          <ul>
            {s.items.map((i, idx) => (
              <li key={idx}>{i.qty > 1 ? `${i.qty}× ` : ''}{i.name} — {usd.format(Number(i.price) || 0)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="ven2-det-foot">
        <span>
          Total <span className="lcard-num">{usd.format(s.price)}</span>
          {s.tipo !== 'reparacion' && (
            s.costo > 0
              ? <span className="muted"> · costo {usd.format(s.costo)} · ganancia {usd.format(ganancia)}</span>
              : <span className="muted"> · sin costo registrado</span>
          )}
        </span>
        <div className="ven2-det-acts">
          {facturaBtn}
          {s.tipo === 'online' && (
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/ordenes')}>Ver en Órdenes</button>
          )}
          {s.tipo === 'venta' && (
            <button className="btn btn-ghost btn-sm ven2-danger" disabled={busy} onClick={() => onAnular(s)}
              title="Anular venta (repone stock)">Anular</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Tarjeta corta de una venta. `compact`: versión del Resumen (sin columnas
// de tipo/acción; la fecha va en la segunda línea).
function SaleCard({ s, open, onToggle, compact, busy, onAnular, navigate }) {
  const tipo = tipoDe(s);
  const titulo = s.tipo === 'venta' ? s.concepto : (s.cliente || s.concepto);
  // Orden online: artículo principal + correo (o teléfono) del cliente.
  const detalle = s.tipo === 'reparacion' ? s.concepto
    : s.tipo === 'online' ? ([articuloPrincipal(s.items), s.email || fmtPhone(s.telefono)].filter(Boolean).join(' · ')
      || (s.origen === 'fb_marketplace' ? 'FB Marketplace' : 'compra web'))
      : [s.factura && `Factura ${s.factura}`, s.cliente, s.pago || (compact ? null : 'mostrador')].filter(Boolean).join(' · ');
  const sub = compact
    ? [fechaCorta(s.when), TIPO_LABEL[tipo], detalle].filter(Boolean).join(' · ')
    : [detalle, s.quien && `atendió ${s.quien}`].filter(Boolean).join(' · ');
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <>
      <div className={'lcard click ven2-card' + (compact ? ' compact' : '') + (open ? ' sel' : '')}
        role="button" tabIndex={0} aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}>
        {!compact && <span className="ven2-when">{fechaCorta(s.when)}</span>}
        <div className="lcard-main">
          <div className="lcard-title">{titulo}</div>
          <div className="lcard-sub">{sub}</div>
        </div>
        {!compact && <span className={'st ven2-tipo ven2-t-' + tipo}>{TIPO_LABEL[tipo]}</span>}
        <span className="lcard-num ven2-precio">{usd.format(s.price)}</span>
        {!compact && (
          <span className="ven2-quick">
            {s.tipo !== 'online' && (s.invoiceId ? (
              <button className="btn btn-ghost btn-sm" onClick={stop(() => navigate(`/facturas?ver=${s.invoiceId}`))}
                title={`Ver la factura ${s.factura || ''}`}>Ver factura</button>
            ) : (
              <button className="btn btn-ghost btn-sm"
                onClick={stop(() => navigate(s.tipo === 'venta' ? `/facturas?venta=${s.ventaId}` : `/facturas?reparacion=${s.repairId}`))}
                title="Crear factura (Bill of Sale)">Facturar</button>
            ))}
          </span>
        )}
        <span className="ven2-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </div>
      {open && <SaleDetail s={s} busy={busy} onAnular={onAnular} navigate={navigate} />}
    </>
  );
}

export default function Sales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const paramFecha = searchParams.get('fecha');
  const fechaOk = /^\d{4}-\d{2}-\d{2}$/.test(paramFecha || '');
  const [tickets, setTickets] = useState(null);
  const [directas, setDirectas] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [ordenes, setOrdenes] = useState(null);
  const [comprasMes, setComprasMes] = useState(null); // inversión en inventario por mes
  const [stockMes, setStockMes] = useState(null); // inventario al cierre de cada mes
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [gastoForm, setGastoForm] = useState(false);
  const [tab, setTab] = useState('resumen'); // resumen | ventas | gastos | mes
  const [q, setQ] = useState(''); // buscador del encabezado
  const [tipoF, setTipoF] = useState('todas'); // filtro por tipo (pestaña Ventas)
  const [openKey, setOpenKey] = useState(null); // venta con el detalle abierto
  // Menú "+ Nuevo → Venta": /ventas?nueva=1 abre el formulario.
  useEffect(() => {
    if (!searchParams.get('nueva')) return;
    setRegistering(true);
    setSearchParams({}, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tick, setTick] = useState(0);
  // Período: ?fecha=YYYY-MM-DD (barra del Dashboard) abre ese día.
  const [period, setPeriod] = useState(fechaOk ? 'dia' : 'mes');
  const [day, setDay] = useState(fechaOk ? paramFecha : chicagoParts().key);
  const [weekOff, setWeekOff] = useState(0); // 0 = semana en curso, -1 = la pasada…
  const [month, setMonth] = useState(chicagoParts().key.slice(0, 7));
  const [year, setYear] = useState(chicagoParts().y);
  useEffect(() => {
    if (!fechaOk) return;
    setPeriod('dia'); setDay(paramFecha); setTab('resumen');
  }, [paramFecha]); // eslint-disable-line react-hooks/exhaustive-deps

  // Formulario de gasto
  const [expDesc, setExpDesc] = useState('');
  const [expCat, setExpCat] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  const load = () => Promise.all([
    api('/repairs').then((d) => setTickets(d.tickets || [])),
    api('/sales').then((d) => setDirectas(d.sales || [])),
    api('/expenses').then((d) => setExpenses(d.expenses || [])),
    api('/orders').then((d) => setOrdenes(d.orders || [])),
    api('/inventory/purchases-by-month').then((d) => setComprasMes(d.months || [])).catch(() => setComprasMes([])),
    api('/inventory/stock-by-month').then((d) => setStockMes(d.months || [])).catch(() => setStockMes([])),
  ]).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargado = tickets != null && directas != null && expenses != null && ordenes != null;

  // Ventas = reparaciones entregadas + ventas directas del mostrador + órdenes online.
  // Cualquier fuente nueva debe añadirse también en Dashboard.jsx (ventasTodas).
  const sales = useMemo(() => {
    const deReparacion = (tickets || [])
      .filter((t) => t.status === 'entregado' && t.delivered_at)
      .map((t) => ({
        key: 'r' + t.id, repairId: t.id, tipo: 'reparacion', price: Number(t.final_price) || 0, when: t.delivered_at, costo: 0,
        concepto: [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'Reparación',
        // Factura vinculada a mano en el ticket (si la hay): "Ver factura".
        invoiceId: t.invoice_id || null, factura: t.invoice_number || null,
        cliente: t.customer_name || null, telefono: t.customer_phone || null,
        quien: t.assignee_username || null, cp: chicagoParts(new Date(t.delivered_at)),
      }));
    // Incluye las ventas que generan las facturas hechas a mano (Facturas):
    // traen su factura (invoiceId/numero) y el cliente de la factura.
    const deMostrador = (directas || []).map((v) => ({
      key: 'v' + v.id, ventaId: v.id, tipo: 'venta', price: Number(v.total) || 0, when: v.created_at,
      // Costo de lo vendido (foto del momento de la venta; null en viejas/libres = 0).
      costo: (v.items || []).reduce((a, i) => a + (Number(i.cost) || 0) * (Number(i.qty) || 0), 0),
      concepto: (v.items || []).map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ') || 'Venta',
      items: v.items || [], nota: v.note || null,
      invoiceId: v.invoice_id || null, factura: v.invoice_number || null,
      cliente: v.invoice_buyer || null, telefono: null, pago: v.payment_method || null,
      quien: v.seller_username || null, cp: chicagoParts(new Date(v.created_at)),
    }));
    // Órdenes online (Stripe) y FB Marketplace: el costo viene de la orden
    // (web: inventario ligado por invId; FB: lo escribe el dueño). El detalle
    // del cliente (email, teléfono, dirección de envío) se muestra al
    // tocar la tarjeta.
    const deOnline = (ordenes || []).map((o) => ({
      key: 'o' + o.id, orderId: o.id, tipo: 'online', price: Number(o.total) || 0, when: o.created_at,
      costo: Number(o.costo) || 0,
      concepto: (o.items || []).map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ') || 'Compra web',
      items: o.items || [],
      cliente: o.customer_name || null, email: o.email || null, telefono: o.phone || null, direccion: o.address || null,
      origen: o.origen || 'website',
      quien: null, cp: chicagoParts(new Date(o.created_at)),
    }));
    return [...deReparacion, ...deMostrador, ...deOnline];
  }, [tickets, directas, ordenes]);

  const expensesCp = useMemo(() => (expenses || []).map((e) => ({ ...e, cp: chicagoParts(new Date(e.created_at)) })), [expenses]);

  // Resumen contable por mes: ventas, ganancia (ventas − costo vendido −
  // gastos), inversión en inventario (compras) e inventario al cierre.
  // Todos los meses con CUALQUIER actividad, más reciente primero.
  const resumenMensual = useMemo(() => {
    if (!cargado || comprasMes == null || stockMes == null) return null;
    const meses = new Set();
    for (const s of sales) meses.add(s.cp.key.slice(0, 7));
    for (const e of expensesCp) meses.add(e.cp.key.slice(0, 7));
    for (const c of comprasMes) meses.add(c.mes);
    for (const s of stockMes) meses.add(s.mes);
    const compraPorMes = Object.fromEntries(comprasMes.map((c) => [c.mes, c]));
    const stockPorMes = Object.fromEntries(stockMes.map((s) => [s.mes, s]));
    return [...meses].sort().reverse().map((mes) => {
      const ss = sales.filter((s) => s.cp.key.slice(0, 7) === mes);
      const ventas = ss.reduce((a, s) => a + s.price, 0);
      const costo = ss.reduce((a, s) => a + (s.costo || 0), 0);
      const gastos = expensesCp.filter((e) => e.cp.key.slice(0, 7) === mes).reduce((a, e) => a + Number(e.amount || 0), 0);
      const c = compraPorMes[mes];
      const st = stockPorMes[mes];
      return {
        mes,
        ventas,
        ganancia: ventas - costo - gastos,
        gastos,
        inversion: c ? c.total : 0,
        unidadesCompradas: c ? c.unidades : 0,
        stockCierre: st ? st.unidades : null,
        valorCierreCosto: st ? st.valorCosto : null,
      };
    });
  }, [cargado, sales, expensesCp, comprasMes, stockMes]);

  const now = chicagoParts();
  const curMonthKey = now.key.slice(0, 7);
  const r = rango(period, { day, weekOff, month, year }, now);
  const [selY, selM] = month.split('-').map(Number);

  const sum = (list) => list.reduce((a, s) => a + s.price, 0);
  const sumAmount = (list) => list.reduce((a, e) => a + Number(e.amount || 0), 0);

  // Ventas y gastos del período elegido (más reciente primero).
  const shown = sales.filter((s) => r.match(s.cp)).sort((a, b) => (a.when < b.when ? 1 : -1));
  const shownExpenses = expensesCp.filter((e) => r.match(e.cp)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const shownTotal = sum(shown);
  const shownExpensesTotal = sumAmount(shownExpenses);
  const costoPeriodo = shown.reduce((a, s) => a + (s.costo || 0), 0);
  // Ganancia del período = ventas − costo de lo vendido − gastos (misma
  // fórmula que la tarjeta de antes y que el Resumen por mes).
  const ganancia = shownTotal - costoPeriodo - shownExpensesTotal;
  const prevTotal = sum(sales.filter((s) => r.anterior.match(s.cp)));
  const cmp = comparar(shownTotal, prevTotal, r.anterior.nombre, r.actual);

  // Buscador + filtro por tipo (pestaña Ventas) y buscador de gastos.
  const qn = sinAcentos(q.trim());
  const coincide = (s) => !qn || sinAcentos([
    s.concepto, s.cliente, s.email, s.telefono, s.factura, s.quien, s.pago, TIPO_LABEL[tipoDe(s)],
  ].filter(Boolean).join(' ')).includes(qn);
  const buscadas = shown.filter(coincide);
  const porTipo = TIPOS.reduce((m, t) => ({ ...m, [t.v]: t.v === 'todas' ? buscadas.length : buscadas.filter((s) => tipoDe(s) === t.v).length }), {});
  const listaVentas = tipoF === 'todas' ? buscadas : buscadas.filter((s) => tipoDe(s) === tipoF);
  const listaGastos = !qn ? shownExpenses
    : shownExpenses.filter((e) => sinAcentos([e.description, e.category, e.created_by_username].filter(Boolean).join(' ')).includes(qn));

  // Datos del gráfico según el período.
  let chart = null;
  if (cargado) {
    if (period === 'dia') {
      // Horario normal 8h–20h; se amplía si hubo ventas antes o después
      // (p. ej. órdenes web de madrugada) para que ninguna quede fuera.
      const horas = shown.map((s) => s.cp.hour);
      const h0 = Math.min(8, ...horas);
      const h1 = Math.max(20, ...horas);
      const keys = []; const labels = [];
      for (let h = h0; h <= h1; h++) { keys.push(String(h)); labels.push(h + 'h'); }
      const data = keys.map(() => 0);
      for (const s of shown) {
        const i = keys.indexOf(String(s.cp.hour));
        if (i >= 0) data[i] += s.price;
      }
      chart = { data, keys, labels, highlight: day === now.key ? String(now.hour) : null };
    } else if (period === 'semana') {
      const wk = r.week.keys;
      const data = wk.map(() => 0);
      for (const s of shown) data[wk.indexOf(s.cp.key)] += s.price;
      chart = { data, keys: wk, labels: r.week.idx.map((i) => DAY_LABELS[i]), highlight: now.key };
    } else if (period === 'mes') {
      const days = new Date(Date.UTC(selY, selM, 0)).getUTCDate();
      const keys = []; const labels = [];
      for (let d = 1; d <= days; d++) { keys.push(String(d)); labels.push(String(d)); }
      const data = keys.map(() => 0);
      for (const s of shown) data[Number(s.cp.key.slice(8, 10)) - 1] += s.price;
      chart = { data, keys, labels, highlight: month === curMonthKey ? String(Number(now.key.slice(8, 10))) : null };
    } else {
      const keys = []; const labels = MONTH_LABELS.slice();
      for (let m = 1; m <= 12; m++) keys.push(String(m));
      const data = keys.map(() => 0);
      for (const s of shown) data[s.cp.m - 1] += s.price;
      chart = { data, keys, labels, highlight: year === now.y ? String(now.m) : null };
    }
  }

  // Frase corta del encabezado: "6 ventas · la mejor fue el jueves".
  const mejor = (() => {
    if (!chart || shown.length < 2) return '';
    if (period === 'dia') return `la más grande: ${usd.format(Math.max(...shown.map((s) => s.price)))}`;
    const max = Math.max(...chart.data);
    if (max <= 0) return '';
    const i = chart.data.indexOf(max);
    if (period === 'semana') return `la mejor fue el ${DIA_LARGO[r.week.idx[i]]}`;
    if (period === 'mes') return `el mejor día fue el ${diaCorto(`${month}-${chart.keys[i].padStart(2, '0')}`)}`;
    return `el mejor mes fue ${MES_LARGO[i]}`;
  })();
  const sub = !cargado ? 'Cargando…'
    : tab === 'mes' ? (resumenMensual ? plural(resumenMensual.length, 'mes con movimiento', 'meses con movimiento') : 'Cargando…')
      : shown.length === 0 ? (r.actual ? 'Todavía no hay ventas en este período' : 'Sin ventas en este período')
        : [plural(shown.length, 'venta', 'ventas'), mejor].filter(Boolean).join(' · ');

  // Después de registrar algo, el período vuelve al actual para que se vea.
  const irAlActual = () => {
    if (r.actual) return;
    if (period === 'dia') setDay(now.key);
    else if (period === 'semana') setWeekOff(0);
    else if (period === 'mes') setMonth(curMonthKey);
    else setYear(now.y);
  };

  const resetSales = async () => {
    if (!sales.length) return;
    if (!window.confirm(`¿Borrar TODAS las ventas (${sales.length})?\n\nSe borran las ventas de mostrador y las reparaciones entregadas (desaparecen también de Reparaciones). Las reparaciones en curso no se tocan y el stock no cambia. No se puede deshacer.`)) return;
    if (!window.confirm('Última confirmación: la página de Ventas quedará en blanco.')) return;
    setBusy(true); setErr('');
    try {
      await api('/repairs', { method: 'DELETE', body: { delivered: true } });
      await api('/sales', { method: 'DELETE', body: { all: true } });
      setTick((t) => t + 1);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const anular = async (s) => {
    const conFactura = s.factura ? `\nLa factura ${s.factura} no se borra: queda como factura sin venta.` : '';
    if (!window.confirm(`¿Anular la venta de ${usd.format(s.price)} (${s.concepto})?\n\nSe repone el stock de los productos vendidos.${conFactura}`)) return;
    setBusy(true); setErr('');
    try {
      await api('/sales/' + s.ventaId, { method: 'DELETE' });
      setOpenKey(null);
      setTick((t) => t + 1);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const addExpense = async (e) => {
    e.preventDefault();
    setErr('');
    const amount = Number(expAmount);
    if (!expDesc.trim() || !Number.isFinite(amount) || amount <= 0) { setErr('Completa descripción y monto del gasto.'); return; }
    setSavingExpense(true);
    try {
      await api('/expenses', { method: 'POST', body: { description: expDesc.trim(), category: expCat.trim(), amount } });
      setExpDesc(''); setExpCat(''); setExpAmount('');
      setGastoForm(false);
      setTab('gastos'); setQ(''); irAlActual();
      setTick((t) => t + 1);
    } catch (err2) { setErr(err2.message); }
    setSavingExpense(false);
  };

  const deleteExpense = async (id) => {
    if (!window.confirm('¿Eliminar este gasto?')) return;
    setBusy(true); setErr('');
    try {
      await api('/expenses/' + id, { method: 'DELETE' });
      setTick((t) => t + 1);
    } catch (err2) { setErr(err2.message); }
    setBusy(false);
  };

  const onBar = (k) => {
    if (period === 'semana') { setPeriod('dia'); setDay(k); }
    else if (period === 'mes') { setPeriod('dia'); setDay(`${month}-${k.padStart(2, '0')}`); }
    else if (period === 'ano') { setPeriod('mes'); setMonth(`${year}-${k.padStart(2, '0')}`); }
  };

  // ‹ › del selector: período anterior / siguiente (nunca al futuro).
  const mover = (n) => {
    if (period === 'dia') { const d = addDays(day, n); if (d <= now.key) setDay(d); }
    else if (period === 'semana') setWeekOff((o) => Math.min(0, o + n));
    else if (period === 'mes') { const m = addMonths(month, n); if (m <= curMonthKey) setMonth(m); }
    else setYear((y) => Math.min(now.y, y + n));
  };

  if (registering) {
    return (
      <FormPage title="Registrar venta" onBack={() => setRegistering(false)} max={680}>
        <SaleForm
          onCancel={() => setRegistering(false)}
          onSaved={() => {
            // La venta nueva se ve sin cambiar de pestaña: Resumen (Últimas
            // ventas) o la lista de Ventas, en el período actual y sin filtros.
            setRegistering(false);
            if (tab === 'gastos' || tab === 'mes') setTab('resumen');
            setQ(''); setTipoF('todas'); irAlActual();
            setTick((t) => t + 1);
          }}
        />
      </FormPage>
    );
  }

  if (gastoForm) {
    return (
      <FormPage title="Nuevo gasto" onBack={() => setGastoForm(false)} max={560}>
        <form onSubmit={addExpense}>
          {err && <div className="alert alert-error">{err}</div>}
          <label className="field"><span>Descripción</span><input value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="ej. Compra de repuestos" required autoFocus /></label>
          <div className="rd-grid">
            <label className="field"><span>Categoría</span><input value={expCat} onChange={(e) => setExpCat(e.target.value)} placeholder="ej. Refacciones" /></label>
            <label className="field"><span>Monto ($)</span><input type="number" min="0.01" step="0.01" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0.00" required /></label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setGastoForm(false)} disabled={savingExpense}>Cancelar</button>
            <button className="btn btn-primary" disabled={savingExpense}>{savingExpense ? <span className="spinner" /> : 'Registrar gasto'}</button>
          </div>
        </form>
      </FormPage>
    );
  }

  const toggle = (k) => setOpenKey((o) => (o === k ? null : k));
  const cardProps = { busy, onAnular: anular, navigate };

  // Selector de período (Resumen, Ventas y Gastos).
  const periodo = (
    <div className="ven2-periodo">
      <div className="ven2-seg" role="group" aria-label="Período">
        {PERIODS.map((p) => (
          <button key={p.v} type="button" className={'ven2-seg-btn' + (period === p.v ? ' on' : '')}
            onClick={() => {
              setPeriod(p.v);
              if (p.v === 'dia') setDay(now.key);
              if (p.v === 'semana') setWeekOff(0);
            }}>
            {p.l}
          </button>
        ))}
      </div>
      <div className="ven2-nav">
        <button type="button" className="ven2-arrow" onClick={() => mover(-1)} title="Período anterior" aria-label="Período anterior">‹</button>
        {period === 'dia' && (
          <input type="date" value={day} max={now.key} onChange={(e) => e.target.value && setDay(e.target.value)} />
        )}
        {period === 'semana' && (
          <span className="ven2-rango">{r.week.keys.length ? `${diaCorto(r.week.keys[0])} – ${diaCorto(r.week.keys[r.week.keys.length - 1])}` : '—'}</span>
        )}
        {period === 'mes' && (
          <input type="month" value={month} max={curMonthKey} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        )}
        {period === 'ano' && <span className="ven2-rango">{year}</span>}
        <button type="button" className="ven2-arrow" onClick={() => mover(1)} disabled={r.actual} title="Período siguiente" aria-label="Período siguiente">›</button>
      </div>
    </div>
  );

  return (
    <div className="sales-page ven2">
      <PageHead
        title={tab === 'mes' ? 'Ventas mes a mes' : r.titulo}
        sub={sub}
        search={q}
        onSearch={(v) => { setQ(v); if (v && (tab === 'resumen' || tab === 'mes')) setTab('ventas'); }}
        searchPlaceholder={tab === 'gastos' ? 'Buscar gasto…' : 'Buscar venta, cliente o factura…'}
      >
        <button className="btn btn-secondary" onClick={() => { setErr(''); setGastoForm(true); }}>+ Gasto</button>
        <button className="btn btn-primary" onClick={() => setRegistering(true)}>+ Registrar venta</button>
        <MoreMenu items={sales.length ? [
          { label: 'Borrar todas las ventas', onClick: resetSales, danger: true, disabled: busy },
        ] : []} />
      </PageHead>

      {err && <div className="alert alert-error">{err}</div>}

      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); setOpenKey(null); }}
        tabs={[
          { v: 'resumen', l: 'Resumen' },
          { v: 'ventas', l: 'Ventas', n: cargado ? shown.length : null },
          { v: 'gastos', l: 'Gastos', n: cargado ? shownExpenses.length : null },
          { v: 'mes', l: 'Por mes' },
        ]}
      />

      {tab !== 'mes' && periodo}

      {!cargado ? (
        <div className="ven2-cargando"><span className="spinner spinner-lg" /></div>
      ) : tab === 'resumen' ? (
        <>
          <div className="mini-kpis ven2-kpis">
            <Kpi label="Vendido" value={shownTotal} sub={cmp.t} subClass={cmp.c} />
            <Kpi label="Gastos" value={shownExpensesTotal} sub={plural(shownExpenses.length, 'gasto', 'gastos')}
              onClick={() => setTab('gastos')} title="Ver los gastos del período" />
            <Kpi label="Te queda (ganancia)" value={ganancia}
              sub={shownTotal > 0 ? (ganancia < 0 ? 'los gastos superan lo ganado' : `${Math.round((ganancia / shownTotal) * 100)}% de cada venta`) : 'sin ventas en el período'}
              title={`Ganancia = vendido − costo de lo vendido (${usd.format(costoPeriodo)}) − gastos`} />
          </div>

          <div className="ven2-res">
            <div className="card ven2-chart">
              <h3>{r.grafica}</h3>
              {chart && (
                <BarChart data={chart.data} keys={chart.keys} labels={chart.labels} highlight={chart.highlight}
                  format={fmtBar} onDay={period === 'dia' ? null : onBar} />
              )}
              {period !== 'dia' && <div className="muted ven2-hint">Toca una barra para ver el detalle.</div>}
            </div>

            <div className="card ven2-ult">
              <h3>Últimas ventas del período</h3>
              {shown.length === 0 ? (
                <div className="empty ven2-empty">No hay ventas en este período.</div>
              ) : (
                <div className="lcards">
                  {shown.slice(0, 5).map((s) => (
                    <SaleCard key={s.key} s={s} compact open={openKey === s.key} onToggle={() => toggle(s.key)} {...cardProps} />
                  ))}
                </div>
              )}
              {shown.length > 0 && (
                <button type="button" className="btn btn-ghost btn-sm ven2-vertodas" onClick={() => setTab('ventas')}>
                  {shown.length > 5 ? `Ver las ${shown.length} ventas →` : 'Ver en la lista →'}
                </button>
              )}
            </div>
          </div>
        </>
      ) : tab === 'ventas' ? (
        <>
          <div className="ven2-filtros" role="group" aria-label="Filtrar por tipo">
            {TIPOS.map((t) => (
              <button key={t.v} type="button" className={'ven2-chip' + (tipoF === t.v ? ' on' : '')} onClick={() => setTipoF(t.v)}>
                {t.l}{porTipo[t.v] ? <b>{porTipo[t.v]}</b> : null}
              </button>
            ))}
          </div>
          {listaVentas.length === 0 ? (
            <div className="empty-state">{shown.length === 0 ? 'No hay ventas en este período.' : 'Ninguna venta coincide con la búsqueda o el filtro.'}</div>
          ) : (
            <>
              <div className="lcards">
                {listaVentas.map((s) => (
                  <SaleCard key={s.key} s={s} open={openKey === s.key} onToggle={() => toggle(s.key)} {...cardProps} />
                ))}
              </div>
              <div className="ven2-total">
                <span>
                  {listaVentas.length === shown.length ? 'Total del período' : 'Total de lo mostrado'}
                  <span className="muted"> · {plural(listaVentas.length, 'venta', 'ventas')}</span>
                </span>
                <span className="lcard-num">{usd.format(sum(listaVentas))}</span>
              </div>
            </>
          )}
        </>
      ) : tab === 'gastos' ? (
        listaGastos.length === 0 ? (
          <div className="empty-state">
            <div>{shownExpenses.length === 0 ? 'No hay gastos en este período.' : 'Ningún gasto coincide con la búsqueda.'}</div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => { setErr(''); setGastoForm(true); }}>+ Registrar gasto</button>
          </div>
        ) : (
          <>
            <div className="lcards">
              {listaGastos.map((e) => (
                <div className="lcard ven2-card ven2-gasto" key={e.id}>
                  <span className="ven2-when">{fechaCorta(e.created_at)}</span>
                  <div className="lcard-main">
                    <div className="lcard-title">{e.description}</div>
                    <div className="lcard-sub">{[e.category || 'sin categoría', e.created_by_username && `registró ${e.created_by_username}`].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className="lcard-num ven2-precio">{usd.format(e.amount)}</span>
                  <span className="ven2-quick">
                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => deleteExpense(e.id)}>Eliminar</button>
                  </span>
                </div>
              ))}
            </div>
            <div className="ven2-total">
              <span>Total gastos<span className="muted"> · {plural(listaGastos.length, 'gasto', 'gastos')}</span></span>
              <span className="lcard-num">{usd.format(sumAmount(listaGastos))}</span>
            </div>
          </>
        )
      ) : (
        /* Contabilidad mes a mes: ventas, ganancia, inversión e inventario al cierre. */
        resumenMensual == null ? (
          <div className="ven2-cargando"><span className="spinner spinner-lg" /></div>
        ) : resumenMensual.length === 0 ? (
          <div className="empty-state">Todavía no hay movimiento para resumir.</div>
        ) : (
          <div className="card">
            <h3>Resumen por mes</h3>
            <div className="table-wrap">
              <table className="data ven2-meses">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th style={{ textAlign: 'right' }}>Ventas</th>
                    <th style={{ textAlign: 'right' }}>Ganancia</th>
                    <th style={{ textAlign: 'right' }}>Inversión (compras)</th>
                    <th style={{ textAlign: 'right' }}>Inventario al cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {resumenMensual.map((m) => (
                    <tr key={m.mes} className="ven2-mes-row" title="Ver este mes en el Resumen"
                      onClick={() => { setPeriod('mes'); setMonth(m.mes); setTab('resumen'); }}>
                      <td>{MONTH_LABELS[Number(m.mes.slice(5, 7)) - 1]} {m.mes.slice(0, 4)}</td>
                      <td style={{ textAlign: 'right' }}>{usd.format(m.ventas)}</td>
                      <td style={{ textAlign: 'right' }}>{usd.format(m.ganancia)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {usd.format(m.inversion)}
                        <div className="muted" style={{ fontSize: 12 }}>{m.unidadesCompradas} unidades</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {m.stockCierre == null ? '—' : (
                          <>
                            {usd.format(m.valorCierreCosto)}
                            <div className="muted" style={{ fontSize: 12 }}>{m.stockCierre} unidades (a costo)</div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Ganancia = ventas − costo de lo vendido − gastos del mes. Inversión = entradas de inventario × costo. Inventario al cierre = unidades que quedaban al terminar el mes, valuadas a costo. Toca un mes para verlo en el Resumen.
            </div>
          </div>
        )
      )}
    </div>
  );
}
