import './Invoices.css';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import PageHead from '../components/PageHead.jsx';
import Tabs from '../components/Tabs.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import { phoneIntl, saludo } from '../components/RepairDetail.jsx';
import { fechaCorta, diaKey, hoyKey } from '../fechas.js';

/* Facturas (Bill of Sale). Listado + formulario + documento imprimible.
   La impresión/PDF es la nativa del navegador: en @media print solo queda
   visible el documento (.invoice-doc). El "compartir" usa Web Share API
   cuando existe; si no, cae en el diálogo de impresión (Guardar como PDF). */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const PAGOS = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'], ['otro', 'Otro']];

// Datos del vendedor que se repiten: se recuerdan en localStorage para no
// reescribirlos en cada factura.
const SELLER_KEY = 'est_invoice_seller';
const SELLER_DEFAULT = { seller_name: 'ElectronicST, LLC', seller_address: '', seller_phone: '', seller_email: '' };

// Hora/fecha de negocio (America/Chicago) en formato de los inputs.
function chicagoNow() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${String(p.hour % 24).padStart(2, '0')}:${p.minute}` };
}

let SEQ = 1;
// item_id: producto del inventario elegido en el dropdown (la venta generada
// descuenta su stock); null en líneas de texto libre.
const nuevaLinea = () => ({ uid: SEQ++, item_id: null, description: '', qty: 1, price: '' });

function vacio() {
  const t = chicagoNow();
  let seller = SELLER_DEFAULT;
  try { seller = { ...SELLER_DEFAULT, ...JSON.parse(localStorage.getItem(SELLER_KEY) || '{}') }; } catch (_) { /* nada */ }
  return {
    ...seller,
    sale_id: null, repair_id: null, order_id: null,
    // Factura nueva hecha a mano = venta: aparece en Ventas y descuenta stock.
    register_sale: true, sale_generated: false,
    buyer_name: '', buyer_address: '', buyer_phone: '', buyer_email: '',
    sale_date: t.date, sale_time: t.time,
    payment_method: 'efectivo', tax_rate: '0',
    items: [nuevaLinea()],
    warranty_text: '30-Day Limited Warranty',
    terms_text: '',
    notes: '',
  };
}

/* ---------- Documento imprimible (el "papel") ---------- */
// Campo etiquetado: la etiqueta gris arriba identifica cada dato (como en el
// PDF). La celda se renderiza siempre para conservar la grilla 2×2; los valores
// largos (dirección, correo) ocupan la fila completa para no cortarse.
function IdocField({ label, value, bold }) {
  const full = (value || '').length > 26;
  return (
    <div className="idoc-field" style={full ? { gridColumn: '1 / -1' } : undefined}>
      {value ? (
        <>
          <div className="idoc-flabel">{label}</div>
          <div className="idoc-fvalue" style={bold ? { fontWeight: 700 } : undefined}>{value}</div>
        </>
      ) : null}
    </div>
  );
}

function InvoiceDoc({ inv, items }) {
  const subtotal = items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const rate = Number(inv.tax_rate) || 0;
  // Facturas de órdenes: tax_rate 0 y el impuesto viene en tax_total (la
  // línea "Tax" de Stripe se extrae a su columna al crear la factura).
  const taxTotal = rate > 0 ? Math.round(subtotal * rate) / 100 : (Number(inv.tax_total) || 0);
  const shipTotal = Number(inv.shipping_total) || 0;
  const total = Math.round((subtotal + taxTotal + shipTotal) * 100) / 100;
  const pago = PAGOS.find(([v]) => v === inv.payment_method)?.[1] || inv.payment_method || '—';
  return (
    <div className="invoice-doc">
      <div className="idoc-head">
        {/* Logo EST negro + brazo dorado: el normal es blanco y no se ve sobre el papel. */}
        <img className="idoc-logo" src="/x/static/img/logo-receipt.png" alt="ElectronicST" />
        <div className="idoc-brand">
          <div className="idoc-brand-name">{inv.seller_name || 'ElectronicST, LLC'}</div>
          <div className="idoc-brand-sub">SALES &amp; REPAIR SERVICE</div>
        </div>
        <div className="idoc-title">
          <div className="idoc-title-main">RECEIPT</div>
          {inv.invoice_number && <div className="idoc-title-num">{inv.invoice_number}</div>}
        </div>
      </div>

      <div className="idoc-cols">
        <div className="idoc-box">
          <div className="idoc-box-title">Service Provider</div>
          <div className="idoc-fields">
            <IdocField label="Name" value={inv.seller_name || 'ElectronicST, LLC'} bold />
            <IdocField label="Phone Number" value={inv.seller_phone} />
            <IdocField label="Address" value={inv.seller_address} />
            <IdocField label="Email" value={inv.seller_email} />
          </div>
        </div>
        <div className="idoc-box">
          <div className="idoc-box-title">Client Information</div>
          {(inv.buyer_name || inv.buyer_phone || inv.buyer_address || inv.buyer_email) ? (
            <div className="idoc-fields">
              <IdocField label="Name" value={inv.buyer_name} bold />
              <IdocField label="Phone Number" value={inv.buyer_phone} />
              <IdocField label="Address" value={inv.buyer_address} />
              <IdocField label="Email" value={inv.buyer_email} />
            </div>
          ) : <div className="idoc-line"><span>—</span></div>}
        </div>
      </div>

      <div className="idoc-box">
        <div className="idoc-box-title">Sale Information</div>
        <div className="idoc-grid">
          <div className="idoc-line"><b>Date:</b> <span>{inv.sale_date ? inv.sale_date.split('-').reverse().join('/') : '—'}</span></div>
          <div className="idoc-line"><b>Time:</b> <span>{inv.sale_time || '—'}</span></div>
          <div className="idoc-line"><b>Payment Method:</b> <span>{pago}</span></div>
        </div>
      </div>

      <div className="idoc-box">
        <div className="idoc-box-title">Item Description</div>
        <table className="idoc-table">
          <thead>
            <tr><th>Description</th><th className="c">Qty</th><th className="r">Price</th><th className="r">Amount</th></tr>
          </thead>
          <tbody>
            {items.filter((it) => it.description || Number(it.price)).map((it) => (
              <tr key={it.uid ?? it.description}>
                <td>{it.description || '—'}{it.desc && <div style={{ fontSize: 12, color: '#8a8a92', marginTop: 2 }}>{it.desc}</div>}</td>
                <td className="c">{it.qty}</td>
                <td className="r">{usd.format(Number(it.price) || 0)}</td>
                <td className="r">{usd.format((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="idoc-totals">
          <div className="idoc-trow"><span>Subtotal</span><span>{usd.format(subtotal)}</span></div>
          <div className="idoc-trow"><span>Tax{rate > 0 ? ` (${rate}%)` : ''}</span><span>{usd.format(taxTotal)}</span></div>
          {shipTotal > 0 && <div className="idoc-trow"><span>Shipping</span><span>{usd.format(shipTotal)}</span></div>}
          <div className="idoc-trow idoc-grand"><span>Total</span><span>{usd.format(total)}</span></div>
        </div>
      </div>

      {inv.warranty_text && (
        <div className="idoc-box">
          <div className="idoc-box-title">Warranty</div>
          <div className="idoc-line"><span>{inv.warranty_text}</span></div>
        </div>
      )}
      {inv.terms_text && (
        <div className="idoc-box">
          <div className="idoc-box-title">Terms</div>
          <div className="idoc-line"><span style={{ whiteSpace: 'pre-wrap' }}>{inv.terms_text}</span></div>
        </div>
      )}
      {inv.notes && (
        <div className="idoc-box">
          <div className="idoc-box-title">Notes</div>
          <div className="idoc-line"><span style={{ whiteSpace: 'pre-wrap' }}>{inv.notes}</span></div>
        </div>
      )}

      <div className="idoc-foot">Gracias por su compra — ElectronicST, LLC</div>
    </div>
  );
}

/* ---------- Formulario ---------- */
function InvoiceForm({ form, setForm, onSave, onCancel, saving, err, isNew, productos = [] }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLinea = (uid, patch) => setForm((f) => ({ ...f, items: f.items.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) }));
  const quitar = (uid) => setForm((f) => (f.items.length > 1 ? { ...f, items: f.items.filter((l) => l.uid !== uid) } : f));
  // uid → true cuando la línea es texto libre (servicios, reparaciones) en
  // vez de un producto elegido del inventario.
  const [customDesc, setCustomDesc] = useState({});

  // Al editar una factura vieja: las líneas cuyo texto no coincide con un
  // producto del inventario arrancan en modo texto libre; las que sí
  // coinciden (facturas de antes de guardar item_id) quedan ligadas a ese
  // producto, que es el que el dropdown muestra elegido.
  // Si el producto ligado ya no está en el inventario, la línea pasa a texto
  // libre y se suelta del producto.
  useEffect(() => {
    if (!productos.length) return;
    const nuevas = form.items.filter((l) => !(l.uid in customDesc));
    if (!nuevas.length) return;
    const modo = {};
    const ligar = {};
    for (const l of nuevas) {
      const porId = l.item_id ? productos.find((x) => x.id === l.item_id) : null;
      const porNombre = porId ? null : productos.find((x) => x.name === l.description);
      modo[l.uid] = !!l.description && !porId && !porNombre;
      if (porNombre) ligar[l.uid] = porNombre.id;
      else if (l.item_id && !porId) ligar[l.uid] = null;
    }
    setCustomDesc((m) => ({ ...m, ...modo }));
    if (Object.keys(ligar).length) {
      setForm((f) => ({ ...f, items: f.items.map((l) => (l.uid in ligar ? { ...l, item_id: ligar[l.uid] } : l)) }));
    }
  }, [productos, form.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const libre = !form.sale_id && !form.repair_id && !form.order_id;

  const subtotal = form.items.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);
  const rate = Number(form.tax_rate) || 0;
  const taxTotal = Math.round(subtotal * rate) / 100;
  const total = Math.round((subtotal + taxTotal) * 100) / 100;

  return (
    <>
      {err && <div className="alert alert-error">{err}</div>}

      <div className="inv-sec">Vendedor</div>
      <div className="rd-grid">
        <label className="field"><span>Nombre del negocio</span>
          <input value={form.seller_name} onChange={(e) => set({ seller_name: e.target.value })} /></label>
        <label className="field"><span>Dirección</span>
          <input value={form.seller_address} onChange={(e) => set({ seller_address: e.target.value })} placeholder="Calle, ciudad, estado" /></label>
        <label className="field"><span>Teléfono</span>
          <input value={form.seller_phone} onChange={(e) => set({ seller_phone: e.target.value })} /></label>
        <label className="field"><span>Correo</span>
          <input type="email" value={form.seller_email} onChange={(e) => set({ seller_email: e.target.value })} /></label>
      </div>

      <div className="inv-sec">Comprador</div>
      <div className="rd-grid">
        <label className="field"><span>Nombre</span>
          <input value={form.buyer_name} onChange={(e) => set({ buyer_name: e.target.value })} placeholder="Nombre del cliente" /></label>
        <label className="field"><span>Dirección</span>
          <input value={form.buyer_address} onChange={(e) => set({ buyer_address: e.target.value })} /></label>
        <label className="field"><span>Teléfono</span>
          <input value={form.buyer_phone} onChange={(e) => set({ buyer_phone: e.target.value })} /></label>
        <label className="field"><span>Correo</span>
          <input type="email" value={form.buyer_email} onChange={(e) => set({ buyer_email: e.target.value })} /></label>
      </div>

      <div className="inv-sec">Venta</div>
      <div className="rd-grid">
        <label className="field"><span>Fecha</span>
          <input type="date" value={form.sale_date} onChange={(e) => set({ sale_date: e.target.value })} /></label>
        <label className="field"><span>Hora</span>
          <input type="time" value={form.sale_time} onChange={(e) => set({ sale_time: e.target.value })} /></label>
        <label className="field"><span>Método de pago</span>
          <select value={form.payment_method} onChange={(e) => set({ payment_method: e.target.value })}>
            {PAGOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
        <label className="field"><span>Impuesto (%)</span>
          <input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={(e) => set({ tax_rate: e.target.value })} /></label>
      </div>
      {/* La factura hecha a mano cuenta como venta (Ventas/Dashboard) y
          descuenta del inventario los productos elegidos de la lista. Si ya
          viene de una venta, reparación u orden, esa ya cuenta: no se duplica. */}
      {libre ? (
        <label className="inv-venta-check">
          <input type="checkbox" checked={!!form.register_sale} onChange={(e) => set({ register_sale: e.target.checked })} />
          <span>
            Registrar como venta
            <small>Aparece en Ventas y descuenta del inventario los productos elegidos de la lista.</small>
          </span>
        </label>
      ) : (
        <div className="inv-venta-nota">
          {form.sale_generated && form.sale_id
            ? `Esta factura generó la Venta #${form.sale_id}: al guardar cambios, la venta se actualiza con ellos.`
            : form.sale_id ? `Ligada a la Venta #${form.sale_id} (ya cuenta en Ventas).`
              : form.repair_id ? `Ligada a la Reparación #${form.repair_id} (cuenta en Ventas al entregarse).`
                : `Ligada a la Orden #${form.order_id} (ya cuenta en Ventas).`}
        </div>
      )}

      <div className="inv-sec">Artículos</div>
      {form.items.map((l) => (
        <div key={l.uid} className="venta-linea">
          <label className="field vl-prod"><span>Descripción</span>
            {productos.length > 0 && !customDesc[l.uid] ? (
              <select
                value={l.item_id ?? productos.find((p) => p.name === l.description)?.id ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__otro') {
                    setCustomDesc((m) => ({ ...m, [l.uid]: true }));
                    setLinea(l.uid, { item_id: null, description: '' });
                    return;
                  }
                  const p = productos.find((x) => String(x.id) === v);
                  if (p) setLinea(l.uid, { item_id: p.id, description: p.name, price: Number(p.price) || '' });
                }}>
                <option value="" disabled>— Producto del inventario —</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{Number(p.price) ? ` — ${usd.format(Number(p.price))}` : ''}{Number(p.stock) < 1 ? ' (sin stock)' : ` (${p.stock})`}
                  </option>
                ))}
                <option value="__otro">Otro (escribir a mano)…</option>
              </select>
            ) : (
              <div className="vl-desc-free">
                <input value={l.description} onChange={(e) => setLinea(l.uid, { item_id: null, description: e.target.value })} placeholder="ej. iPhone 13 128GB" />
                {productos.length > 0 && (
                  <button type="button" className="btn btn-ghost btn-sm" title="Elegir del inventario"
                    onClick={() => {
                      setCustomDesc((m) => ({ ...m, [l.uid]: false }));
                      // Si el texto ya es un producto, el dropdown lo muestra elegido: ligarlo.
                      const p = productos.find((x) => x.name === l.description);
                      setLinea(l.uid, { item_id: p ? p.id : null });
                    }}>▾</button>
                )}
              </div>
            )}
          </label>
          <label className="field vl-qty"><span>Cant.</span>
            <input type="number" min="1" max="999" value={l.qty} onChange={(e) => setLinea(l.uid, { qty: e.target.value })} /></label>
          <label className="field vl-precio"><span>Precio</span>
            <input type="number" min="0" step="0.01" value={l.price} onChange={(e) => setLinea(l.uid, { price: e.target.value })} placeholder="0.00" /></label>
          <button type="button" className="btn btn-ghost btn-sm vl-x" onClick={() => quitar(l.uid)}
            disabled={form.items.length === 1} title="Quitar línea">✕</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm"
        onClick={() => setForm((f) => ({ ...f, items: [...f.items, nuevaLinea()] }))}>+ Agregar línea</button>

      <div className="inv-sec">Garantía y notas</div>
      <label className="field"><span>Garantía</span>
        <input value={form.warranty_text} onChange={(e) => set({ warranty_text: e.target.value })} placeholder="ej. 30-Day Limited Warranty" /></label>
      <label className="field"><span>Términos (opcional)</span>
        <textarea rows={2} value={form.terms_text} onChange={(e) => set({ terms_text: e.target.value })} /></label>
      <label className="field"><span>Notas (opcional)</span>
        <textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></label>

      <div className="inv-total-row">
        <div className="muted">Subtotal {usd.format(subtotal)} · Impuesto {usd.format(taxTotal)}</div>
        <strong style={{ fontSize: 20 }}>Total: {usd.format(total)}</strong>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button className="btn btn-ghost" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => onSave({ subtotal, tax_total: taxTotal, total })} disabled={saving}>
          {saving ? <span className="spinner" /> : (isNew ? 'Guardar factura' : 'Guardar cambios')}
        </button>
      </div>
    </>
  );
}

