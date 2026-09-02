import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

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

function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month}/${p.year}`;
}

let SEQ = 1;
const nuevaLinea = () => ({ uid: SEQ++, description: '', qty: 1, price: '' });

function vacio() {
  const t = chicagoNow();
  let seller = SELLER_DEFAULT;
  try { seller = { ...SELLER_DEFAULT, ...JSON.parse(localStorage.getItem(SELLER_KEY) || '{}') }; } catch (_) { /* nada */ }
  return {
    ...seller,
    sale_id: null, repair_id: null,
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
function InvoiceDoc({ inv, items }) {
  const subtotal = items.reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
  const rate = Number(inv.tax_rate) || 0;
  const taxTotal = Math.round(subtotal * rate) / 100;
  const total = Math.round((subtotal + taxTotal) * 100) / 100;
  const pago = PAGOS.find(([v]) => v === inv.payment_method)?.[1] || inv.payment_method || '—';
  return (
    <div className="invoice-doc">
      <div className="idoc-head">
        <img className="idoc-logo" src="/x/static/img/logo-cruise.png" alt="ElectronicST" />
        <div className="idoc-brand">
          <div className="idoc-brand-name">{inv.seller_name || 'ElectronicST, LLC'}</div>
          <div className="idoc-brand-sub">SALES &amp; REPAIR SERVICE</div>
        </div>
        <div className="idoc-title">
          <div className="idoc-title-main">BILL OF SALE</div>
          {inv.invoice_number && <div className="idoc-title-num">{inv.invoice_number}</div>}
        </div>
      </div>

      <div className="idoc-cols">
        <div className="idoc-box">
          <div className="idoc-box-title">Seller Information</div>
          <div className="idoc-line"><span>{inv.seller_name || 'ElectronicST, LLC'}</span></div>
          {inv.seller_address && <div className="idoc-line"><span>{inv.seller_address}</span></div>}
          {inv.seller_phone && <div className="idoc-line"><span>Tel: {inv.seller_phone}</span></div>}
          {inv.seller_email && <div className="idoc-line"><span>{inv.seller_email}</span></div>}
        </div>
        <div className="idoc-box">
          <div className="idoc-box-title">Buyer Information</div>
          <div className="idoc-line"><span>{inv.buyer_name || '—'}</span></div>
          {inv.buyer_address && <div className="idoc-line"><span>{inv.buyer_address}</span></div>}
          {inv.buyer_phone && <div className="idoc-line"><span>Tel: {inv.buyer_phone}</span></div>}
          {inv.buyer_email && <div className="idoc-line"><span>{inv.buyer_email}</span></div>}
        </div>
      </div>

      <div className="idoc-box">
        <div className="idoc-box-title">Sale Information</div>
        <div className="idoc-grid">
          <div className="idoc-line"><b>Date:</b> <span>{inv.sale_date ? inv.sale_date.split('-').reverse().join('/') : '—'}</span></div>
          <div className="idoc-line"><b>Time:</b> <span>{inv.sale_time || '—'}</span></div>
          <div className="idoc-line"><b>Payment Method:</b> <span>{pago}</span></div>
          <div className="idoc-line"><b>Tax Rate:</b> <span>{rate}%</span></div>
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
                <td>{it.description || '—'}</td>
                <td className="c">{it.qty}</td>
                <td className="r">{usd.format(Number(it.price) || 0)}</td>
                <td className="r">{usd.format((Number(it.qty) || 0) * (Number(it.price) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="idoc-totals">
          <div className="idoc-trow"><span>Subtotal</span><span>{usd.format(subtotal)}</span></div>
          <div className="idoc-trow"><span>Tax ({rate}%)</span><span>{usd.format(taxTotal)}</span></div>
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

      <div className="idoc-signs">
        <div className="idoc-sign"><div className="idoc-sign-line" /><span>Firma del vendedor</span></div>
        <div className="idoc-sign"><div className="idoc-sign-line" /><span>Firma del comprador</span></div>
      </div>
      <div className="idoc-foot">Gracias por su compra — ElectronicST, LLC</div>
    </div>
  );
}

/* ---------- Formulario ---------- */
function InvoiceForm({ form, setForm, onSave, onCancel, saving, err, isNew }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setLinea = (uid, patch) => setForm((f) => ({ ...f, items: f.items.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) }));
  const quitar = (uid) => setForm((f) => (f.items.length > 1 ? { ...f, items: f.items.filter((l) => l.uid !== uid) } : f));

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

      <div className="inv-sec">Artículos</div>
      {form.items.map((l) => (
        <div key={l.uid} className="venta-linea">
          <label className="field vl-prod"><span>Descripción</span>
            <input value={l.description} onChange={(e) => setLinea(l.uid, { description: e.target.value })} placeholder="ej. iPhone 13 128GB" /></label>
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

  const load = () => api('/invoices').then((d) => setInvoices(d.invoices || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prellenar desde Ventas: /facturas?venta=N o ?reparacion=N.
  useEffect(() => {
    const ventaId = searchParams.get('venta');
    const repId = searchParams.get('reparacion');
    if (!ventaId && !repId) return;
    setPreloading(true);
    (async () => {
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

  const itemsFormToRows = (items) => items
    .map((l) => ({ description: String(l.description || '').trim(), qty: Number(l.qty) || 1, price: l.price === '' ? 0 : Number(l.price) }))
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
      sale_id: inv.sale_id, repair_id: inv.repair_id,
      seller_name: inv.seller_name || '', seller_address: inv.seller_address || '',
      seller_phone: inv.seller_phone || '', seller_email: inv.seller_email || '',
      buyer_name: inv.buyer_name || '', buyer_address: inv.buyer_address || '',
      buyer_phone: inv.buyer_phone || '', buyer_email: inv.buyer_email || '',
      sale_date: inv.sale_date ? String(inv.sale_date).slice(0, 10) : vacio().sale_date,
      sale_time: inv.sale_time ? String(inv.sale_time).slice(0, 5) : vacio().sale_time,
      payment_method: inv.payment_method || 'efectivo',
      tax_rate: String(inv.tax_rate ?? 0),
      items: (inv.items || []).length
        ? inv.items.map((i) => ({ uid: SEQ++, description: i.description, qty: i.qty, price: String(i.price) }))
        : [nuevaLinea()],
      warranty_text: inv.warranty_text || '', terms_text: inv.terms_text || '', notes: inv.notes || '',
    });
    setMode('form');
  };

  const eliminar = async (inv) => {
    if (!window.confirm(`¿Eliminar la factura ${inv.invoice_number || '#' + inv.id}?`)) return;
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

  const imprimir = () => window.print();

  // Descarga el PDF del documento (generado en el server, mismo diseño).
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const descargarPdf = async () => {
    if (!viewInv) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`/x/s/invoices/${viewInv.id}/pdf`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('est_office_token') || ''}` },
      });
      if (!res.ok) throw new Error('No se pudo generar el PDF.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Factura-${viewInv.invoice_number || viewInv.id}.pdf`;
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
    return 'Libre';
  };

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
          <button className="btn btn-primary btn-sm" onClick={imprimir}>Imprimir / PDF</button>
        </div>
        <InvoiceDoc inv={viewInv} items={viewInv.items} />
      </div>
    );
  }

  if (mode === 'form' && form) {
    // Editor con vista previa en vivo: el documento de la derecha se va
    // llenando solo mientras se escribe (InvoiceDoc tolera campos vacíos).
    // El botón Imprimir imprime la preview (el formulario se oculta en print).
    return (
      <div className="invoice-page">
        <div className="section-head invoice-toolbar">
          <button className="btn btn-secondary btn-sm" onClick={() => { setMode('list'); setEditId(null); setErr(''); }}>← Volver</button>
          <strong style={{ fontSize: 15 }}>{editId ? `Editar factura ${invoices?.find((i) => i.id === editId)?.invoice_number || ''}` : 'Nueva factura'}</strong>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={imprimir}>Imprimir / PDF</button>
        </div>
        <div className="inv-editor">
          <div className="card inv-editor-form">
            <InvoiceForm form={form} setForm={setForm} onSave={guardar} saving={saving} err={err}
              isNew={!editId} onCancel={() => { setMode('list'); setEditId(null); setErr(''); }} />
          </div>
          <div className="inv-editor-preview">
            <InvoiceDoc inv={form} items={form.items} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="invoice-page">
      {err && <div className="alert alert-error">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { setForm(vacio()); setEditId(null); setErr(''); setMode('form'); }}>
          + Nueva factura
        </button>
      </div>

      <div className="card">
        <h3>Facturas emitidas</h3>
        {invoices == null ? <span className="spinner" />
          : invoices.length === 0 ? <div className="empty">Aún no hay facturas. Crea una desde aquí o desde una venta en la página de Ventas.</div>
            : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Número</th><th>Cliente</th><th className="hide-sm">Origen</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td><strong>{inv.invoice_number || `#${inv.id}`}</strong></td>
                        <td>{inv.buyer_name || '—'}</td>
                        <td className="muted hide-sm">{origen(inv)}</td>
                        <td className="muted">{fmtFecha(inv.created_at)}</td>
                        <td style={{ textAlign: 'right' }}><strong>{usd.format(Number(inv.total) || 0)}</strong></td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => abrirVista(inv)}>Ver</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => editar(inv)}>Editar</button>
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => eliminar(inv)}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </div>
  );
}
