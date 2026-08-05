import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import BarChart from '../components/BarChart.jsx';
import FormPage from '../components/FormPage.jsx';
import SaleForm from '../components/SaleForm.jsx';

// Fecha "de negocio": el taller opera en hora de Chicago.
function chicagoParts(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const hour = Number(p.hour) % 24;
  return { key: `${p.year}-${p.month}-${p.day}`, y: Number(p.year), m: Number(p.month), hour };
}

function weekKeys() {
  const [y, m, d] = chicagoParts().key.split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const fmtBar = (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0));

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

function Kpi({ label, total, count }) {
  const t = useCountUp(total);
  const n = useCountUp(count);
  return (
    <div className="stat-card">
      <div className="stat-top"><div className="k">{label}</div></div>
      <div className="v">{usd.format(t)}</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
        {Math.round(n)} venta{Math.round(n) === 1 ? '' : 's'}
      </div>
    </div>
  );
}

const PERIODS = [
  { v: 'dia', l: 'Hoy' },
  { v: 'semana', l: 'Semana' },
  { v: 'mes', l: 'Mes' },
  { v: 'ano', l: 'Año' },
];

export default function Sales() {
  const [searchParams] = useSearchParams();
  const paramFecha = searchParams.get('fecha');
  const [tickets, setTickets] = useState(null);
  const [directas, setDirectas] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [tick, setTick] = useState(0);
  const [period, setPeriod] = useState(/^\d{4}-\d{2}-\d{2}$/.test(paramFecha || '') ? 'dia' : 'semana');
  const [day, setDay] = useState(/^\d{4}-\d{2}-\d{2}$/.test(paramFecha || '') ? paramFecha : chicagoParts().key);
  const [month, setMonth] = useState(chicagoParts().key.slice(0, 7));

  const load = () => Promise.all([
    api('/repairs').then((d) => setTickets(d.tickets || [])),
    api('/sales').then((d) => setDirectas(d.sales || [])),
  ]).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargado = tickets != null && directas != null;

  // Ventas = reparaciones entregadas + ventas directas del mostrador, todas
  // con su fecha/hora de Chicago y una forma común para KPIs/gráfico/tabla.
  const sales = useMemo(() => {
    const deReparacion = (tickets || [])
      .filter((t) => t.status === 'entregado' && t.delivered_at)
      .map((t) => ({
        key: 'r' + t.id, tipo: 'reparacion', price: Number(t.final_price) || 0, when: t.delivered_at,
        concepto: [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'Reparación',
        cliente: t.customer_name || null, telefono: t.customer_phone || null,
        quien: t.assignee_username || null, cp: chicagoParts(new Date(t.delivered_at)),
      }));
    const deMostrador = (directas || []).map((v) => ({
      key: 'v' + v.id, ventaId: v.id, tipo: 'venta', price: Number(v.total) || 0, when: v.created_at,
      concepto: (v.items || []).map((i) => (i.qty > 1 ? `${i.qty}× ${i.name}` : i.name)).join(', ') || 'Venta',
      cliente: null, telefono: null, pago: v.payment_method || null,
      quien: v.seller_username || null, cp: chicagoParts(new Date(v.created_at)),
    }));
    return [...deReparacion, ...deMostrador];
  }, [tickets, directas]);

  const now = chicagoParts();
  const wk = weekKeys();
  const curMonthKey = now.key.slice(0, 7);
  // Mes seleccionado (la vista Mes permite elegir meses pasados).
  const [selY, selM] = month.split('-').map(Number);
  const monthLabel = `${MONTH_LABELS[selM - 1]} ${selY}`;

  const inPeriod = (s, p) => {
    if (p === 'dia') return s.cp.key === day;
    if (p === 'semana') return wk.includes(s.cp.key);
    if (p === 'mes') return s.cp.key.slice(0, 7) === month;
    return s.cp.y === now.y;
  };

  const sum = (list) => list.reduce((a, s) => a + s.price, 0);
  const kpis = cargado ? {
    dia: { total: sum(sales.filter((s) => s.cp.key === now.key)), count: sales.filter((s) => s.cp.key === now.key).length },
    semana: { total: sum(sales.filter((s) => wk.includes(s.cp.key))), count: sales.filter((s) => wk.includes(s.cp.key)).length },
    mes: { total: sum(sales.filter((s) => s.cp.key.slice(0, 7) === curMonthKey)), count: sales.filter((s) => s.cp.key.slice(0, 7) === curMonthKey).length },
    ano: { total: sum(sales.filter((s) => s.cp.y === now.y)), count: sales.filter((s) => s.cp.y === now.y).length },
  } : null;

  // Datos del gráfico según el período.
  let chart = null;
  if (cargado) {
    if (period === 'dia') {
      const keys = []; const labels = [];
      for (let h = 8; h <= 20; h++) { keys.push(String(h)); labels.push(h + 'h'); }
      const data = keys.map(() => 0);
      for (const s of sales.filter((x) => inPeriod(x, 'dia'))) {
        const i = keys.indexOf(String(s.cp.hour));
        if (i >= 0) data[i] += s.price;
      }
      chart = { data, keys, labels, highlight: day === now.key ? String(now.hour) : null };
    } else if (period === 'semana') {
      const data = wk.map(() => 0);
      for (const s of sales.filter((x) => inPeriod(x, 'semana'))) data[wk.indexOf(s.cp.key)] += s.price;
      chart = { data, keys: wk, labels: DAY_LABELS, highlight: now.key };
    } else if (period === 'mes') {
      const days = new Date(Date.UTC(selY, selM, 0)).getUTCDate();
      const keys = []; const labels = [];
      for (let d = 1; d <= days; d++) { keys.push(String(d)); labels.push(String(d)); }
      const data = keys.map(() => 0);
      for (const s of sales.filter((x) => inPeriod(x, 'mes'))) data[Number(s.cp.key.slice(8, 10)) - 1] += s.price;
      chart = { data, keys, labels, highlight: month === curMonthKey ? String(Number(now.key.slice(8, 10))) : null };
    } else {
      const keys = []; const labels = MONTH_LABELS.slice();
      for (let m = 1; m <= 12; m++) keys.push(String(m));
      const data = keys.map(() => 0);
      for (const s of sales.filter((x) => inPeriod(x, 'ano'))) data[s.cp.m - 1] += s.price;
      chart = { data, keys, labels, highlight: String(now.m) };
    }
  }

  const shown = sales.filter((s) => inPeriod(s, period)).sort((a, b) => (a.when < b.when ? 1 : -1));
  const shownTotal = sum(shown);
  const fmtDay = (iso) => {
    const cp = chicagoParts(new Date(iso));
    const [y, m, d] = cp.key.split('-');
    return `${d}/${m}/${y} ${String(cp.hour).padStart(2, '0')}:${String(new Date(iso).getUTCMinutes()).padStart(2, '0')}`;
  };

  // Reiniciar Ventas: borra las ventas de mostrador Y las reparaciones
  // entregadas (que son la otra fuente de esta página). Las reparaciones en
  // curso no se tocan y el stock no se repone (esas unidades sí se vendieron).
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

  // Anular una venta de mostrador (repone el stock de sus productos).
  const anular = async (s) => {
    if (!window.confirm(`¿Anular la venta de ${usd.format(s.price)} (${s.concepto})?\n\nSe repone el stock de los productos vendidos.`)) return;
    setBusy(true); setErr('');
    try {
      await api('/sales/' + s.ventaId, { method: 'DELETE' });
      setTick((t) => t + 1);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const onBar = (k) => {
    if (period === 'semana') { setPeriod('dia'); setDay(k); }
    else if (period === 'mes') { setPeriod('dia'); setDay(`${month}-${k.padStart(2, '0')}`); }
    else if (period === 'ano') { setPeriod('mes'); setMonth(`${now.y}-${k.padStart(2, '0')}`); }
  };

  // Alta de venta a página completa (mismo patrón que el resto del panel).
  if (registering) {
    return (
      <FormPage title="Registrar venta" onBack={() => setRegistering(false)} max={680}>
        <SaleForm
          onCancel={() => setRegistering(false)}
          onSaved={() => { setRegistering(false); setTick((t) => t + 1); }}
        />
      </FormPage>
    );
  }

  return (
    <div className="sales-page">
      {err && <div className="alert alert-error">{err}</div>}

      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 16, gap: 10 }}>
        {sales.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={resetSales} disabled={busy}>
            {busy ? <span className="spinner" /> : 'Borrar todas las ventas'}
          </button>
        )}
        <button className="btn btn-primary" onClick={() => setRegistering(true)}>+ Registrar venta</button>
      </div>

      <div className="stat-grid">
        {kpis == null
          ? PERIODS.map((p) => <div key={p.v} className="stat-card"><div className="stat-top"><div className="k">{p.l}</div></div><div className="v"><span className="spinner" /></div></div>)
          : (
            <>
              <Kpi label="Hoy" total={kpis.dia.total} count={kpis.dia.count} />
              <Kpi label="Esta semana" total={kpis.semana.total} count={kpis.semana.count} />
              <Kpi label="Este mes" total={kpis.mes.total} count={kpis.mes.count} />
              <Kpi label="Este año" total={kpis.ano.total} count={kpis.ano.count} />
            </>
          )}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {PERIODS.map((p) => (
          <button key={p.v} className={'btn btn-sm ' + (period === p.v ? 'btn-primary' : 'btn-secondary')}
            onClick={() => { setPeriod(p.v); if (p.v === 'dia') setDay(chicagoParts().key); }}>
            {p.l}
          </button>
        ))}
        {period === 'dia' && (
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{ width: 'auto', marginLeft: 6 }} />
        )}
        {period === 'mes' && (
          <input type="month" value={month} max={curMonthKey} onChange={(e) => e.target.value && setMonth(e.target.value)}
            style={{ width: 'auto', marginLeft: 6 }} />
        )}
        <div className="spacer" />
        {cargado && (
          <strong style={{ fontSize: 15 }}>
            Total: {usd.format(shownTotal)} · {shown.length} venta{shown.length === 1 ? '' : 's'}
          </strong>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>
          {period === 'dia' ? `Ventas del ${day.split('-').reverse().join('/')}`
            : period === 'semana' ? 'Ventas por día (esta semana)'
              : period === 'mes' ? `Ventas por día (${monthLabel})`
                : `Ventas por mes (${now.y})`}
        </h3>
        {chart == null ? <span className="spinner" />
          : <BarChart data={chart.data} keys={chart.keys} labels={chart.labels} highlight={chart.highlight}
              format={fmtBar} onDay={period === 'dia' ? null : onBar} />}
        {period !== 'dia' && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Toca una barra para ver el detalle.</div>}
      </div>

      <div className="card">
        <h3>Detalle de ventas</h3>
        {!cargado ? <span className="spinner" />
          : shown.length === 0 ? <div className="empty">No hay ventas en este período.</div>
            : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Fecha</th><th>Detalle</th><th>Tipo</th><th className="hide-sm">Atendió</th><th style={{ textAlign: 'right' }}>Precio</th><th></th></tr></thead>
                  <tbody>
                    {shown.map((s) => (
                      <tr key={s.key}>
                        <td className="muted">{fmtDay(s.when)}</td>
                        <td>
                          <strong>{s.tipo === 'reparacion' ? (s.cliente || '—') : s.concepto}</strong>
                          <div className="muted" style={{ fontSize: 12 }}>
                            {s.tipo === 'reparacion' ? s.concepto : (s.pago || 'mostrador')}
                          </div>
                        </td>
                        <td><span className={'badge ' + (s.tipo === 'venta' ? 'badge-on' : 'badge-worker')}>{s.tipo === 'venta' ? 'venta' : 'reparación'}</span></td>
                        <td className="muted hide-sm">{s.quien || '—'}</td>
                        <td style={{ textAlign: 'right' }}><strong>{usd.format(s.price)}</strong></td>
                        <td style={{ textAlign: 'right' }}>
                          {s.tipo === 'venta' && (
                            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => anular(s)} title="Anular venta (repone stock)">Anular</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'right' }}><strong>Total del período</strong></td>
                      <td style={{ textAlign: 'right' }}><strong>{usd.format(shownTotal)}</strong></td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </div>
  );
}