/* ---------- Página ---------- */
export default function Invoices() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState('list'); // list | form | view
  const [form, setForm] = useState(null);
  const [editId, setEditId] = useState(null);
  const [viewInv, setViewInv] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const [productos, setProductos] = useState([]);

  const load = () => api('/invoices').then((d) => setInvoices(d.invoices || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Productos del inventario para el dropdown de Descripción en el formulario.
  useEffect(() => {
    if (mode !== 'form') return;
    api('/inventory').then((d) => setProductos(d.items || [])).catch(() => setProductos([]));
  }, [mode]);

  // Prellenar desde Ventas: /facturas?venta=N o ?reparacion=N.
  // /facturas?ver=N abre directo la factura N (Ventas → "Ver factura").
  useEffect(() => {
    const ventaId = searchParams.get('venta');
    const repId = searchParams.get('reparacion');
    const verId = searchParams.get('ver');
    if (!ventaId && !repId && !verId) return;
    setPreloading(true);
    (async () => {
      if (verId) {
        try {
          const d = await api('/invoices/' + encodeURIComponent(verId));
          abrirVista(d.invoice);
        } catch (e) { setErr(e.message); }
        setPreloading(false);
        setSearchParams({}, { replace: true });
        return;
      }
      try {
        const f = vacio();
        if (ventaId) {
          const d = await api('/sales');
          const s = (d.sales || []).find((x) => String(x.id) === String(ventaId));
          if (s) {
            const cp = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', hour12: false,
            }).formatToParts(new Date(s.created_at)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
            f.sale_id = s.id;
            f.sale_date = `${cp.year}-${cp.month}-${cp.day}`;
            f.sale_time = `${String(cp.hour % 24).padStart(2, '0')}:${cp.minute}`;
            f.payment_method = s.payment_method || 'efectivo';
            f.items = (s.items || []).length
              ? s.items.map((i) => ({ uid: SEQ++, description: i.name, qty: i.qty, price: String(i.price) }))
              : f.items;
          }
        } else {
          const d = await api(`/repairs/${repId}`);
          const t = d.ticket;
          if (t) {
            f.repair_id = t.id;
            f.buyer_name = t.customer_name || '';
            f.buyer_phone = t.customer_phone || '';
            f.items = [{
              uid: SEQ++,
              description: [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'Reparación',
              qty: 1,
              price: t.final_price != null ? String(t.final_price) : '',
            }];
          }
        }
        setForm(f);
        setEditId(null);
        setMode('form');
      } catch (e) { setErr(e.message); }
      setPreloading(false);
      // Limpia los parámetros para no re-prellenar al volver.
      setSearchParams({}, { replace: true });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Menú "+ Nuevo → Factura": /facturas?nueva=1 abre el formulario vacío
  // (también si ya se estaba en Facturas).
  useEffect(() => {
    if (!searchParams.get('nueva')) return;
    setForm(vacio()); setEditId(null); setErr(''); setMode('form');
    setSearchParams({}, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemsFormToRows = (items) => items
    .map((l) => ({
      ...(l.item_id ? { item_id: l.item_id } : {}),
      description: String(l.description || '').trim(), qty: Number(l.qty) || 1, price: l.price === '' ? 0 : Number(l.price),
    }))
    .filter((l) => l.description);

  const guardar = async (totales) => {
    setErr('');
    const items = itemsFormToRows(form.items);
    if (!items.length) { setErr('Agrega al menos un artículo con descripción.'); return; }
    setSaving(true);
    try {
      // Recuerda los datos del vendedor para la próxima factura.
      localStorage.setItem(SELLER_KEY, JSON.stringify({
        seller_name: form.seller_name, seller_address: form.seller_address,
        seller_phone: form.seller_phone, seller_email: form.seller_email,
      }));
      const body = {
        sale_id: form.sale_id, repair_id: form.repair_id,
        // Solo cuenta en facturas libres (el server lo ignora si hay venta/reparación/orden).
        register_sale: !!form.register_sale,
        seller_name: form.seller_name, seller_address: form.seller_address,
        seller_phone: form.seller_phone, seller_email: form.seller_email,
        buyer_name: form.buyer_name, buyer_address: form.buyer_address,
        buyer_phone: form.buyer_phone, buyer_email: form.buyer_email,
        sale_date: form.sale_date, sale_time: form.sale_time,
        payment_method: form.payment_method, tax_rate: Number(form.tax_rate) || 0,
        ...totales, items,
        warranty_text: form.warranty_text, terms_text: form.terms_text, notes: form.notes,
      };
      const d = editId
        ? await api('/invoices/' + editId, { method: 'PATCH', body })
        : await api('/invoices', { method: 'POST', body });
      setTick((t) => t + 1);
      abrirVista(d.invoice);
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  const editar = (inv) => {
    setEditId(inv.id);
    setForm({
      ...vacio(),
      sale_id: inv.sale_id, repair_id: inv.repair_id, order_id: inv.order_id,
      // Al editar, registrar la venta es opcional (sin marcar): la factura
      // libre pudo hacerse de algo que ya cuenta en Ventas por otro lado.
      register_sale: false, sale_generated: !!inv.sale_generated,
      seller_name: inv.seller_name || '', seller_address: inv.seller_address || '',
      seller_phone: inv.seller_phone || '', seller_email: inv.seller_email || '',
      buyer_name: inv.buyer_name || '', buyer_address: inv.buyer_address || '',
      buyer_phone: inv.buyer_phone || '', buyer_email: inv.buyer_email || '',
      sale_date: inv.sale_date ? String(inv.sale_date).slice(0, 10) : vacio().sale_date,
      sale_time: inv.sale_time ? String(inv.sale_time).slice(0, 5) : vacio().sale_time,
      payment_method: inv.payment_method || 'efectivo',
      tax_rate: String(inv.tax_rate ?? 0),
      items: (inv.items || []).length
        ? inv.items.map((i) => ({ uid: SEQ++, item_id: i.item_id ?? null, description: i.description, qty: i.qty, price: String(i.price) }))
        : [nuevaLinea()],
      warranty_text: inv.warranty_text || '', terms_text: inv.terms_text || '', notes: inv.notes || '',
    });
    setMode('form');
  };

  const eliminar = async (inv) => {
    const conVenta = inv.sale_generated && inv.sale_id
      ? `\n\nTambién se anula la Venta #${inv.sale_id} que generó (se repone el stock de sus productos).`
      : '';
    if (!window.confirm(`¿Eliminar la factura ${inv.invoice_number || '#' + inv.id}?${conVenta}`)) return;
    setBusy(true); setErr('');
    try {
      await api('/invoices/' + inv.id, { method: 'DELETE' });
      setTick((t) => t + 1);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const abrirVista = (inv) => {
    const items = (inv.items || []).map((i) => ({ ...i, uid: SEQ++ }));
    setViewInv({ ...inv, items });
    setMode('view');
    setSaving(false);
  };

  // window.print() de la página se atascaba en Chrome ("Loading preview…"),
  // así que todo pasa por el PDF del server: ver helpers abajo.

  // PDF del documento generado en el server (mismo diseño). Abrir el PDF en
  // una pestaña nueva y ahí imprimir es más confiable que window.print() de
  // la página (el diálogo de Chrome se quedaba en "Loading preview…").
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const fetchPdfBlob = async (url, options) => {
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${sessionStorage.getItem('est_office_token') || ''}`, ...(options && options.headers) },
    });
    if (!res.ok) throw new Error('No se pudo generar el PDF.');
    return res.blob();
  };
  const abrirBlob = (blob) => {
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  // Vista de factura guardada: abre su PDF (para imprimir/guardar desde el visor).
  const abrirPdf = async () => {
    if (!viewInv) return;
    setDownloadingPdf(true);
    try {
      abrirBlob(await fetchPdfBlob(`/x/s/invoices/${viewInv.id}/pdf`));
    } catch (e) { setErr(e.message); }
    setDownloadingPdf(false);
  };
  // Editor (factura nueva sin guardar): PDF del contenido actual del form.
  const abrirPdfBorrador = async () => {
    if (!form) return;
    setDownloadingPdf(true);
    try {
      abrirBlob(await fetchPdfBlob('/x/s/invoices/preview-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }));
    } catch (e) { setErr(e.message); }
    setDownloadingPdf(false);
  };
  const descargarPdf = async () => {
    if (!viewInv) return;
    setDownloadingPdf(true);
    try {
      const blob = await fetchPdfBlob(`/x/s/invoices/${viewInv.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${viewInv.invoice_number || viewInv.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setErr(e.message); }
    setDownloadingPdf(false);
  };

  const compartir = async () => {
    const inv = viewInv;
    const texto = `Factura ${inv.invoice_number || '#' + inv.id} — ${inv.seller_name || 'ElectronicST, LLC'} — Total ${usd.format(Number(inv.total) || 0)}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Factura', text: texto }); } catch (_) { /* cancelado */ }
    } else {
      // Sin Web Share: el camino al PDF es el diálogo de impresión.
      window.print();
    }
  };

  const origen = (inv) => {
    if (inv.sale_id) return `Venta #${inv.sale_id}`;
    if (inv.repair_id) return `Reparación #${inv.repair_id}`;
    // Las facturas automáticas de órdenes salían como "Libre".
    if (inv.order_id) return `Orden #${inv.order_id}`;
    return 'Libre (sin venta)';
  };

  /* ---------- Lista (diseño nuevo, 2026-11-26) ----------
     Buscador + pestañas por origen; una tarjeta por factura con PDF y, SOLO
     donde existe la vía en el server, Correo (órdenes y reparaciones) y
     WhatsApp (reparaciones: link público del PDF). Tocar la fila abre el
     documento; Editar/Eliminar van en el ⋯ de cada fila. */
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [ok, setOk] = useState('');
  const [filaBusy, setFilaBusy] = useState(null); // id de la factura con una acción en curso
  // Tickets de reparación: correo/teléfono del cliente y la factura que usan
  // los endpoints de la reparación (send-invoice / invoice-link).
  const [tickets, setTickets] = useState([]);
  useEffect(() => { api('/repairs').then((d) => setTickets(d.tickets || [])).catch(() => setTickets([])); }, []);

  // Mismo orden que origen(): venta → reparación → orden → libre.
  const tipoDe = (inv) => (inv.sale_id ? 'ventas' : inv.repair_id ? 'reparaciones' : inv.order_id ? 'ordenes' : 'libres');

  // Factura más reciente (id mayor) de cada reparación / orden: es la que
  // mandan los endpoints del server cuando no hay otra vinculada a mano.
  const ultimas = useMemo(() => {
    const rep = {}; const ord = {};
    for (const i of invoices || []) {
      if (i.repair_id && (!rep[i.repair_id] || i.id > rep[i.repair_id])) rep[i.repair_id] = i.id;
      if (i.order_id && (!ord[i.order_id] || i.id > ord[i.order_id])) ord[i.order_id] = i.id;
    }
    return { rep, ord };
  }, [invoices]);
  const ticketPorId = useMemo(() => Object.fromEntries(tickets.map((t) => [t.id, t])), [tickets]);

  // Vías reales de envío de ESTA factura (si no hay, no se pone el botón).
  const viasDe = (inv) => {
    const tipo = tipoDe(inv);
    if (tipo === 'ordenes') {
      // POST /orders/:id/send-invoice manda la última factura de la orden al
      // correo de la orden (buyer_email se copia de ahí al crear la factura).
      return { correo: !!inv.buyer_email && ultimas.ord[inv.order_id] === inv.id, whatsapp: false };
    }
    if (tipo === 'reparaciones') {
      const t = ticketPorId[inv.repair_id];
      if (!t) return { correo: false, whatsapp: false };
      // El correo manda la factura vinculada al ticket (o la última); el link
      // público de WhatsApp siempre sirve la última de la reparación.
      const ligada = t.invoice_id ? t.invoice_id === inv.id : ultimas.rep[inv.repair_id] === inv.id;
      return {
        correo: ligada && !!t.customer_email,
        whatsapp: ligada && ultimas.rep[inv.repair_id] === inv.id && !!t.customer_phone,
        ticket: t,
      };
    }
    return { correo: false, whatsapp: false };
  };

  // PDF de una fila: descarga con el mismo fetch autenticado del documento.
  const pdfFila = async (inv) => {
    setErr(''); setOk(''); setFilaBusy(inv.id);
    try {
      const blob = await fetchPdfBlob(`/x/s/invoices/${inv.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Receipt-${inv.invoice_number || inv.id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setErr(e.message); }
    setFilaBusy(null);
  };
  const correoFila = async (inv) => {
    setErr(''); setOk(''); setFilaBusy(inv.id);
    try {
      const esOrden = tipoDe(inv) === 'ordenes';
      const d = esOrden
        ? await api('/orders/' + inv.order_id + '/send-invoice', { method: 'POST' })
        : await api('/repairs/' + inv.repair_id + '/send-invoice', { method: 'POST' });
      const dest = esOrden ? inv.buyer_email : ticketPorId[inv.repair_id]?.customer_email;
      setOk(`Factura ${d.invoice_number || inv.invoice_number} enviada${dest ? ' a ' + dest : ''}.`);
    } catch (e) { setErr(e.message); }
    setFilaBusy(null);
  };
  // Igual que "Factura por WhatsApp" de Reparaciones: wa.me con el link
  // público del PDF (/api/track/:token/invoice.pdf) ya escrito.
  const whatsappFila = async (inv) => {
    const t = ticketPorId[inv.repair_id];
    if (!t) return;
    setErr(''); setOk(''); setFilaBusy(inv.id);
    try {
      const d = await api('/repairs/' + t.id + '/invoice-link', { method: 'POST' });
      const device = [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'equipo';
      const link = window.location.origin + d.path;
      const msg = `Hola${t.customer_name ? ' ' + t.customer_name : ''}, ${saludo()}. Aquí tienes tu factura ${d.invoice_number} de ElectronicST por la reparación de tu ${device} (PDF): ${link}`;
      window.open('https://wa.me/' + phoneIntl(t.customer_phone) + '?text=' + encodeURIComponent(msg), '_blank');
      setOk('Se abrió WhatsApp con el link de la factura listo para enviar.');
    } catch (e) { setErr(e.message); }
    setFilaBusy(null);
  };

  // Tocar la fila abre el documento (limpia el aviso de la acción anterior).
  const verFila = (inv) => { setOk(''); abrirVista(inv); };

  const origenCorto = (inv) => {
    if (inv.sale_id) return `Venta #${inv.sale_id}`;
    if (inv.repair_id) {
      const eq = [inv.device_brand, inv.device_model].filter(Boolean).join(' ');
      return eq ? `Reparación ${eq}` : `Reparación #${inv.repair_id}`;
    }
    if (inv.order_id) return `Orden #${inv.order_id}`;
    return 'Libre';
  };

  // Búsqueda por número o cliente (nombre, correo o teléfono).
  const buscadas = useMemo(() => {
    const list = invoices || [];
    const t = q.trim().toLowerCase();
    if (!t) return list;
    const dig = t.replace(/\D/g, '');
    return list.filter((i) => [i.invoice_number, i.id && '#' + i.id, i.buyer_name, i.buyer_email]
      .some((v) => v && String(v).toLowerCase().includes(t))
      || (dig.length >= 3 && String(i.buyer_phone || '').replace(/\D/g, '').includes(dig)));
  }, [invoices, q]);
  const conteo = useMemo(() => {
    const c = { todas: buscadas.length, ventas: 0, reparaciones: 0, ordenes: 0, libres: 0 };
    for (const i of buscadas) c[tipoDe(i)] += 1;
    return c;
  }, [buscadas]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibles = filtro === 'todas' ? buscadas : buscadas.filter((i) => tipoDe(i) === filtro);

  // Frase de cómo va: facturas del mes en curso (hora de Chicago).
  const resumenMes = useMemo(() => {
    if (!invoices) return '';
    const mes = hoyKey().slice(0, 7);
    const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const delMes = invoices.filter((i) => (diaKey(i.created_at) || '').slice(0, 7) === mes);
    const total = delMes.reduce((a, i) => a + (Number(i.total) || 0), 0);
    const nombre = MESES_L[Number(mes.slice(5, 7)) - 1];
    return delMes.length
      ? `${nombre}: ${delMes.length} factura${delMes.length === 1 ? '' : 's'} · ${usd.format(total)} facturado`
      : `${nombre}: sin facturas todavía`;
  }, [invoices]);

  if (preloading) return <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner spinner-lg" /></div>;

  if (mode === 'view' && viewInv) {
    return (
      <div className="invoice-page">
        <div className="section-head invoice-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={() => setMode('list')}>← Volver</button>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => editar(viewInv)}>Editar</button>
          <button className="btn btn-secondary btn-sm" onClick={descargarPdf} disabled={downloadingPdf}>
            {downloadingPdf ? <span className="spinner" /> : 'Descargar PDF'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={compartir}>Compartir</button>
          <button className="btn btn-primary btn-sm" onClick={abrirPdf} disabled={downloadingPdf}>
            {downloadingPdf ? <span className="spinner" /> : 'Imprimir / PDF'}
          </button>
        </div>
        <InvoiceDoc inv={viewInv} items={viewInv.items} />
      </div>
    );
  }

  if (mode === 'form' && form) {
    // Editor con vista previa en vivo: el documento de la derecha se va
    // llenando solo mientras se escribe (InvoiceDoc tolera campos vacíos).
    // "Imprimir / PDF" abre el PDF generado en el server con el contenido
    // actual del form (window.print() de la página se atascaba en Chrome).
    return (
      <div className="invoice-page">
        <div className="section-head invoice-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={() => { setMode('list'); setEditId(null); setErr(''); }}>← Volver</button>
          <strong style={{ fontSize: 15 }}>{editId ? `Editar factura ${invoices?.find((i) => i.id === editId)?.invoice_number || ''}` : 'Nueva factura'}</strong>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={abrirPdfBorrador} disabled={downloadingPdf}>
            {downloadingPdf ? <span className="spinner" /> : 'Imprimir / PDF'}
          </button>
        </div>
        <div className="inv-editor">
          <div className="card inv-editor-form">
            <InvoiceForm form={form} setForm={setForm} onSave={guardar} saving={saving} err={err}
              isNew={!editId} productos={productos} onCancel={() => { setMode('list'); setEditId(null); setErr(''); }} />
          </div>
          <div className="inv-editor-preview">
            <InvoiceDoc inv={form} items={form.items} />
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { v: 'todas', l: 'Todas', n: conteo.todas },
    { v: 'ventas', l: 'Ventas', n: conteo.ventas },
    { v: 'reparaciones', l: 'Reparaciones', n: conteo.reparaciones },
    { v: 'ordenes', l: 'Órdenes', n: conteo.ordenes },
    { v: 'libres', l: 'Libres', n: conteo.libres },
  ];

  return (
    <div className="invoice-page fac2">
      <PageHead title="Facturas" sub={resumenMes} search={q} onSearch={setQ} searchPlaceholder="Buscar número o cliente…">
        <button className="btn btn-primary" onClick={() => { setForm(vacio()); setEditId(null); setErr(''); setOk(''); setMode('form'); }}>
          + Nueva factura
        </button>
      </PageHead>
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      {invoices == null ? <span className="spinner spinner-lg" />
        : invoices.length === 0 ? <div className="empty-state">Aún no hay facturas. Crea una desde aquí o desde una venta en la página de Ventas.</div>
          : (
            <>
              <Tabs tabs={tabs} value={filtro} onChange={setFiltro} />
              {visibles.length === 0 ? (
                <div className="empty-state">{q ? 'Ninguna factura coincide con la búsqueda.' : 'No hay facturas de este tipo.'}</div>
              ) : (
                <div className="lcards">
                  {visibles.map((inv) => {
                    const vias = viasDe(inv);
                    const ocupada = filaBusy === inv.id;
                    return (
                      <div key={inv.id} className="lcard click fac2-row" role="button" tabIndex={0}
                        title="Ver la factura" onClick={() => verFila(inv)}
                        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); verFila(inv); } }}>
                        <span className="fac2-num">{inv.invoice_number || `#${inv.id}`}</span>
                        <div className="lcard-main">
                          <div className="lcard-title">{inv.buyer_name || 'Sin nombre'}</div>
                          <div className="lcard-sub" title={origen(inv)}>{origenCorto(inv)} · {fechaCorta(inv.created_at)}</div>
                        </div>
                        <span className="lcard-num fac2-total">{usd.format(Number(inv.total) || 0)}</span>
                        {/* Acciones de la fila: no abren el documento. */}
                        <div className="fac2-acts" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          {ocupada && <span className="spinner" />}
                          <button type="button" className="fac2-mini" disabled={ocupada}
                            title="Descargar el PDF" onClick={() => pdfFila(inv)}>PDF</button>
                          {vias.correo && (
                            <button type="button" className="fac2-mini" disabled={ocupada}
                              title={`Enviar el PDF por correo a ${inv.order_id && !inv.repair_id && !inv.sale_id ? inv.buyer_email : vias.ticket?.customer_email}`}
                              onClick={() => correoFila(inv)}>Correo</button>
                          )}
                          {vias.whatsapp && (
                            <button type="button" className="fac2-mini" disabled={ocupada}
                              title="Mandar el link del PDF por WhatsApp" onClick={() => whatsappFila(inv)}>WhatsApp</button>
                          )}
                          <MoreMenu title="Más opciones de la factura" items={[
                            { label: 'Ver factura', onClick: () => verFila(inv) },
                            { label: 'Editar', onClick: () => editar(inv) },
                            { label: 'Eliminar', danger: true, disabled: busy, onClick: () => eliminar(inv) },
                          ]} />
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
