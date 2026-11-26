import { useEffect, useMemo, useState, Fragment } from 'react';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import PageHead from '../components/PageHead.jsx';
import Tabs from '../components/Tabs.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import { fechaCorta, hace, diasDesde, diaKey, hoyKey, iniciales } from '../fechas.js';
import './Orders.css';

// Órdenes/Envíos: compras del website (llegan solas vía Stripe) y órdenes
// manuales de FB Marketplace. El estado del envío avanza solo: al poner el
// tracking pasa a "enviado", y con AFTERSHIP_API_KEY el server marca
// "entregado" cuando el paquete llega. La página se recarga cada 30 s
// mientras está abierta para reflejar esos cambios en tiempo real.
//
// Diseño nuevo (2026-11-26): pestañas Por enviar · En camino · Entregadas ·
// Todas; una tarjeta corta por pedido (en "Por enviar" se pega el tracking y
// se envía desde la misma tarjeta) y el detalle completo abre al tocarla.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const POLL_MS = 30 * 1000;

const CARRIERS = [
  { v: 'usps', l: 'USPS' },
  { v: 'ups', l: 'UPS' },
  { v: 'fedex', l: 'FedEx' },
  { v: 'dhl', l: 'DHL' },
  { v: 'otro', l: 'Otra' },
];

// Teléfono en formato US: "+12055550111" → "(205) 555-0111". Si trae código
// de país de más dígitos, se toman los últimos 10; si no cuadra, se muestra
// tal cual.
function fmtPhone(p) {
  if (!p) return '—';
  let digits = String(p).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length > 11) digits = digits.slice(-10);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return p;
}

// Dirección en formato de dirección: cada parte en su línea
// ("calle" / "ciudad, estado, ZIP"). Las órdenes la guardan separada por " | ".
function fmtAddress(addr) {
  if (!addr) return '—';
  return String(addr).split(' | ').filter(Boolean).join('\n');
}

