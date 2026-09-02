import { useEffect, useMemo, useState, Fragment } from 'react';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';

// Órdenes/Envíos: compras del website (llegan solas vía Stripe) y órdenes
// manuales de FB Marketplace. El estado del envío avanza solo: al poner el
// tracking pasa a "enviado", y con AFTERSHIP_API_KEY el server marca
// "entregado" cuando el paquete llega. La página se recarga cada 30 s
// mientras está abierta para reflejar esos cambios en tiempo real.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const POLL_MS = 30 * 1000;

const SHIP_LABEL = { pendiente: 'Pendiente', enviado: 'Enviado', entregado: 'Entregado' };
const SHIP_BADGE = { pendiente: 'badge-pendiente', enviado: 'badge-confirmada', entregado: 'badge-atendida' };
const CARRIERS = [
  { v: 'usps', l: 'USPS' },
  { v: 'ups', l: 'UPS' },
  { v: 'fedex', l: 'FedEx' },
  { v: 'dhl', l: 'DHL' },
  { v: 'otro', l: 'Otra' },
];

function fmtDay(iso) {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

// Barra de progreso animada del envío: Enviado → En tránsito → En reparto →
// Entregado. Usa ship_tag (AfterShip) cuando existe; si no, cae al estado
// interno (ship_status). El relleno se anima solo al montar/cambiar.
const SHIP_STEPS = ['Enviado', 'En tránsito', 'En reparto', 'Entregado'];
function shipStep(o) {
  const tag = o.ship_tag;
  if (o.ship_status === 'entregado' || tag === 'Delivered') return 4;
  if (tag === 'OutForDelivery') return 3;
  if (tag === 'InTransit') return 2;
  if (o.ship_status === 'enviado' || o.tracking_number) return 1;
  return 0;
}
function ShipBar({ order }) {
  const step = shipStep(order);
  const pct = step === 0 ? 0 : (step / SHIP_STEPS.length) * 100;
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
      {step === 0 && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Pendiente de envío — guarda el tracking para activar el seguimiento.</div>}
    </div>
  );
}

let SEQ = 1;
const nuevaLinea = () => ({ uid: SEQ++, name: '', qty: '1', price: '' });

