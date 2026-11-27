import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiRoot } from '../api.js';
import BarChart from '../components/BarChart.jsx';
import { saludo } from '../components/RepairDetail.jsx';

/* Dashboard: responde lo que el dueño mira cada mañana —
   ¿cuánto vendí? (saludo con resumen + tarjetas de dinero + gráfica),
   ¿qué necesita atención ya? (lista de pendientes accionables) y ¿cómo va el
   taller? (camino de las reparaciones, órdenes, citas, ventas por tipo y
   últimas ventas). Todo sale de las APIs que ya existen. */

// Fecha "de negocio": el taller opera en hora de Chicago.
function chicagoKey(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

function chicagoHora(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

// Clave YYYY-MM-DD desplazada `n` días (aritmética en UTC: sin huso local).
function shiftKey(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Claves YYYY-MM-DD de la semana actual (lunes a domingo), en hora de Chicago.
function currentWeekKeys() {
  const today = chicagoKey();
  const [y, m, d] = today.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => shiftKey(today, i - dow));
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function hace(date) {
  const t = date ? new Date(date).getTime() : NaN;
  if (!Number.isFinite(t)) return '';
  const h = Math.floor((Date.now() - t) / 3600000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

const iniciales = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Íconos propios de línea limpia: un solo color (el del texto), sin relleno
// ni cuadro de fondo; los puntos (.dot) van sólidos. Dibujados a mano: el
// panel no usa librerías de íconos.
function Ico({ children }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  // Moneda con signo de dólar.
  dinero: <>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.8 9.4c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2 2.8.9 2.8 2.1-1.2 2-2.8 2c-1.3 0-2.4-.6-2.9-1.5" />
    <path d="M12 6.5V8M12 16v1.5" />
  </>,
  // Calendario con el día marcado.
  mes: <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M8 3v4M16 3v4M3.5 9.5h17" />
    <circle className="dot" cx="15.5" cy="15" r="1.6" />
  </>,
  // Línea que sube con su área.
  ganancia: <>
    <path d="M3 17l5.5-6 4 3.5L21 6" />
    <path d="M15.5 6H21v5.5" />
  </>,
  // Cartera.
  cobrar: <>
    <path d="M17 6.5V5.2a1.8 1.8 0 0 0-2.3-1.7L5.3 6A3 3 0 0 0 3 8.9" />
    <rect x="3" y="6.5" width="18" height="13" rx="3" />
    <path d="M21 11h-3.5a2 2 0 0 0 0 4H21" />
    <circle className="dot" cx="17.5" cy="13" r="1" />
  </>,
  // Camión de reparto.
  envio: <>
    <path d="M2.5 16.5v-9A1.5 1.5 0 0 1 4 6h8a1.5 1.5 0 0 1 1.5 1.5v10" />
    <path d="M13.5 10h3.4a2 2 0 0 1 1.7 1l1.9 3.2a2 2 0 0 1 .3 1v1.3a1 1 0 0 1-1 1h-.8" />
    <path d="M2.5 16.5a1 1 0 0 0 1 1h1.5M9 17.5h6" />
    <circle cx="7" cy="17.5" r="2" />
    <circle cx="17" cy="17.5" r="2" />
  </>,
  // Caja (la pieza que llegó).
  pieza: <>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5L12 12l8-4.5M12 12v9M8 5.3l8 4.5" />
  </>,
  // Círculo con palomita.
  entregar: <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.3l2.8 2.7L16 9.5" />
  </>,
  // Etiqueta de precio.
  agotado: <>
    <path d="M3 4.6v6.1a2 2 0 0 0 .6 1.4l8.3 8.3a2 2 0 0 0 2.8 0l5.8-5.8a2 2 0 0 0 0-2.8l-8.3-8.3a2 2 0 0 0-1.4-.6H4.6A1.6 1.6 0 0 0 3 4.6z" />
    <circle className="dot" cx="7.6" cy="7.6" r="1.4" />
  </>,
  // Triángulo de aviso.
  bajo: <>
    <path d="M10.3 4.2L2.6 17.5a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4" />
    <circle className="dot" cx="12" cy="16.8" r="1" />
  </>,
};

// Mini gráfica de línea (últimos 7 días) con área y punto dorado al final.
function Sparkline({ data }) {
  const max = Math.max(1, ...data);
  const W = 100; const H = 30;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 3 - (v / max) * (H - 8)]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const ey = pts[pts.length - 1][1];
  // El SVG se estira a lo ancho (preserveAspectRatio none): el punto final va
  // encima como elemento aparte para que siga siendo un círculo.
  return (
    <div className="spark-wrap">
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <polygon className="spark-area" points={`0,${H} ${line} ${W},${H}`} />
        <polyline className="spark-line" points={line} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="spark-dot" style={{ top: `${(ey / H) * 100}%` }} />
    </div>
  );
}

// Barra de progreso (meta del mes, margen de ganancia).
function Meter({ pct }) {
  return (
    <div className="meter" role="img" aria-label={`${Math.round(pct)}%`}>
      <span className="meter-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function Stat({ k, v, icon, to, children }) {
  return (
    <Link to={to} className="stat-card stat-link">
      <div className="stat-top">
        <div className="k">{k}</div>
        <span className="dash-ico"><Ico>{icon}</Ico></span>
      </div>
      <div className="v">{v == null ? <span className="spinner" /> : v}</div>
      {v != null && children}
    </Link>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [citas, setCitas] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [directas, setDirectas] = useState(null); // ventas de mostrador (incluye las de facturas)
  const [ordenes, setOrdenes] = useState(null); // website + FB Marketplace
  const [inventory, setInventory] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const fallo = (set) => (e) => { set([]); setErr(e.message); };
    apiRoot('/api/appointments').then((d) => setCitas(d.citas || [])).catch(() => setCitas([]));
    api('/repairs').then((d) => setTickets(d.tickets || [])).catch(fallo(setTickets));
    api('/sales').then((d) => setDirectas(d.sales || [])).catch(fallo(setDirectas));
    api('/orders').then((d) => setOrdenes(d.orders || [])).catch(fallo(setOrdenes));
    api('/inventory').then((d) => setInventory(d.items || [])).catch(fallo(setInventory));
    api('/expenses').then((d) => setExpenses(d.expenses || [])).catch(() => setExpenses([]));
  }, []);

  const todayKey = chicagoKey();
  const ayerKey = shiftKey(todayKey, -1);
  const weekKeys = currentWeekKeys();
  const mesKey = todayKey.slice(0, 7);
  const diaMes = Number(todayKey.slice(8, 10));
  const [yy, mm] = mesKey.split('-').map(Number);
  const mesAntKey = new Date(Date.UTC(yy, mm - 2, 1)).toISOString().slice(0, 7);
  const mesAntLbl = MONTHS[Number(mesAntKey.slice(5, 7)) - 1];
  const mesLbl = MONTHS[mm - 1];
  const dowHoy = (new Date(Date.UTC(yy, mm - 1, diaMes)).getUTCDay() + 6) % 7;
  const fechaLarga = `${DAY_NAMES[dowHoy]} ${diaMes} de ${MONTHS_LARGO[mm - 1]}`;

  // Toda venta, con la MISMA definición que la página de Ventas: reparación
  // entregada + venta de mostrador + orden (web/FB). Si difieren, los números
  // del Dashboard no cuadran con los de esa página.
  const ventas = (tickets && directas && ordenes) ? [
    ...tickets.filter((t) => t.status === 'entregado' && t.delivered_at).map((t) => ({
      id: 'r' + t.id, tipo: 'reparacion', when: t.delivered_at, monto: Number(t.final_price) || 0, costo: 0,
      titulo: t.customer_name || 'Reparación',
      detalle: [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'Reparación',
    })),
    ...directas.map((v) => ({
      id: 'v' + v.id, tipo: 'mostrador', when: v.created_at, monto: Number(v.total) || 0,
      costo: (v.items || []).reduce((a, i) => a + (Number(i.cost) || 0) * (Number(i.qty) || 0), 0),
      titulo: v.invoice_buyer || (v.items || []).map((i) => i.name).join(', ') || 'Venta',
      detalle: v.invoice_number ? `Factura ${v.invoice_number}` : 'Mostrador',
    })),
    ...ordenes.map((o) => ({
      id: 'o' + o.id, tipo: o.origen === 'fb_marketplace' ? 'fb' : 'web', when: o.created_at,
      monto: Number(o.total) || 0, costo: Number(o.costo) || 0,
      titulo: o.customer_name || 'Compra web',
      detalle: o.origen === 'fb_marketplace' ? 'FB Marketplace' : 'Compra web',
    })),
  ].map((v) => ({ ...v, key: chicagoKey(new Date(v.when)) })) : null;

  const suma = (list) => list.reduce((a, v) => a + v.monto, 0);
  const delDia = (k) => suma((ventas || []).filter((v) => v.key === k));

  // ---- Tarjetas de dinero ----
  let kpi = null;
  if (ventas && expenses && tickets) {
    const delMes = ventas.filter((v) => v.key.startsWith(mesKey));
    const gastosMes = expenses.filter((e) => chicagoKey(new Date(e.created_at)).startsWith(mesKey))
      .reduce((a, e) => a + (Number(e.amount) || 0), 0);
    const ventasMes = suma(delMes);
    const ganancia = ventasMes - delMes.reduce((a, v) => a + v.costo, 0) - gastosMes;
    // Por cobrar: reparaciones en curso con precio (final o cotizado) menos lo abonado.
    const conSaldo = tickets
      .filter((t) => t.status !== 'entregado')
      .map((t) => Math.max(0, (Number(t.final_price ?? t.quoted_price) || 0) - (Number(t.amount_paid) || 0)))
      .filter((s) => s > 0);
    kpi = {
      hoy: delDia(todayKey),
      ayer: delDia(ayerKey),
      spark: Array.from({ length: 7 }, (_, i) => delDia(shiftKey(todayKey, i - 6))),
      mes: ventasMes,
      mesAntTotal: suma(ventas.filter((v) => v.key.startsWith(mesAntKey))),
      ganancia,
      margen: ventasMes > 0 ? (ganancia / ventasMes) * 100 : 0,
      gastosMes,
      porCobrar: conSaldo.reduce((a, s) => a + s, 0),
      nSaldo: conSaldo.length,
    };
  }

  // ---- Necesita atención: pendientes accionables, lo más urgente primero ----
  let atencion = null;
  if (tickets && ordenes && inventory) {
    const equipo = (t) => [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'equipo';
    atencion = [];
    for (const o of ordenes.filter((x) => x.ship_status === 'pendiente').sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
      atencion.push({
        id: 'o' + o.id, urgente: true, icon: 'envio', to: '/ordenes',
        texto: `Enviar el pedido de ${o.customer_name || 'un cliente'}`,
        detalle: [o.origen === 'fb_marketplace' ? 'FB Marketplace' : 'Web', hace(o.created_at), 'sin número de rastreo'].filter(Boolean).join(' · '),
      });
    }
    for (const t of tickets.filter((x) => x.ship_tag === 'Delivered' && ['recibido', 'diagnostico'].includes(x.status))) {
      atencion.push({
        id: 'p' + t.id, urgente: true, icon: 'pieza', to: '/reparaciones',
        texto: `Llegó la pieza: ${equipo(t)} de ${t.customer_name || 'cliente'}`,
        detalle: 'Ya se puede reparar',
      });
    }
    for (const t of tickets.filter((x) => x.status === 'listo')) {
      const saldo = Math.max(0, (Number(t.final_price ?? t.quoted_price) || 0) - (Number(t.amount_paid) || 0));
      atencion.push({
        id: 'l' + t.id, urgente: false, icon: 'entregar', to: '/reparaciones',
        texto: `Entregar: ${equipo(t)} de ${t.customer_name || 'cliente'}`,
        detalle: [hace(t.updated_at) ? `Lista ${hace(t.updated_at)}` : 'Lista para entregar', saldo > 0 && `cobrar ${usd.format(saldo)}`].filter(Boolean).join(' · '),
      });
    }
    for (const p of inventory.filter((x) => (Number(x.stock) || 0) <= 0)) {
      atencion.push({ id: 'i' + p.id, urgente: false, icon: 'agotado', to: '/inventario', texto: `Agotado: ${p.name}`, detalle: 'Sin unidades en inventario' });
    }
    for (const p of inventory.filter((x) => Number(x.min_stock) > 0 && Number(x.stock) > 0 && Number(x.stock) <= Number(x.min_stock))) {
      atencion.push({ id: 'b' + p.id, urgente: false, icon: 'bajo', to: '/inventario', texto: `Stock bajo: ${p.name}`, detalle: `Quedan ${p.stock}` });
    }
  }
  const ATT_MAX = 6;

  // ---- Gráfica de la semana + mejor día ----
  const ventasSemana = ventas ? weekKeys.map((k) => delDia(k)) : null;
  const mejor = ventasSemana && Math.max(...ventasSemana) > 0
    ? ventasSemana.reduce((bi, v, i, arr) => (v > arr[bi] ? i : bi), 0) : null;

  // ---- Taller: camino de las reparaciones y órdenes ----
  const enCurso = tickets ? tickets.filter((t) => t.status !== 'entregado') : null;
  const PASOS = [['recibido', 'Recibido'], ['diagnostico', 'Diagnóstico'], ['reparacion', 'Reparando'], ['listo', 'Listo']];
  const ordCount = ordenes ? {
    enviar: ordenes.filter((o) => o.ship_status === 'pendiente').length,
    camino: ordenes.filter((o) => o.ship_status === 'enviado').length,
    entregados: ordenes.filter((o) => o.ship_status === 'entregado' && chicagoKey(new Date(o.created_at)).startsWith(mesKey)).length,
  } : null;

  // ---- Próximas citas (hoy en adelante, sin atendidas ni canceladas) ----
  const proximas = citas ? citas
    .filter((c) => String(c.fecha).slice(0, 10) >= todayKey && !['atendida', 'cancelada'].includes(c.estado))
    .sort((a, b) => (`${String(a.fecha).slice(0, 10)} ${a.hora}` < `${String(b.fecha).slice(0, 10)} ${b.hora}` ? -1 : 1))
    .slice(0, 4) : null;
  const diaCita = (k) => (k === todayKey ? 'Hoy' : k === shiftKey(todayKey, 1) ? 'Mañana' : null);

  // ---- Ventas por tipo (mes) y últimas ventas ----
  const delMes = ventas ? ventas.filter((v) => v.key.startsWith(mesKey)) : null;
  const TIPOS = [
    ['mostrador', 'Mostrador', 'seg-1'], ['reparacion', 'Reparaciones', 'seg-2'],
    ['web', 'Web', 'seg-3'], ['fb', 'FB Marketplace', 'seg-4'],
  ];
  const totalMes = delMes ? suma(delMes) : 0;
  const porTipo = delMes ? TIPOS.map(([t, label, cls]) => ({ label, cls, value: suma(delMes.filter((v) => v.tipo === t)) })) : null;
  const ultimas = ventas ? [...ventas].sort((a, b) => (a.when < b.when ? 1 : -1)).slice(0, 5) : null;
  const cuando = (v) => {
    if (v.key === todayKey) return 'Hoy ' + chicagoHora(new Date(v.when));
    if (v.key === ayerKey) return 'Ayer';
    return `${v.key.slice(8, 10)}/${v.key.slice(5, 7)}`;
  };
  const TIPO_LBL = { mostrador: 'venta', reparacion: 'reparación', web: 'online', fb: 'FB' };

  const spin = <span className="spinner" />;
  const saludoTxt = saludo();

  return (
    <div className="dashboard">
      {err && <div className="alert alert-error">{err}</div>}

      {/* Saludo con el resumen del día en una frase. */}
      <div className="dash-hello">
        <div className="hello-txt">
          <div className="hello-date">{fechaLarga}</div>
          <h2 className="hello-title">{saludoTxt.charAt(0).toUpperCase() + saludoTxt.slice(1)}</h2>
          <p className="hello-sum">
            {kpi && atencion ? (
              <>Hoy llevas <span className="hello-hi">{usd.format(kpi.hoy)}</span> en ventas
                {atencion.length > 0
                  ? <> y tienes <span className="hello-hi">{atencion.length} pendiente{atencion.length === 1 ? '' : 's'}</span> por atender.</>
                  : <>. No tienes pendientes: todo al día.</>}
              </>
            ) : 'Cargando el resumen del día…'}
          </p>
        </div>
        <div className="hello-chips">
          <Link to="/reparaciones" className="hello-chip"><b>{enCurso ? enCurso.length : '–'}</b> reparaciones en curso</Link>
          <Link to="/ordenes" className="hello-chip"><b>{ordCount ? ordCount.enviar : '–'}</b> pedidos por enviar</Link>
          <Link to="/citas" className="hello-chip"><b>{proximas ? proximas.filter((c) => String(c.fecha).slice(0, 10) === todayKey).length : '–'}</b> citas hoy</Link>
        </div>
      </div>

      <div className="dash-kpis">
        <Stat k="Ventas de hoy" to="/ventas" v={kpi && usd.format(kpi.hoy)} icon={ICONS.dinero}>
          <div className="stat-row">
            <span className={'trend ' + (kpi && kpi.hoy >= kpi.ayer ? 'trend-up' : 'trend-down')}>
              {kpi && (kpi.hoy >= kpi.ayer ? '▲' : '▼')} {kpi && usd0.format(Math.abs(kpi.hoy - kpi.ayer))}
            </span>
            <span className="stat-sub">vs. ayer ({kpi && usd0.format(kpi.ayer)})</span>
          </div>
          {kpi && <Sparkline data={kpi.spark} />}
          <div className="stat-foot">Últimos 7 días</div>
        </Stat>
        <Stat k={`Ventas de ${mesLbl}`} to="/ventas" v={kpi && usd.format(kpi.mes)} icon={ICONS.mes}>
          {kpi && kpi.mesAntTotal > 0 ? (
            <>
              <Meter pct={(kpi.mes / kpi.mesAntTotal) * 100} />
              <div className="stat-sub">
                {kpi.mes >= kpi.mesAntTotal
                  ? `Ya superaste ${mesAntLbl} (${usd0.format(kpi.mesAntTotal)})`
                  : `Llevas ${Math.round((kpi.mes / kpi.mesAntTotal) * 100)}% de lo que vendiste en ${mesAntLbl} (${usd0.format(kpi.mesAntTotal)})`}
              </div>
            </>
          ) : <div className="stat-sub">Sin ventas en {mesAntLbl} para comparar</div>}
        </Stat>
        <Stat k={`Ganancia de ${mesLbl}`} to="/ventas" v={kpi && usd.format(kpi.ganancia)} icon={ICONS.ganancia}>
          <Meter pct={kpi ? kpi.margen : 0} />
          <div className="stat-sub">
            {kpi && kpi.mes > 0 ? `Te quedas con ${Math.round(kpi.margen)}% de cada venta` : 'Aún no hay ventas este mes'}
          </div>
          <div className="stat-foot">Gastos del mes: {kpi && usd.format(kpi.gastosMes)}</div>
        </Stat>
        <Stat k="Por cobrar" to="/reparaciones" v={kpi && usd.format(kpi.porCobrar)} icon={ICONS.cobrar}>
          <div className="stat-sub">
            {kpi && (kpi.nSaldo ? `${kpi.nSaldo} reparaci${kpi.nSaldo === 1 ? 'ón' : 'ones'} con saldo pendiente` : 'Nadie te debe: todo cobrado')}
          </div>
        </Stat>
      </div>

      <div className="dash-grid dash-g2">
        <div className="card dash-att">
          <h3>Necesita atención{atencion && atencion.length > 0 && <span className="att-count">{atencion.length}</span>}</h3>
          {atencion == null ? spin
            : atencion.length === 0 ? (
              <div className="att-ok">
                <span className="att-ok-ico"><Ico>{ICONS.entregar}</Ico></span>
                Todo al día. No hay nada pendiente.
              </div>
            ) : (
              <div className="att-list">
                {atencion.slice(0, ATT_MAX).map((a) => (
                  <Link key={a.id} to={a.to} className="att-row">
                    <span className={'att-ico' + (a.urgente ? ' att-ico-on' : '')}><Ico>{ICONS[a.icon]}</Ico></span>
                    <span className="att-txt">
                      {a.texto}
                      <small>{a.detalle}</small>
                    </span>
                    {a.urgente && <span className="att-pill">Urgente</span>}
                    <span className="att-go">→</span>
                  </Link>
                ))}
                {atencion.length > ATT_MAX && <div className="muted att-more">y {atencion.length - ATT_MAX} más…</div>}
              </div>
            )}
        </div>
        <div className="card dash-week">
          <h3><Link to="/ventas" className="chart-link">Ventas de la semana →</Link>{ventasSemana && <span className="chart-total">{usd.format(ventasSemana.reduce((a, b) => a + b, 0))}</span>}</h3>
          {mejor != null && <div className="week-best">Mejor día: {DAY_NAMES[mejor]} · {usd.format(ventasSemana[mejor])}</div>}
          {ventasSemana == null ? spin
            : <BarChart data={ventasSemana} keys={weekKeys} labels={DAY_LABELS} highlight={todayKey} height={200}
                format={(v) => '$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0))}
                onDay={(key) => navigate('/ventas?fecha=' + key)} />}
        </div>
      </div>

      <div className="dash-grid dash-g3">
        <div className="card">
          <h3><Link to="/reparaciones" className="chart-link">Camino de las reparaciones →</Link>{enCurso && <span className="chart-total">{enCurso.length}</span>}</h3>
          {enCurso == null ? spin : (
            <Link to="/reparaciones" className="pipe">
              {PASOS.map(([s, label], i) => {
                const n = enCurso.filter((t) => t.status === s).length;
                return (
                  <div key={s} className={'pipe-step' + (n > 0 ? ' pipe-on' : '') + (s === 'listo' && n > 0 ? ' pipe-ready' : '')}
                    style={{ animationDelay: `${i * 90}ms` }}>
                    <span className="pipe-num">{n}</span>
                    <span className="pipe-lbl">{label}</span>
                  </div>
                );
              })}
            </Link>
          )}
          <div className="pipe-hint">Cada equipo avanza de izquierda a derecha hasta que se entrega.</div>
        </div>
        <div className="card">
          <h3><Link to="/ordenes" className="chart-link">Órdenes →</Link></h3>
          {ordCount == null ? spin : (
            <div className="ord-grid">
              {[['pieza', ordCount.enviar, 'Por enviar', ordCount.enviar > 0], ['envio', ordCount.camino, 'En camino', false], ['entregar', ordCount.entregados, 'Entregados (mes)', false]].map(([ic, n, label, warn]) => (
                <Link key={label} to="/ordenes" className={'ord-cell' + (warn ? ' ord-warn' : '')}>
                  <span className="ord-ico"><Ico>{ICONS[ic]}</Ico></span>
                  <span className="ord-num">{n}</span>
                  <span className="ord-lbl">{label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3><Link to="/citas" className="chart-link">Próximas citas →</Link></h3>
          {proximas == null ? spin
            : proximas.length === 0 ? <div className="dash-empty">No hay citas próximas.</div>
              : (
                <div className="cita-mini-list">
                  {proximas.map((c) => {
                    const k = String(c.fecha).slice(0, 10);
                    return (
                      <Link key={c.id} to={'/citas?fecha=' + k} className="cita-mini">
                        <span className={'cal-leaf' + (k === todayKey ? ' cal-today' : '')}>
                          <span className="cal-m">{diaCita(k) || MONTHS[Number(k.slice(5, 7)) - 1]}</span>
                          <span className="cal-d">{Number(k.slice(8, 10))}</span>
                        </span>
                        <span className="cita-mini-txt">
                          {String(c.hora).slice(0, 5)} · {c.nombre}
                          <small>{c.servicio}</small>
                        </span>
                        <span className={'badge badge-' + c.estado}>{c.estado}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
        </div>
      </div>

      <div className="dash-grid dash-g2">
        <div className="card">
          <h3>¿De dónde vino el dinero? ({mesLbl}){delMes && <span className="chart-total">{usd.format(totalMes)}</span>}</h3>
          {porTipo == null ? spin : totalMes === 0 ? <div className="dash-empty">Aún no hay ventas este mes.</div> : (
            <>
              <div className="stack" role="img" aria-label="Ventas del mes por tipo">
                {porTipo.filter((t) => t.value > 0).map((t) => (
                  <span key={t.label} className={'stack-seg ' + t.cls} style={{ flexGrow: t.value }} title={`${t.label}: ${usd.format(t.value)}`} />
                ))}
              </div>
              <div className="stack-legend">
                {porTipo.map((t) => (
                  <Link key={t.label} to="/ventas" className="stack-row">
                    <span className={'stack-dot ' + t.cls} />
                    <span className="stack-name">{t.label}</span>
                    <span className="stack-pct">{Math.round((t.value / totalMes) * 100)}%</span>
                    <span className="stack-val">{usd.format(t.value)}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="card">
          <h3><Link to="/ventas" className="chart-link">Últimas ventas →</Link></h3>
          {ultimas == null ? spin
            : ultimas.length === 0 ? <div className="dash-empty">Aún no hay ventas.</div>
              : (
                <div className="ult-list">
                  {ultimas.map((v) => (
                    <Link key={v.id} to={'/ventas?fecha=' + v.key} className="ult-row">
                      <span className="ult-avatar">{iniciales(v.titulo)}</span>
                      <span className="ult-txt">{v.titulo}<small>{v.detalle} · {cuando(v)}</small></span>
                      <span className="badge">{TIPO_LBL[v.tipo]}</span>
                      <span className="ult-monto">{usd.format(v.monto)}</span>
                    </Link>
                  ))}
                </div>
              )}
        </div>
      </div>
    </div>
  );
}