// Barra de progreso animada del envío: Label generado → Enviado → En tránsito →
// En reparto → Delivered. Usa ship_tag (AfterShip) cuando existe; si no, cae al
// estado interno (ship_status). El relleno se anima solo al montar/cambiar.
const SHIP_STEPS = ['Label generado', 'Enviado', 'En tránsito', 'En reparto', 'Delivered'];
function shipStep(o) {
  const tag = o.ship_tag;
  if (o.ship_status === 'entregado' || tag === 'Delivered') return 5;
  if (tag === 'OutForDelivery') return 4;
  if (tag === 'InTransit') return 3;
  if (o.ship_status === 'enviado' || o.tracking_number) return 2;
  return 1;
}
function ShipBar({ order }) {
  const step = shipStep(order);
  // El relleno llega hasta el centro de la columna del paso actual
  const pct = ((step - 0.5) / SHIP_STEPS.length) * 100;
  return (
    <div className="shipbar">
      <div className="shipbar-line">
        <div className="shipbar-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="shipbar-steps">
        {SHIP_STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className={'shipbar-step' + (step >= n ? ' on' : '') + (step === n ? ' current' : '')}>
              <div className="shipbar-dot" />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      {step === 1 && !order.tracking_number && <div className="muted" style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>Label generada — guarda el tracking cuando salga el paquete.</div>}
    </div>
  );
}

let SEQ = 1;
const nuevaLinea = () => ({ uid: SEQ++, name: '', qty: '1', price: '' });

// Formulario de nueva orden manual (FB Marketplace), a página completa.
function OrderForm({ onCancel, onSaved }) {
  const [form, setForm] = useState({
    customer_name: '', phone: '', email: '', address: '', costo: '', items: [nuevaLinea()],
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLinea = (uid, patch) =>
    setForm((f) => ({ ...f, items: f.items.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) }));
  const quitar = (uid) => setForm((f) => ({ ...f, items: f.items.filter((l) => l.uid !== uid) }));

  const total = form.items.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);

  const guardar = async (e) => {
    e.preventDefault();
    setErr('');
    const items = form.items
      .filter((l) => l.name.trim())
      .map((l) => ({ name: l.name.trim(), qty: Number(l.qty) || 1, price: Number(l.price) || 0 }));
    if (!form.customer_name.trim()) { setErr('Falta el nombre del cliente.'); return; }
    if (!form.address.trim()) { setErr('Falta la dirección de envío.'); return; }
    if (!items.length) { setErr('Agrega al menos un artículo.'); return; }
    setSaving(true);
    try {
      await api('/orders', {
        method: 'POST',
        body: {
          customer_name: form.customer_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          address: form.address.trim(),
          items,
          costo: form.costo === '' ? 0 : Number(form.costo),
        },
      });
      onSaved();
    } catch (e2) { setErr(e2.message); }
    setSaving(false);
  };

  return (
    <form onSubmit={guardar}>
      {err && <div className="alert alert-error">{err}</div>}

      <div className="inv-sec">Cliente</div>
      <div className="rd-grid">
        <label className="field"><span>Nombre *</span><input value={form.customer_name} onChange={(e) => set({ customer_name: e.target.value })} required /></label>
        <label className="field"><span>Teléfono</span><input value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
      </div>
      <div className="rd-grid">
        <label className="field"><span>Correo</span><input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></label>
        <label className="field"><span>Dirección de envío *</span><input value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Calle, ciudad, estado, ZIP" required /></label>
      </div>

      <div className="inv-sec">Artículos</div>
      {form.items.map((l) => (
        <div className="venta-linea" key={l.uid}>
          <input placeholder="Descripción" value={l.name} onChange={(e) => setLinea(l.uid, { name: e.target.value })} />
          <input type="number" min="1" step="1" placeholder="Cant." value={l.qty} onChange={(e) => setLinea(l.uid, { qty: e.target.value })} />
          <input type="number" min="0" step="0.01" placeholder="Precio" value={l.price} onChange={(e) => setLinea(l.uid, { price: e.target.value })} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitar(l.uid)}
            disabled={form.items.length === 1} title="Quitar línea">✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({ items: [...form.items, nuevaLinea()] })}>
        + Agregar línea
      </button>

      <div className="inv-total-row"><span>Total</span><strong>{usd.format(total)}</strong></div>

      <div className="rd-grid" style={{ marginTop: 12 }}>
        <label className="field">
          <span>Costo del producto ($) — lo que pagaste por él</span>
          <input type="number" min="0" step="0.01" value={form.costo} onChange={(e) => set({ costo: e.target.value })} placeholder="0.00" />
        </label>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {Number(form.costo) > 0
              ? `Ganancia estimada: ${usd.format(total - (Number(form.costo) || 0))}`
              : 'Sin costo, la ganancia de esta orden contará como 100%.'}
          </span>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Guardar orden'}</button>
      </div>
    </form>
  );
}

// Estado del pedido como texto de color (sin píldora ni fondo).
const PASO_TXT = ['Label generado', 'Enviado', 'En tránsito', 'En reparto', 'Entregado'];
function estadoDe(o) {
  if (o.ship_status === 'entregado') return { t: 'Entregado', c: 'st-ok' };
  if (o.ship_status === 'pendiente') return { t: 'Por enviar', c: 'st-warn' };
  return { t: PASO_TXT[shipStep(o) - 1], c: 'st-strong' };
}

// Barra compacta de 5 pasos para la tarjeta de un pedido en camino (la
// grande, con etiquetas, va en el detalle).
function MiniShip({ order }) {
  const step = shipStep(order);
  return (
    <span className="orn2-mini" role="img" aria-label={`Paso ${step} de 5: ${PASO_TXT[step - 1]}`}
      title={PASO_TXT.join(' → ')}>
      {PASO_TXT.map((l, i) => <i key={l} className={(i < step ? 'on' : '') + (i === step - 1 ? ' cur' : '')} />)}
    </span>
  );
}

// Líneas de impuestos/envío que Stripe agrega a los artículos: no cuentan
// como "artículo principal" de la tarjeta.
const LINEA_EXTRA = /^(impuestos?|tax(es)?|sales tax|env[ií]o|shipping)\b/i;
function articuloPrincipal(o) {
  const items = o.items || [];
  const prods = items.filter((i) => !LINEA_EXTRA.test(String(i.name || '').trim()));
  const first = prods[0] || items[0];
  if (!first) return 'Pedido';
  const q = Number(first.qty) > 1 ? `${first.qty}× ` : '';
  return q + first.name + (prods.length > 1 ? ` +${prods.length - 1}` : '');
}
const origenTxt = (o) => (o.origen === 'fb_marketplace' ? 'FB Marketplace' : 'Web');
// "hace 3 h" si el pedido es de hoy; si no, "ayer 18:05" / "vie 20 nov".
const cuando = (iso) => (diasDesde(iso) === 0 ? hace(iso) : fechaCorta(iso));
// expected_delivery es DATE: se toma la fecha tal cual (sin pasar por zona horaria).
const fechaEstimada = (o) => (o.expected_delivery ? String(o.expected_delivery).slice(0, 10) : null);
// online_orders no guarda la fecha exacta de entrega: se usa la estimada (el
// rastreo la actualiza al entregar), si no la de envío, si no la del pedido.
const fechaEntrega = (o) => fechaEstimada(o) || o.shipped_at || o.created_at;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const VACIO = {
  pendiente: 'Nada por enviar. Las compras nuevas del website aparecen aquí solas.',
  enviado: 'Ningún pedido en camino ahora mismo.',
  entregado: 'Todavía no hay pedidos entregados.',
  todas: 'No hay órdenes todavía. Las compras del website aparecen aquí automáticamente.',
};

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [tab, setTab] = useState('pendiente'); // pendiente | enviado | entregado | todas
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null); // pedido con el detalle abierto
  // Tracking por orden (se escribe en la tarjeta o en el detalle).
  const [track, setTrack] = useState({}); // { [orderId]: { number, carrier } }
  const trackOf = (id) => track[id] || { number: '', carrier: 'usps' };
  const setTrackField = (id, patch) =>
    setTrack((m) => ({ ...m, [id]: { ...(m[id] || { number: '', carrier: 'usps' }), ...patch } }));

  // Copiar la dirección al portapapeles (con feedback "Copiada").
  const copiarDireccion = async (o) => {
    if (!o.address) return;
    try {
      await navigator.clipboard.writeText(o.address);
    } catch (_) {
      // Fallback para contextos sin clipboard API (HTTP viejo).
      const ta = document.createElement('textarea');
      ta.value = o.address;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* nada más que hacer */ }
      ta.remove();
    }
    setCopiedId(o.id);
    setTimeout(() => setCopiedId((c) => (c === o.id ? null : c)), 1600);
  };

  // GET /orders también sincroniza con Stripe en el server (máx. 1 vez/min).
  const load = (silent) => api('/orders')
    .then((d) => setOrders(d.orders || []))
    .catch((e) => { if (!silent) setErr(e.message); });

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), POLL_MS); // actualización en tiempo real
    return () => clearInterval(t);
  }, []);

  // Guardar tracking → la orden pasa a "enviado" (En camino).
  const guardarTracking = async (o) => {
    const t = track[o.id] || {};
    if (!String(t.number || '').trim()) { setErr('Escribe el número de tracking.'); setMsg(''); return; }
    setBusy(true); setErr(''); setMsg('');
    try {
      const d = await api('/orders/' + o.id, {
        method: 'PATCH',
        body: { tracking_number: t.number.trim(), carrier: t.carrier || 'usps' },
      });
      setOrders((list) => (list || []).map((x) => (x.id === o.id ? d.order : x)));
      setTrack((m) => ({ ...m, [o.id]: { number: '', carrier: 'usps' } }));
      const quien = o.customer_name || 'el cliente';
      setMsg(
        (o.ship_status === 'pendiente' ? `Listo: el pedido de ${quien} pasó a "En camino".` : `Tracking del pedido de ${quien} actualizado.`)
        + (d.tracking_activo ? '' : ' Nota: sin AFTERSHIP_API_KEY el estado "entregado" se marca manual.'),
      );
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const marcarEntregado = async (o) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const d = await api('/orders/' + o.id, { method: 'PATCH', body: { ship_status: 'entregado' } });
      setOrders((list) => (list || []).map((x) => (x.id === o.id ? d.order : x)));
      setMsg(`Pedido de ${o.customer_name || 'el cliente'} marcado como entregado.`);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Enviar la factura (PDF del Bill of Sale) al correo del cliente.
  const [sendingInvoice, setSendingInvoice] = useState(null);
  const [invoiceSent, setInvoiceSent] = useState({}); // { [orderId]: 'EST-0001' }
  const enviarFactura = async (o) => {
    setSendingInvoice(o.id); setErr('');
    try {
      const d = await api('/orders/' + o.id + '/send-invoice', { method: 'POST' });
      setInvoiceSent((m) => ({ ...m, [o.id]: d.invoice_number }));
    } catch (e) { setErr(e.message); }
    setSendingInvoice(null);
  };

  const mesKey = hoyKey().slice(0, 7);
  const counts = useMemo(() => {
    const l = orders || [];
    return {
      pendiente: l.filter((o) => o.ship_status === 'pendiente').length,
      enviado: l.filter((o) => o.ship_status === 'enviado').length,
      entregado: l.filter((o) => o.ship_status === 'entregado').length,
      mes: l.filter((o) => o.ship_status === 'entregado' && (diaKey(fechaEntrega(o)) || '').startsWith(mesKey)).length,
    };
  }, [orders, mesKey]);

  // Pestaña + buscador (cliente, tracking, email, teléfono, artículos, dirección).
  const qn = sinAcentos(q.trim());
  const lista = (orders || [])
    .filter((o) => tab === 'todas' || o.ship_status === tab)
    .filter((o) => !qn || sinAcentos([
      o.customer_name, o.email, o.phone, String(o.phone || '').replace(/\D/g, ''), o.tracking_number, o.address,
      ...(o.items || []).map((i) => i.name),
    ].filter(Boolean).join(' ')).includes(qn));

  if (creating) {
    return (
      <FormPage title="Nueva orden — FB Marketplace" onBack={() => setCreating(false)} max={680}>
        <OrderForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); setTab('pendiente'); load(false); }} />
      </FormPage>
    );
  }

  const sub = orders == null ? 'Cargando…'
    : orders.length === 0 ? 'Las compras del website llegan aquí solas'
      : `${counts.pendiente} por enviar · ${counts.enviado} en camino · ${plural(counts.mes, 'entregada', 'entregadas')} este mes`;

  // Formulario de tracking (tarjeta de "Por enviar" y detalle de "En camino").
  const trackForm = (o, { enDetalle } = {}) => (
    <form className={'orn2-ship' + (enDetalle ? ' orn2-ship-det' : '')}
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => { e.preventDefault(); guardarTracking(o); }}>
      <input placeholder={enDetalle ? 'Nuevo número de tracking' : 'Pegar tracking…'} aria-label="Número de tracking"
        value={trackOf(o.id).number} onChange={(e) => setTrackField(o.id, { number: e.target.value })} />
      <select aria-label="Paquetería" value={trackOf(o.id).carrier || 'usps'}
        onChange={(e) => setTrackField(o.id, { carrier: e.target.value })}>
        {CARRIERS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
      </select>
      <button className={'btn btn-sm ' + (enDetalle ? 'btn-secondary' : 'btn-primary')} disabled={busy}>
        {enDetalle ? 'Cambiar tracking' : 'Enviar'}
      </button>
    </form>
  );

  const llegaDe = (o) => (o.ship_status === 'enviado' && fechaEstimada(o) ? fechaCorta(fechaEstimada(o), { conHora: false }) : null);

  // Detalle completo de un pedido (abre debajo de su tarjeta al tocarla).
  const detalle = (o) => {
    const total = Number(o.total) || 0;
    const costo = Number(o.costo) || 0;
    const llega = llegaDe(o);
    return (
      <div className="lcard-detail orn2-det">
        <div className="orn2-cols">
          <div className="orn2-col">
            <div className="orn2-lbl">Cliente</div>
            <div className="orn2-strong">{o.customer_name || '—'}</div>
            <div>{o.email || <span className="muted">sin correo</span>}</div>
            <div>{fmtPhone(o.phone)}</div>
            <div className="muted orn2-small">{o.origen === 'fb_marketplace' ? 'FB Marketplace' : 'Website'} · pedido {fechaCorta(o.created_at)}</div>
          </div>
          <div className="orn2-col">
            <div className="orn2-lbl orn2-lbl-row">
              <span>Dirección de envío</span>
              {o.address && (
                <button type="button" className="btn btn-ghost btn-sm orn2-copy" onClick={() => copiarDireccion(o)}
                  title="Copiar dirección">
                  {copiedId === o.id ? '✓ Copiada' : 'Copiar'}
                </button>
              )}
            </div>
            <div style={{ whiteSpace: 'pre-line' }}>{fmtAddress(o.address)}</div>
          </div>
          <div className="orn2-col">
            <div className="orn2-lbl">Artículos</div>
            <ul className="orn2-items">
              {(o.items || []).map((i, idx) => (
                <li key={idx}>{i.qty > 1 ? `${i.qty}× ` : ''}{i.name} — {usd.format(Number(i.price) || 0)}</li>
              ))}
            </ul>
            <div className="orn2-sum"><span>Total que pagó el cliente</span><span className="lcard-num orn2-strong">{usd.format(total)}</span></div>
            <div className="orn2-sum muted"><span>Costo del producto</span><span className="lcard-num">{usd.format(costo)}</span></div>
            <div className="orn2-sum">
              <span>Ganancia{costo === 0 && <span className="muted orn2-small"> (sin costo registrado)</span>}</span>
              <span className="lcard-num orn2-strong">{usd.format(total - costo)}</span>
            </div>
          </div>
        </div>

        <div className="orn2-trk">
          <div className="orn2-trk-line">
            <span className="muted">Tracking:</span>{' '}
            {o.tracking_number
              ? <><span className="orn2-strong">{o.tracking_number}</span>{o.carrier ? ` (${String(o.carrier).toUpperCase()})` : ''}</>
              : 'sin tracking'}
            {llega && <span className="muted"> · llega {llega}</span>}
            {o.track_token && (
              <a className="orn2-link" href={`/track?t=${o.track_token}`} target="_blank" rel="noopener noreferrer"
                title="Página de seguimiento que ve el cliente">Ver seguimiento ↗</a>
            )}
          </div>
          {o.ship_note && o.ship_status !== 'entregado' && (
            <div className="muted orn2-small" style={{ marginTop: 4 }}>Nota pública del envío: {o.ship_note}</div>
          )}
          <ShipBar order={o} />
        </div>

        <div className="orn2-acts">
          {o.email ? (
            invoiceSent[o.id] ? (
              <span className="st st-ok">Factura {invoiceSent[o.id]} enviada ✓</span>
            ) : (
              <button className="btn btn-secondary btn-sm" disabled={sendingInvoice === o.id}
                onClick={() => enviarFactura(o)}
                title={`Enviar la factura en PDF a ${o.email}`}>
                {sendingInvoice === o.id ? <span className="spinner" /> : 'Enviar factura por correo'}
              </button>
            )
          ) : (
            <span className="muted orn2-small">Sin correo del cliente: la factura no se puede enviar.</span>
          )}
          {o.ship_status === 'enviado' && (
            <>
              <button type="button" className="btn-step" disabled={busy} onClick={() => marcarEntregado(o)}>
                Marcar entregado ✓
              </button>
              {trackForm(o, { enDetalle: true })}
            </>
          )}
        </div>
      </div>
    );
  };

  // Tarjeta corta de un pedido: cliente, artículo · origen · fecha, total y estado.
  const tarjeta = (o) => {
    const est = estadoDe(o);
    const open = openId === o.id;
    const toggle = () => setOpenId((id) => (id === o.id ? null : o.id));
    const llega = llegaDe(o);
    return (
      <div className={'lcard click orn2-card' + (open ? ' sel' : '')} role="button" tabIndex={0} aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(); } }}>
        <span className="av">{iniciales(o.customer_name)}</span>
        <div className="lcard-main">
          <div className="lcard-title">{o.customer_name || '—'}</div>
          <div className="lcard-sub">{articuloPrincipal(o)} · {origenTxt(o)} · {cuando(o.created_at)}</div>
        </div>
        {o.ship_status === 'pendiente' && trackForm(o)}
        {o.ship_status === 'enviado' && (
          <span className="orn2-track">
            <MiniShip order={o} />
            {o.tracking_number && <span className="orn2-trknum">{o.carrier ? String(o.carrier).toUpperCase() + ' ' : ''}{o.tracking_number}</span>}
          </span>
        )}
        <div className="orn2-right">
          <div className="lcard-num">{usd.format(Number(o.total) || 0)}</div>
          <div className={'st ' + est.c}>{est.t}{llega ? ` · llega ${llega}` : ''}</div>
        </div>
        <span className="orn2-chev" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </div>
    );
  };

  return (
    <div className="orders-page orn2">
      <PageHead
        title="Órdenes"
        sub={sub}
        search={q}
        onSearch={(v) => { if (v && !q) setTab('todas'); setQ(v); }}
        searchPlaceholder="Buscar cliente, tracking o email…"
      >
        <button className="btn btn-primary" onClick={() => setCreating(true)} title="Orden manual de FB Marketplace">+ Nueva orden</button>
        <MoreMenu items={[{ label: 'Actualizar ahora', onClick: () => { setErr(''); setMsg(''); load(false); } }]} />
      </PageHead>

      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-ok">{msg}</div>}

      <Tabs
        value={tab}
        onChange={(v) => { setTab(v); setOpenId(null); }}
        tabs={[
          { v: 'pendiente', l: 'Por enviar', n: counts.pendiente },
          { v: 'enviado', l: 'En camino', n: counts.enviado },
          { v: 'entregado', l: 'Entregadas', n: counts.entregado },
          { v: 'todas', l: 'Todas' },
        ]}
      />

      {orders == null ? (
        <div className="orn2-cargando"><span className="spinner spinner-lg" /></div>
      ) : lista.length === 0 ? (
        <div className="empty-state">{qn ? 'Ningún pedido coincide con la búsqueda.' : VACIO[tab]}</div>
      ) : (
        <div className="lcards">
          {lista.map((o) => (
            <Fragment key={o.id}>
              {tarjeta(o)}
              {openId === o.id && detalle(o)}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
