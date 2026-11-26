import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import PageHead from '../components/PageHead.jsx';
import Tabs from '../components/Tabs.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import RepairDetail, {
  statusLabel, DEVICE_TYPES, serviceTypeLabel, phoneIntl, saludo,
} from '../components/RepairDetail.jsx';
import { fechaCorta, hace, diasDesde, diaKey, iniciales } from '../fechas.js';
import './Repairs.css';

const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

// Número público de la reparación (el mismo de los correos y track.html).
const repNum = (t) => `REP-${1000 + Number(t.id)}`;
const equipoDe = (t) => [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'Equipo sin nombre';
// Total a cobrar: precio final o, si aún no hay, el cotizado.
const totalDe = (t) => (t.final_price != null ? Number(t.final_price) : (t.quoted_price != null ? Number(t.quoted_price) : null));
const saldoDe = (t) => {
  const tot = totalDe(t);
  return tot == null ? null : Math.max(0, tot - (Number(t.amount_paid) || 0));
};

// Plurales para las pestañas de equipo.
const DEVICE_PLURAL = { telefono: 'Teléfonos', tablet: 'Tablets', laptop: 'Laptops' };

// Columnas del tablero "En el taller" (un paso cada una) y el paso siguiente.
const COLUMNAS = [
  { v: 'recibido', l: 'Recibido' },
  { v: 'diagnostico', l: 'Diagnóstico' },
  { v: 'reparacion', l: 'Reparando' },
  { v: 'listo', l: 'Listo' },
];
const SIGUIENTE = { recibido: 'diagnostico', diagnostico: 'reparacion', reparacion: 'listo' };
const colLabel = (v) => (COLUMNAS.find((c) => c.v === v) || {}).l || statusLabel(v);

// Cómo va la pieza (repuesto en camino al taller), como texto de color.
function piezaDe(t) {
  if (!t.tracking_number) return null;
  const llega = t.expected_delivery && t.ship_tag !== 'Delivered'
    ? ` · llega ${fechaCorta(String(t.expected_delivery).slice(0, 10), { conHora: false })}` : '';
  if (t.ship_tag === 'Delivered') return { txt: 'Pieza llegó', cls: 'st-ok' };
  if (t.ship_tag === 'OutForDelivery') return { txt: 'Pieza en reparto' + llega, cls: 'st-warn' };
  if (t.ship_tag === 'InTransit') return { txt: 'Pieza en tránsito' + llega, cls: 'st-warn' };
  return { txt: 'Pieza enviada' + llega, cls: 'st-warn' };
}

// Datos que llegan desde Citas ("Crear reparación"): ?nueva=1&cliente=…&tel=…
// &correo=…&equipo=…&problema=… → valores iniciales del formulario.
const MARCAS = ['Apple', 'Samsung', 'Google', 'Motorola', 'LG', 'Lenovo', 'HP', 'Dell', 'Asus', 'Acer', 'Microsoft', 'Huawei', 'Xiaomi', 'OnePlus'];
function equipoDesdeTexto(s) {
  const txt = String(s || '').trim();
  if (!txt) return {};
  let brand = '';
  let model = txt;
  const m = MARCAS.find((b) => txt.toLowerCase().startsWith(b.toLowerCase() + ' '));
  if (m) { brand = m; model = txt.slice(m.length).trim(); }
  else if (/^(iphone|ipad|macbook|imac|apple watch|airpods)/i.test(txt)) brand = 'Apple';
  else if (/^galaxy/i.test(txt)) brand = 'Samsung';
  else if (/^pixel/i.test(txt)) brand = 'Google';
  const tipo = /ipad|\btab\b|tablet/i.test(txt) ? 'tablet'
    : /macbook|imac|laptop|thinkpad|notebook|chromebook/i.test(txt) ? 'laptop' : 'telefono';
  return { device_brand: brand, device_model: model, device_type: tipo };
}
function inicialDesdeParams(sp) {
  const v = (k) => (sp.get(k) || '').trim();
  const init = {
    ...(v('cliente') && { customer_name: v('cliente') }),
    ...(v('tel') && { customer_phone: v('tel') }),
    ...(v('correo') && { customer_email: v('correo') }),
    ...(v('problema') && { problem: v('problema') }),
    ...equipoDesdeTexto(v('equipo')),
  };
  return Object.keys(init).length ? init : undefined;
}

/* Barra de progreso animada de la reparación (mismo diseño que la barra de
   envío de Órdenes): Recibido → En revisión → En laboratorio de reparación
   y mantenimiento → Listo para recoger. Entregado = barra completa. */
const REPAIR_STEPS = ['Recibido', 'En revisión', 'En laboratorio de reparación y mantenimiento', 'Listo para recoger'];
function repairStep(t) {
  if (t.status === 'entregado') return 5; // barra completa
  return { recibido: 1, diagnostico: 2, reparacion: 3, listo: 4 }[t.status] || 1;
}
function RepairBar({ ticket }) {
  const step = repairStep(ticket);
  // El relleno llega hasta el centro de la columna del paso actual (tope 100%).
  const pct = Math.min(((step - 0.5) / REPAIR_STEPS.length) * 100, 100);
  return (
    <div className="shipbar s4">
      <div className="shipbar-line">
        <div className="shipbar-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="shipbar-steps">
        {REPAIR_STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className={'shipbar-step' + (step >= n ? ' on' : '') + (step === n ? ' current' : '')}>
              <div className="shipbar-dot" />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      {ticket.status === 'entregado' && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>Entregado al cliente.</div>
      )}
    </div>
  );
}

/* Estatus del número de rastreo del repuesto (misma barra que el envío de
   Órdenes): sale DEBAJO del estado de la reparación. Usa ship_tag (lo escriben
   el webhook, el job de 15 min y el robot USPS vía applyRepairUpdate); sin tag
   cae a "hay número guardado" → Enviado. */
const PART_STEPS = ['Label generado', 'Enviado', 'En tránsito', 'En reparto', 'Delivered'];
function partStep(t) {
  const tag = t.ship_tag;
  if (tag === 'Delivered') return 5;
  if (tag === 'OutForDelivery') return 4;
  if (tag === 'InTransit') return 3;
  if (t.tracking_number) return 2;
  return 1;
}
function PartShipBar({ ticket }) {
  const step = partStep(ticket);
  const pct = ((step - 0.5) / PART_STEPS.length) * 100;
  return (
    <div className="shipbar">
      <div className="shipbar-line">
        <div className="shipbar-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="shipbar-steps">
        {PART_STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className={'shipbar-step' + (step >= n ? ' on' : '') + (step === n ? ' current' : '')}>
              <div className="shipbar-dot" />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Resumen arriba de la ficha (lo que antes estaba en el detalle abierto de la
   lista): estado con su barra, la pieza con su barra (se mueve EN VIVO con el
   stream), cobro, y la factura (vincular, ver, por correo, por WhatsApp). */
function Resumen({ t, err, ok, invOptions, invBusy, onVincular, onVer, onCorreo, onWhatsApp }) {
  const total = totalDe(t);
  const paid = Number(t.amount_paid) || 0;
  const saldo = saldoDe(t);
  const pieza = piezaDe(t);
  const dias = diasDesde(t.created_at);
  return (
    <div className="rep2-res">
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}
      <div className="rep2-res-top">
        <span className="st st-strong">{statusLabel(t.status)}</span>
        <span className="rep2-res-meta">
          {t.status === 'entregado'
            ? `Entregada ${fechaCorta(t.delivered_at)}`
            : `Entró ${fechaCorta(t.created_at)} · ${dias === 1 ? '1 día' : dias + ' días'} en el taller`}
        </span>
        {total != null && (
          <span className="rep2-res-meta">
            Total {money(total)}
            {paid > 0 && ` · Abonado ${money(paid)} (${Math.round((paid / total) * 100)}%)`}
            {saldo > 0 && t.status !== 'entregado' && <> · <span className="st st-bad">Restante {money(saldo)}</span></>}
          </span>
        )}
      </div>
      <RepairBar ticket={t} />
      {t.tracking_number && (
        <div className="rep2-res-part">
          <div className="rep2-res-meta">
            Repuesto: <strong>{t.tracking_number}</strong>{t.carrier ? ` (${String(t.carrier).toUpperCase()})` : ''}
            {pieza && <> · <span className={'st ' + pieza.cls}>{pieza.txt}</span></>}
          </div>
          <PartShipBar ticket={t} />
        </div>
      )}
      <div className="rep2-res-inv">
        <span className="rep2-res-lbl">Factura</span>
        <select className="estado-select" value={t.invoice_id || ''}
          title="Factura vinculada a esta reparación (cámbiala si hay duplicadas)"
          onChange={(e) => onVincular(t, e.target.value)}>
          <option value="">{t.invoice_number ? `Factura ${t.invoice_number}` : 'Sin factura'}</option>
          {invOptions.map((i) => (
            <option key={i.id} value={i.id}>Factura {i.invoice_number}</option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" disabled={invBusy === t.id}
          title="Ver el PDF de la factura (si no existe, se crea al vuelo)"
          onClick={() => onVer(t)}>
          {invBusy === t.id ? <span className="spinner" /> : 'Ver factura'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={invBusy === t.id || !t.customer_email}
          title={!t.customer_email ? 'El cliente no tiene correo guardado' : `Enviar la factura en PDF a ${t.customer_email}`}
          onClick={() => onCorreo(t)}>✉ Factura por correo</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={invBusy === t.id || !t.customer_phone}
          title={!t.customer_phone ? 'El cliente no tiene teléfono guardado' : 'Enviar el link del PDF de la factura por WhatsApp'}
          onClick={() => onWhatsApp(t)}>Factura por WhatsApp</button>
      </div>
    </div>
  );
}

export default function Repairs() {
  // Permite llegar con ?entregado=YYYY-MM-DD (desde el gráfico de ventas del Dashboard).
  const [searchParams, setSearchParams] = useSearchParams();
  const dayParam = searchParams.get('entregado');
  const dayFilter = /^\d{4}-\d{2}-\d{2}$/.test(dayParam || '') ? dayParam : null;
  const [tickets, setTickets] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [invoices, setInvoices] = useState([]); // para vincular factura a la reparación
  const [err, setErr] = useState('');
  const [vista, setVista] = useState(dayFilter ? 'entregadas' : 'taller'); // pestaña
  const [deviceFilter, setDeviceFilter] = useState('todas'); // categoría de equipo
  const [q, setQ] = useState(''); // buscador
  const [detail, setDetail] = useState(null); // { id, initial? } | { id: null }
  // Menú "+ Nuevo → Reparación": /reparaciones?nueva=1 abre el formulario.
  // Desde Citas llega con los datos del cliente (&cliente=…&tel=…&equipo=…).
  useEffect(() => {
    if (!searchParams.get('nueva')) return;
    setDetail({ id: null, initial: inicialDesdeParams(searchParams) });
    setSearchParams({}, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  // Si llega ?entregado= con la página ya abierta, se va a "Entregadas".
  useEffect(() => { if (dayFilter) setVista('entregadas'); }, [dayFilter]);
  const [selMode, setSelMode] = useState(false); // modo "seleccionar varias"
  const [sel, setSel] = useState(() => new Set()); // ids marcados para borrar
  const [busy, setBusy] = useState(false);
  const [stepBusy, setStepBusy] = useState(null); // id de la tarjeta que cambia de paso
  const [exiting, setExiting] = useState(false); // el formulario se despide animado
  const [ok, setOk] = useState('');
  const [invBusy, setInvBusy] = useState(null); // id de ticket con factura en proceso

  // Vincular (o quitar) la factura de la reparación: la elección manda sobre
  // la búsqueda automática, así si hay duplicadas se escoge la correcta.
  const vincularFactura = async (t, invoiceId) => {
    setErr(''); setOk('');
    try {
      const d = await api('/repairs/' + t.id, { method: 'PATCH', body: { invoice_id: invoiceId || null } });
      const inv = invoices.find((i) => String(i.id) === String(invoiceId));
      setTickets((list) => list.map((x) => (x.id === t.id
        ? { ...x, invoice_id: d.ticket.invoice_id, invoice_number: inv ? inv.invoice_number : null }
        : x)));
      setOk(inv ? `Reparación vinculada a la factura ${inv.invoice_number}.` : 'Vínculo de factura quitado.');
    } catch (e) { setErr(e.message); }
  };

  // Opciones para vincular: facturas libres o las ya ligadas a ESTE ticket
  // (para no robarle la factura a otra reparación).
  const invoiceOptions = (t) => invoices.filter((i) => i.repair_id == null || i.repair_id === t.id);

  // Factura de la reparación: VER el PDF (link público con el track_token) o
  // reenviarla por correo / WhatsApp. Si no existe, el server la crea al
  // vuelo con los datos del ticket.
  const marcarFactura = (t, num) => {
    if (!t.invoice_number && num) {
      setTickets((list) => list.map((x) => (x.id === t.id ? { ...x, invoice_number: num } : x)));
    }
  };
  const verFactura = async (t) => {
    setErr(''); setOk(''); setInvBusy(t.id);
    try {
      const d = await api('/repairs/' + t.id + '/invoice-link', { method: 'POST' });
      marcarFactura(t, d.invoice_number);
      window.open(window.location.origin + d.path, '_blank', 'noopener');
    } catch (e) { setErr(e.message); }
    setInvBusy(null);
  };
  const facturaCorreo = async (t) => {
    setErr(''); setOk(''); setInvBusy(t.id);
    try {
      const d = await api('/repairs/' + t.id + '/send-invoice', { method: 'POST' });
      marcarFactura(t, d.invoice_number);
      setOk(`Factura ${d.invoice_number} enviada a ${t.customer_email}.`);
    } catch (e) { setErr(e.message); }
    setInvBusy(null);
  };
  const facturaWhatsApp = async (t) => {
    setErr(''); setOk(''); setInvBusy(t.id);
    try {
      const d = await api('/repairs/' + t.id + '/invoice-link', { method: 'POST' });
      marcarFactura(t, d.invoice_number);
      const device = [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'equipo';
      const link = window.location.origin + d.path;
      const msg = `Hola${t.customer_name ? ' ' + t.customer_name : ''}, ${saludo()}. Aquí tienes tu factura ${d.invoice_number} de ElectronicST por la reparación de tu ${device} (PDF): ${link}`;
      window.open('https://wa.me/' + phoneIntl(t.customer_phone) + '?text=' + encodeURIComponent(msg), '_blank');
      setOk('Se abrió WhatsApp con el link de la factura listo para enviar.');
    } catch (e) { setErr(e.message); }
    setInvBusy(null);
  };

  // "Avisar por WhatsApp" (columna Listo): mismo armado de wa.me con saludo()
  // que la factura; la recogida es con cita (mismo link que el correo de "lista").
  const avisarListo = (t) => {
    setErr(''); setOk('');
    const device = [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'equipo';
    const saldo = saldoDe(t);
    const link = window.location.origin + '/book-appointment?pickup=repair&rep=' + repNum(t);
    const msg = `Hola${t.customer_name ? ' ' + t.customer_name : ''}, ${saludo()}. Tu ${device} ya está listo para recoger en ElectronicST (${repNum(t)}).` +
      (saldo > 0 ? ` El saldo pendiente es de ${money(saldo)}.` : '') +
      `\nLa recogida es con cita; agenda tu hora aquí: ${link}`;
    window.open('https://wa.me/' + phoneIntl(t.customer_phone) + '?text=' + encodeURIComponent(msg), '_blank');
    setOk('Se abrió WhatsApp con el aviso listo para enviar.');
  };

  const load = useCallback((silent) => {
    if (!silent) setErr('');
    api('/repairs').then((d) => setTickets(d.tickets)).catch((e) => { if (!silent) setErr(e.message); });
  }, []);
  useEffect(() => {
    load();
    api('/users').then((d) => setWorkers(d.users.filter((u) => u.active))).catch(() => {});
    api('/invoices').then((d) => setInvoices(d.invoices || [])).catch(() => {});
    const t = setInterval(() => load(true), 30000); // respaldo silencioso si el stream se cae
    return () => clearInterval(t);
  }, [load]);

  /* Seguimiento EN VIVO del repuesto: un stream SSE por reparación con tracking
     activo (el mismo canal público que usa track.html). Cuando el webhook, el
     job o el robot USPS actualizan el ship_tag, el server emite el aviso
     ('rep:<id>') y la lista se recarga al momento — la barra del repuesto se
     mueve sola, sin tocar F5. Al entregarse la pieza (Delivered) o entregarse
     la reparación se cierra el stream. */
  const streams = useRef(new Map());
  useEffect(() => {
    if (!tickets) return;
    const map = streams.current;
    const quieren = new Map();
    for (const t of tickets) {
      if (t.track_token && t.tracking_number && t.ship_tag !== 'Delivered' && t.status !== 'entregado') {
        quieren.set(t.id, t.track_token);
      }
    }
    for (const [id, es] of map) {
      if (!quieren.has(id)) { es.close(); map.delete(id); }
    }
    for (const [id, token] of quieren) {
      if (map.has(id)) continue;
      const es = new EventSource('/api/track/' + token + '/stream');
      es.onmessage = (ev) => {
        try { if (JSON.parse(ev.data).type === 'update') load(true); } catch (_) { /* latido */ }
      };
      map.set(id, es);
    }
  }, [tickets, load]);
  useEffect(() => () => {
    for (const es of streams.current.values()) es.close();
    streams.current.clear();
  }, []);

  // Buscador: cliente, teléfono, IMEI/serie, número REP (y equipo/correo/tracking).
  const texto = q.trim().toLowerCase();
  const digitos = texto.replace(/\D/g, '');
  const coincide = (t) => {
    if (!texto) return true;
    const hay = [t.customer_name, t.customer_email, t.device_brand, t.device_model, t.device_serial, repNum(t), t.tracking_number]
      .filter(Boolean).join(' ').toLowerCase();
    if (hay.includes(texto)) return true;
    return digitos.length >= 3 && String(t.customer_phone || '').replace(/\D/g, '').includes(digitos);
  };

  // Filtro por categoría de equipo (teléfonos / tablets / laptops) + buscador.
  const base = tickets ? tickets.filter((t) => (deviceFilter === 'todas' || t.device_type === deviceFilter) && coincide(t)) : [];
  const enTaller = base.filter((t) => t.status !== 'entregado');
  const entregadas = base
    .filter((t) => t.status === 'entregado' && (!dayFilter || diaKey(t.delivered_at) === dayFilter))
    .sort((a, b) => (String(a.delivered_at || '') < String(b.delivered_at || '') ? 1 : -1));
  const shown = vista === 'taller' ? enTaller : entregadas;

  // Resumen de arriba (sobre TODAS las reparaciones, sin filtros).
  const activas = tickets ? tickets.filter((t) => t.status !== 'entregado') : [];
  const nListas = activas.filter((t) => t.status === 'listo').length;
  const porCobrar = activas.reduce((s, t) => s + (saldoDe(t) || 0), 0);
  const sub = tickets == null ? '' : [
    activas.length ? `${activas.length} en el taller` : 'Nada en el taller',
    nListas > 0 && `${nListas} lista${nListas === 1 ? '' : 's'} para entregar`,
    porCobrar > 0 && `${money(porCobrar)} por cobrar`,
  ].filter(Boolean).join(' · ');

  // Al cambiar de filtro se limpia la selección: así nunca se borra algo que
  // ya no está a la vista.
  useEffect(() => { setSel(new Set()); }, [vista, deviceFilter, dayFilter, q]);

  const toggle = (id) => setSel((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allShownSelected = shown.length > 0 && shown.every((t) => sel.has(t.id));
  const toggleAllShown = () => setSel((prev) => {
    const n = new Set(prev);
    for (const t of shown) { if (allShownSelected) n.delete(t.id); else n.add(t.id); }
    return n;
  });
  const salirSeleccion = () => { setSelMode(false); setSel(new Set()); };

  const removeSelected = async () => {
    const ids = [...sel];
    if (!ids.length) return;
    if (!window.confirm(`¿Eliminar ${ids.length} reparación${ids.length === 1 ? '' : 'es'}? También se borran sus fotos. No se puede deshacer.`)) return;
    setBusy(true); setErr('');
    try {
      await api('/repairs', { method: 'DELETE', body: { ids } });
      salirSeleccion();
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Cambiar el estado desde el tablero (mismo PATCH que el selector de la
  // ficha; al pasar a 'listo' el server manda el correo al cliente).
  const setEstado = async (t, status) => {
    setErr(''); setOk(''); setStepBusy(t.id);
    try {
      await api('/repairs/' + t.id, { method: 'PATCH', body: { status } });
      setTickets((list) => list.map((x) => (x.id === t.id
        ? { ...x, status, delivered_at: status === 'entregado' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
        : x)));
    } catch (e) { setErr(e.message); }
    setStepBusy(null);
  };

  // "Siguiente paso →": mueve la tarjeta a la columna siguiente.
  const avanzar = (t) => {
    const sig = SIGUIENTE[t.status];
    if (!sig) return;
    if (sig === 'listo' && t.customer_email
      && !window.confirm(`¿Pasar a Listo?\n\nSe le enviará a ${t.customer_email} el correo de que su equipo está listo para recoger.`)) return;
    setEstado(t, sig);
  };

  // Marcar entregada: cuenta como venta de hoy, por eso se confirma.
  const entregar = (t) => {
    const tot = totalDe(t);
    const saldo = saldoDe(t);
    if (!window.confirm(`¿Marcar como entregada la reparación de ${t.customer_name || 'este cliente'} (${equipoDe(t)})?\n\n`
      + `Cuenta como venta${tot != null ? ' de ' + money(tot) : ''} con fecha de hoy.`
      + (saldo > 0 ? `\nOjo: aún debe ${money(saldo)}.` : ''))) return;
    setEstado(t, 'entregado');
  };

  const removeAll = async () => {
    const n = tickets ? tickets.length : 0;
    if (!n) return;
    if (!window.confirm(`¿Eliminar TODAS las reparaciones (${n})?\n\nSe borran también sus fotos y las ventas de la página de Ventas, que salen de las reparaciones entregadas. No se puede deshacer.`)) return;
    if (!window.confirm('Última confirmación: se van a borrar TODAS las reparaciones.')) return;
    setBusy(true); setErr('');
    try {
      await api('/repairs', { method: 'DELETE', body: { all: true } });
      salirSeleccion();
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Tocar una tarjeta: abre la ficha (o la marca, en modo selección).
  const abrir = (t) => {
    if (selMode) { toggle(t.id); return; }
    setErr(''); setOk('');
    setDetail({ id: t.id });
  };
  const onKey = (t) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(t); } };
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };

  // Formulario a página completa (sin modal). Al guardar o cerrar, la página
  // del formulario se desvanece y la lista entra con su animación de siempre.
  if (detail) {
    const back = () => { setDetail(null); setExiting(false); setErr(''); setOk(''); load(); };
    const animBack = () => { setExiting(true); setTimeout(back, 260); };
    const t = detail.id && tickets ? tickets.find((x) => x.id === detail.id) : null;
    return (
      <div className={exiting ? 'page-exit' : undefined}>
        <FormPage title={detail.id ? `Reparación ${repNum({ id: detail.id })}` : 'Nueva reparación'} onBack={animBack} max={detail.id ? 760 : 640}>
          {t && (
            <Resumen t={t} err={err} ok={ok} invOptions={invoiceOptions(t)} invBusy={invBusy}
              onVincular={vincularFactura} onVer={verFactura} onCorreo={facturaCorreo} onWhatsApp={facturaWhatsApp} />
          )}
          <RepairDetail ticketId={detail.id} initial={detail.initial} workers={workers} isAdmin
            onClose={animBack} onSaved={load} onCreated={animBack} />
        </FormPage>
      </div>
    );
  }

  // Tarjeta corta del tablero (función que devuelve JSX, no componente: así
  // React no la vuelve a montar en cada render).
  const tarjeta = (t) => {
    const pieza = piezaDe(t);
    const saldo = saldoDe(t);
    const listo = t.status === 'listo';
    const dias = diasDesde(t.created_at);
    const cuando = listo ? `lista ${hace(t.updated_at || t.created_at)}` : hace(t.created_at);
    const marcado = sel.has(t.id);
    return (
      <div key={t.id} className={'bcard click rep2-card' + (marcado ? ' rep2-sel' : '')} role="button" tabIndex={0}
        onClick={() => abrir(t)} onKeyDown={onKey(t)}
        title={`${repNum(t)} · entró ${fechaCorta(t.created_at)} · ${dias === 1 ? '1 día' : dias + ' días'} en el taller`}>
        {selMode && <input type="checkbox" className="rep2-check" checked={marcado} readOnly tabIndex={-1} aria-label="Marcar" />}
        <div className="bcard-title rep2-card-t">{equipoDe(t)}</div>
        <div className="bcard-sub">{t.customer_name || 'Sin nombre'} · {cuando}</div>
        <div className="bcard-tags">
          <span className="st st-muted">{serviceTypeLabel(t.service_type)}</span>
          {pieza && <span className={'st ' + pieza.cls}>{pieza.txt}</span>}
          {listo
            ? (saldo == null ? <span className="st st-muted">Sin precio</span>
              : saldo > 0 ? <span className="st st-bad">Cobrar {money(saldo)}</span>
                : <span className="st st-ok">Pagada</span>)
            : (saldo > 0 && <span className="st">Debe {money(saldo)}</span>)}
        </div>
        {!selMode && (
          <div className="bcard-foot">
            <div className="rep2-acts">
              {listo ? (
                <>
                  <button type="button" className="btn-step" disabled={!t.customer_phone}
                    title={t.customer_phone ? 'Abrir WhatsApp con el aviso listo' : 'El cliente no tiene teléfono guardado'}
                    onClick={stop(() => avisarListo(t))}>Avisar por WhatsApp</button>
                  <button type="button" className="rep2-link" disabled={stepBusy === t.id}
                    title="Marcar como entregada (cuenta como venta de hoy)"
                    onClick={stop(() => entregar(t))}>
                    {stepBusy === t.id ? <span className="spinner" /> : 'Entregar ✓'}
                  </button>
                </>
              ) : (
                <button type="button" className="btn-step" disabled={stepBusy === t.id}
                  title={`Pasar a ${colLabel(SIGUIENTE[t.status])}`}
                  onClick={stop(() => avanzar(t))}>
                  {stepBusy === t.id ? <span className="spinner" /> : 'Siguiente paso →'}
                </button>
              )}
            </div>
            {t.assignee_username && (
              <span className="av av-sm" title={'Técnico: ' + t.assignee_username}>{iniciales(t.assignee_username)}</span>
            )}
          </div>
        )}
      </div>
    );
  };

  const deviceTabs = DEVICE_TYPES.map((s) => ({ v: s.v, l: DEVICE_PLURAL[s.v] }));

  return (
    <div className="rep2">
      <PageHead title="Reparaciones" sub={sub}
        search={q} onSearch={setQ} searchPlaceholder="Buscar cliente, teléfono, IMEI o REP…">
        <button className="btn btn-primary" onClick={() => { setErr(''); setOk(''); setDetail({ id: null }); }}>+ Nueva reparación</button>
        <MoreMenu items={[
          tickets && tickets.length > 0 && { label: selMode ? 'Terminar selección' : 'Seleccionar varias', onClick: () => (selMode ? salirSeleccion() : setSelMode(true)) },
          tickets && tickets.length > 0 && { label: 'Eliminar todas', danger: true, disabled: busy, onClick: removeAll },
        ]} />
      </PageHead>

      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      {/* Pestañas: paso (taller / entregadas) + tipo de equipo (tocar otra vez lo quita). */}
      <div className="rep2-tabs">
        <Tabs tabs={[{ v: 'taller', l: 'En el taller', n: enTaller.length }, { v: 'entregadas', l: 'Entregadas' }]}
          value={vista} onChange={setVista} />
        <span className="rep2-sep" aria-hidden="true" />
        <Tabs tabs={deviceTabs} value={deviceFilter}
          onChange={(v) => setDeviceFilter((cur) => (cur === v ? 'todas' : v))} />
      </div>

      {dayFilter && vista === 'entregadas' && (
        <div className="rep2-chip">
          <span>Entregadas el {fechaCorta(dayFilter, { conHora: false })}</span>
          <button type="button" className="rep2-link" onClick={() => setSearchParams({}, { replace: true })}>Quitar filtro ×</button>
        </div>
      )}

      {selMode && (
        <div className="rep2-selbar">
          <span>{sel.size ? `${sel.size} seleccionada${sel.size === 1 ? '' : 's'}` : 'Toca las reparaciones para marcarlas'}</span>
          <div className="spacer" />
          <button className="btn btn-ghost btn-sm" onClick={toggleAllShown} disabled={busy || !shown.length}>
            {allShownSelected ? 'Desmarcar todas' : 'Marcar todas las de la vista'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={removeSelected} disabled={busy || !sel.size}>
            {busy ? <span className="spinner" /> : 'Eliminar seleccionadas'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={salirSeleccion} disabled={busy}>Cancelar</button>
        </div>
      )}

      {tickets == null ? <div className="rep2-load"><span className="spinner spinner-lg" /></div>
        : vista === 'taller' ? (
          enTaller.length === 0 && (texto || deviceFilter !== 'todas')
            ? <div className="empty-state">No hay reparaciones en el taller con este filtro.</div>
            : (
              /* Tablero: una columna por paso. */
              <div className="board rep2-board">
                {COLUMNAS.map((col) => {
                  const items = enTaller.filter((t) => t.status === col.v);
                  return (
                    <div key={col.v} className={'bcol rep2-col rep2-col-' + col.v}>
                      <div className="bcol-h"><b>{col.l}</b>{items.length}</div>
                      {items.length === 0
                        ? <div className="bcol-empty">Nada aquí</div>
                        : items.map(tarjeta)}
                    </div>
                  );
                })}
              </div>
            )
        ) : (
          entregadas.length === 0
            ? <div className="empty-state">No hay reparaciones entregadas{dayFilter || texto || deviceFilter !== 'todas' ? ' con este filtro' : ' todavía'}.</div>
            : (
              <div className="lcards">
                {entregadas.map((t) => {
                  const marcado = sel.has(t.id);
                  return (
                    <div key={t.id} className={'lcard click rep2-row' + (marcado ? ' sel' : '')} role="button" tabIndex={0}
                      onClick={() => abrir(t)} onKeyDown={onKey(t)}>
                      {selMode && <input type="checkbox" checked={marcado} readOnly tabIndex={-1} aria-label="Marcar" />}
                      <div className="rep2-row-when">{fechaCorta(t.delivered_at, { conHora: false })}</div>
                      <div className="lcard-main">
                        <div className="lcard-title">{t.customer_name || 'Sin nombre'}</div>
                        <div className="lcard-sub">{equipoDe(t)} · {serviceTypeLabel(t.service_type)} · {repNum(t)}</div>
                      </div>
                      <div className="lcard-num">{money(totalDe(t))}</div>
                      {!selMode && (
                        <button type="button" className="btn btn-secondary btn-sm rep2-row-inv" disabled={invBusy === t.id}
                          title={t.invoice_number ? `Ver la factura ${t.invoice_number} (PDF)` : 'Ver la factura (si no existe, se crea al vuelo)'}
                          onClick={stop(() => verFactura(t))}>
                          {invBusy === t.id ? <span className="spinner" /> : 'Ver factura'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )
        )}
    </div>
  );
}