// Formulario de nueva orden manual (FB Marketplace), a página completa.
function OrderForm({ onCancel, onSaved }) {
  const [form, setForm] = useState({
    customer_name: '', phone: '', email: '', address: '', items: [nuevaLinea()],
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

      <div className="row" style={{ justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : 'Guardar orden'}</button>
      </div>
    </form>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  // Form de tracking por orden (se edita dentro del detalle expandido).
  const [track, setTrack] = useState({}); // { [orderId]: { number, carrier } }

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

  const load = (silent) => api('/orders')
    .then((d) => setOrders(d.orders || []))
    .catch((e) => { if (!silent) setErr(e.message); });

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(true), POLL_MS); // actualización en tiempo real
    return () => clearInterval(t);
  }, []);

  const guardarTracking = async (o) => {
    const t = track[o.id] || {};
    if (!String(t.number || '').trim()) { setErr('Escribe el número de tracking.'); return; }
    setBusy(true); setErr('');
    try {
      const d = await api('/orders/' + o.id, {
        method: 'PATCH',
        body: { tracking_number: t.number.trim(), carrier: t.carrier || 'usps' },
      });
      setOrders((list) => (list || []).map((x) => (x.id === o.id ? d.order : x)));
      setTrack((m) => ({ ...m, [o.id]: { number: '', carrier: 'usps' } }));
      if (!d.tracking_activo) {
        setErr('Tracking guardado. Nota: sin AFTERSHIP_API_KEY el estado "entregado" se marca manual.');
      }
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const marcarEntregado = async (o) => {
    setBusy(true); setErr('');
    try {
      const d = await api('/orders/' + o.id, { method: 'PATCH', body: { ship_status: 'entregado' } });
      setOrders((list) => (list || []).map((x) => (x.id === o.id ? d.order : x)));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const pendientes = useMemo(() => (orders || []).filter((o) => o.ship_status === 'pendiente').length, [orders]);

  if (creating) {
    return (
      <FormPage title="Nueva orden — FB Marketplace" onBack={() => setCreating(false)} max={680}>
        <OrderForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load(false); }} />
      </FormPage>
    );
  }

  return (
    <div className="orders-page">
      {err && <div className="alert alert-error">{err}</div>}

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="muted" style={{ fontSize: 14 }}>
          {orders == null ? '' : `${orders.length} orden${orders.length === 1 ? '' : 'es'} · ${pendientes} pendiente${pendientes === 1 ? '' : 's'} de envío`}
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nueva orden (FB Marketplace)</button>
      </div>

      <div className="card">
        <h3>Envíos</h3>
        {orders == null ? <span className="spinner" />
          : orders.length === 0 ? <div className="empty">No hay órdenes todavía. Las compras del website aparecen aquí automáticamente.</div>
            : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Fecha</th><th>Cliente</th><th className="hide-sm">Origen</th><th className="hide-sm">Dirección</th><th style={{ textAlign: 'right' }}>Total</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <Fragment key={o.id}>
                        <tr>
                          <td className="muted">{fmtDay(o.created_at)}</td>
                          <td>
                            <strong>{o.customer_name || '—'}</strong>
                            <div className="muted" style={{ fontSize: 12 }}>{o.email || o.phone || ''}</div>
                          </td>
                          <td className="hide-sm">
                            <span className={'badge ' + (o.origen === 'fb_marketplace' ? 'badge-fb' : 'badge-online')}>
                              {o.origen === 'fb_marketplace' ? 'FB Marketplace' : 'Website'}
                            </span>
                          </td>
                          <td className="muted hide-sm" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.address || '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}><strong>{usd.format(Number(o.total) || 0)}</strong></td>
                          <td><span className={'badge ' + (SHIP_BADGE[o.ship_status] || '')}>{SHIP_LABEL[o.ship_status] || o.ship_status}</span></td>
                        </tr>
                        {/* Detalle siempre abierto: toda la info a la vista. */}
                        <tr>
                          <td colSpan="6" style={{ background: '#f8f9fb' }}>
                            <div className="order-detail">
                              <div><span className="muted">Cliente:</span> <strong>{o.customer_name || '—'}</strong></div>
                              <div><span className="muted">Email:</span> {o.email || '—'}</div>
                              <div><span className="muted">Teléfono:</span> {o.phone || '—'}</div>
                              <div className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <span><span className="muted">Dirección de envío:</span> {o.address || '—'}</span>
                                {o.address && (
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiarDireccion(o)}
                                    title="Copiar dirección">
                                    {copiedId === o.id ? '✓ Copiada' : 'Copiar'}
                                  </button>
                                )}
                              </div>
                              <div>
                                <span className="muted">Artículos:</span>
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                  {(o.items || []).map((i, idx) => (
                                    <li key={idx}>{i.qty > 1 ? `${i.qty}× ` : ''}{i.name} — {usd.format(Number(i.price) || 0)}</li>
                                  ))}
                                </ul>
                              </div>
                              <div style={{ marginTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 10 }}>
                                <span className="muted">Tracking:</span>{' '}
                                {o.tracking_number
                                  ? <><strong>{o.tracking_number}</strong>{o.carrier ? ` (${String(o.carrier).toUpperCase()})` : ''}</>
                                  : 'sin tracking'}
                              </div>
                              <div style={{ marginTop: 12 }}>
                                <ShipBar order={o} />
                              </div>
                              {o.ship_status !== 'entregado' && (
                                <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <input
                                    style={{ width: 220 }}
                                    placeholder="Número de tracking"
                                    value={(track[o.id] && track[o.id].number) || ''}
                                    onChange={(e) => setTrack((m) => ({ ...m, [o.id]: { number: e.target.value, carrier: (m[o.id] && m[o.id].carrier) || 'usps' } }))}
                                  />
                                  <select
                                    style={{ width: 'auto' }}
                                    value={(track[o.id] && track[o.id].carrier) || 'usps'}
                                    onChange={(e) => setTrack((m) => ({ ...m, [o.id]: { number: (m[o.id] && m[o.id].number) || '', carrier: e.target.value } }))}
                                  >
                                    {CARRIERS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                                  </select>
                                  <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => guardarTracking(o)}>
                                    Guardar tracking → Enviado
                                  </button>
                                  {o.ship_status === 'enviado' && (
                                    <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => marcarEntregado(o)}>
                                      Marcar entregado
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </div>
  );
}
