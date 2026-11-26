/* Facturas (Bill of Sale). Una factura puede estar ligada a una venta de
   mostrador (sale_id), a una reparación entregada (repair_id), a una orden
   de envío (order_id) o a ninguna (factura libre). Los textos se guardan tal
   como fueron emitidos.
   Una factura hecha a mano en la página de Facturas GENERA su venta de
   mostrador (register_sale): así aparece en Ventas/Dashboard y descuenta del
   inventario los productos elegidos de la lista (item_id). Esa venta queda
   marcada con sale_generated y sigue a la factura: editar la factura la
   actualiza y eliminarla la anula (repone stock). */
const { pool, withTransaction } = require('../db');
const sales = require('./sales');

const PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

function trim(v, max = 400) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// item_id (opcional): producto del inventario elegido en el dropdown — la
// venta generada descuenta su stock y guarda su costo. qty entero 1–999
// (sale_items.qty es INTEGER).
function normalizeItems(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, 50).map((it) => ({
    description: trim(it.description, 200) || '',
    ...(it.desc ? { desc: trim(it.desc, 200) } : {}),
    ...(/^\d+$/.test(String(it.item_id ?? '')) ? { item_id: Number(it.item_id) } : {}),
    qty: Math.min(999, Math.max(1, Math.round(Number(it.qty) || 1))),
    price: num(it.price) || 0,
  })).filter((it) => it.description || it.qty !== 1 || it.price !== 0);
}

function normalizeFields(body) {
  const b = body || {};
  const fields = {};
  const textFields = [
    'invoice_number', 'seller_name', 'seller_address', 'seller_phone', 'seller_email',
    'buyer_name', 'buyer_address', 'buyer_phone', 'buyer_email',
    'payment_method', 'warranty_text', 'terms_text', 'notes',
  ];
  for (const k of textFields) if (b[k] !== undefined) fields[k] = trim(b[k], k === 'warranty_text' || k === 'terms_text' ? 4000 : 400);
  if (b.sale_id !== undefined) fields.sale_id = /^\d+$/.test(String(b.sale_id)) ? Number(b.sale_id) : null;
  if (b.repair_id !== undefined) fields.repair_id = /^\d+$/.test(String(b.repair_id)) ? Number(b.repair_id) : null;
  if (b.order_id !== undefined) fields.order_id = /^\d+$/.test(String(b.order_id)) ? Number(b.order_id) : null;
  if (b.sale_date !== undefined) fields.sale_date = trim(b.sale_date, 10) || null;
  if (b.sale_time !== undefined) fields.sale_time = trim(b.sale_time, 8) || null;
  if (b.payment_method !== undefined && fields.payment_method && !PAYMENT_METHODS.includes(fields.payment_method)) fields.payment_method = null;
  if (b.tax_rate !== undefined) fields.tax_rate = num(b.tax_rate) || 0;
  if (b.subtotal !== undefined) fields.subtotal = num(b.subtotal) || 0;
  if (b.tax_total !== undefined) fields.tax_total = num(b.tax_total) || 0;
  if (b.shipping_total !== undefined) fields.shipping_total = num(b.shipping_total) || 0;
  if (b.total !== undefined) fields.total = num(b.total) || 0;
  if (b.items !== undefined) fields.items = JSON.stringify(normalizeItems(b.items));
  return fields;
}

async function listAll() {
  const r = await pool.query(
    `SELECT i.*, u.username AS created_by_username,
            s.total AS sale_total, s.created_at AS sale_created_at,
            t.device_brand, t.device_model, t.customer_name AS repair_customer
     FROM invoices i
     LEFT JOIN users u ON u.id = i.created_by
     LEFT JOIN sales s ON s.id = i.sale_id
     LEFT JOIN repair_tickets t ON t.id = i.repair_id
     ORDER BY i.created_at DESC`
  );
  return r.rows.map((row) => ({
    ...row,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
  }));
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
  const row = r.rows[0] || null;
  if (row && typeof row.items === 'string') row.items = JSON.parse(row.items);
  return row;
}

async function create(body, userId, client) {
  const db = client || pool;
  const fields = normalizeFields(body);
  if (!fields.invoice_number) {
    const last = await db.query("SELECT invoice_number FROM invoices WHERE invoice_number ~ '^EST-[0-9]+$' ORDER BY id DESC LIMIT 1");
    const n = last.rows.length ? Number(last.rows[0].invoice_number.split('-')[1]) + 1 : 1;
    fields.invoice_number = `EST-${String(n).padStart(4, '0')}`;
  }
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const ph = cols.map((_, i) => `$${i + 1}`);
  cols.push('created_by'); vals.push(userId || null); ph.push(`$${cols.length}`);
  const r = await db.query(
    `INSERT INTO invoices (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`,
    vals
  );
  return r.rows[0];
}

async function update(id, body, client) {
  const db = client || pool;
  const fields = normalizeFields(body);
  const keys = Object.keys(fields);
  if (!keys.length) {
    const r = await db.query('SELECT * FROM invoices WHERE id = $1', [id]);
    return r.rows[0] || null;
  }
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  sets.push('updated_at = NOW()');
  const vals = Object.values(fields);
  vals.push(id);
  const r = await db.query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  return r.rows[0] || null;
}

/* ---------- Venta generada por la factura ---------- */

// La factura con su fecha/hora como TEXTO sacado en SQL ('YYYY-MM-DD',
// 'HH:MM'): así no depende de cómo el driver convierte DATE a Date (zona
// horaria del proceso). lock=true la bloquea para la transacción.
async function filaFactura(client, id, lock = false) {
  const r = await client.query(
    `SELECT *, to_char(sale_date, 'YYYY-MM-DD') AS sale_date_key, to_char(sale_time, 'HH24:MI') AS sale_time_key
     FROM invoices WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  return r.rows[0] || null;
}

// Venta de mostrador equivalente a la factura: una línea por artículo (con
// item_id si se eligió del inventario), más el impuesto y el envío como
// conceptos libres para que el total de la venta = total de la factura.
// Fecha/hora = las de la factura (la venta cae en su día real). inv debe
// venir de filaFactura (trae sale_date_key/sale_time_key).
function saleFromInvoice(inv) {
  const items = (typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items) || [];
  const lines = [];
  for (const it of items) {
    const qty = Math.min(999, Math.max(1, Math.round(Number(it.qty) || 1)));
    const price = Math.round((Number(it.price) || 0) * 100) / 100;
    if (it.item_id) lines.push({ item_id: Number(it.item_id), qty, price });
    else if (it.description) lines.push({ item_id: null, name: String(it.description).slice(0, 160), qty, price });
  }
  const tax = Number(inv.tax_total) || 0;
  if (tax > 0) {
    const rate = Number(inv.tax_rate) || 0;
    lines.push({ item_id: null, name: rate > 0 ? `Impuesto (${rate}%)` : 'Impuesto', qty: 1, price: tax });
  }
  const ship = Number(inv.shipping_total) || 0;
  if (ship > 0) lines.push({ item_id: null, name: 'Envío', qty: 1, price: ship });
  return {
    items: lines,
    payment_method: PAYMENT_METHODS.includes(inv.payment_method) ? inv.payment_method : null,
    note: `Factura ${inv.invoice_number || '#' + inv.id}`,
    sale_date: inv.sale_date_key || null,
    sale_time: inv.sale_time_key || null,
  };
}

// Crea la venta de la factura y la liga (sale_generated). Devuelve la fila
// actualizada de la factura.
async function attachNewSale(id, userId, client) {
  const inv = await filaFactura(client, id);
  const payload = saleFromInvoice(inv);
  if (!payload.items.length) return inv;
  const sale = await sales.create(payload, userId, { client });
  const r = await client.query(
    'UPDATE invoices SET sale_id = $1, sale_generated = TRUE, updated_at = NOW() WHERE id = $2 RETURNING *',
    [sale.id, id]
  );
  return r.rows[0];
}

const esLibre = (x) => !x.sale_id && !x.repair_id && !x.order_id;

// Factura nueva desde el panel. Con register_sale (y sin venta/reparación/
// orden ligada) crea también su venta, todo en una transacción: si la venta
// falla (p. ej. sin stock), no queda la factura a medias.
async function createWithSale(body, userId) {
  const b = body || {};
  if (b.register_sale !== true || !esLibre(normalizeFields(b))) return create(b, userId);
  return withTransaction(async (client) => {
    const inv = await create(b, userId, client);
    return attachNewSale(inv.id, userId, client);
  });
}

// Editar factura. Si su venta la generó ella, la venta se rehace con los
// datos nuevos (solo si cambió algo que la afecta: artículos, impuesto,
// fecha, hora o pago). Si era libre y llega register_sale, genera su venta.
async function updateWithSale(id, body, userId) {
  const b = body || {};
  return withTransaction(async (client) => {
    const before = await filaFactura(client, id, true);
    if (!before) return null;
    let inv = await update(id, b, client);
    if (inv.sale_generated && inv.sale_id) {
      const after = await filaFactura(client, id);
      if (JSON.stringify(saleFromInvoice(before)) !== JSON.stringify(saleFromInvoice(after))) {
        await sales.remove(inv.sale_id, userId, { client, note: `Venta #${inv.sale_id} (factura ${inv.invoice_number || '#' + id} editada)` });
        inv = await attachNewSale(id, userId, client);
      }
    } else if (b.register_sale === true && esLibre(inv)) {
      inv = await attachNewSale(id, userId, client);
    }
    return inv;
  });
}

// Eliminar factura. Si generó su venta, la anula también (repone stock).
async function remove(id, userId) {
  return withTransaction(async (client) => {
    const cur = await client.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [id]);
    const inv = cur.rows[0];
    if (!inv) return false;
    if (inv.sale_generated && inv.sale_id) {
      await sales.remove(inv.sale_id, userId, { client, note: `Venta #${inv.sale_id} (factura ${inv.invoice_number || '#' + id} eliminada)` });
    }
    await client.query('DELETE FROM invoices WHERE id = $1', [id]);
    return true;
  });
}

// Factura de una orden de envío (website/FB). Devuelve null si ya existe una
// para esa orden (no duplicar).
async function findByOrderId(orderId) {
  const r = await pool.query('SELECT * FROM invoices WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [orderId]);
  const row = r.rows[0] || null;
  if (row && typeof row.items === 'string') row.items = JSON.parse(row.items);
  return row;
}

// Factura de una reparación (la más reciente). Null si no tiene.
async function findByRepairId(repairId) {
  const r = await pool.query('SELECT * FROM invoices WHERE repair_id = $1 ORDER BY id DESC LIMIT 1', [repairId]);
  const row = r.rows[0] || null;
  if (row && typeof row.items === 'string') row.items = JSON.parse(row.items);
  return row;
}

// Crea la factura de la reparación con los datos del ticket (equipo +
// servicio como artículo, cliente del ticket, total = precio final o
// cotizado). Si el ticket tiene factura vinculada (invoice_id), usa ESA;
// si no hay, busca por repair_id; si no existe, la crea y sella el puntero
// del ticket (invoice_id) para que siempre sea la misma.
async function createFromRepair(t) {
  if (t.invoice_id) {
    const pinned = await findById(t.invoice_id);
    if (pinned) return pinned;
  }
  const existing = await findByRepairId(t.id);
  if (existing) {
    if (!t.invoice_id) {
      await pool.query('UPDATE repair_tickets SET invoice_id = $1 WHERE id = $2', [existing.id, t.id]);
    }
    return existing;
  }

  const SERVICE_ES = { revision: 'Revisión', reparacion: 'Reparación', mantenimiento: 'Mantenimiento' };
  const device = [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'Equipo';
  const service = SERVICE_ES[t.service_type] || t.service_type || 'Servicio';
  const price = t.final_price != null ? Number(t.final_price) : (Number(t.quoted_price) || 0);

  const when = t.delivered_at ? new Date(t.delivered_at) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(when).reduce((a, x) => { a[x.type] = x.value; return a; }, {});

  const inv = await create({
    repair_id: t.id,
    seller_name: 'ElectronicST, LLC',
    seller_address: '3659 Lorna Rd Suite 157, Hoover, AL 35216',
    seller_phone: '(205) 573-7840',
    seller_email: 'ventas@electronicservicetechnology.com',
    buyer_name: t.customer_name || null,
    buyer_phone: t.customer_phone || null,
    buyer_email: t.customer_email || null,
    sale_date: `${parts.year}-${parts.month}-${parts.day}`,
    sale_time: `${parts.hour}:${parts.minute}`,
    payment_method: 'otro',
    tax_rate: 0,
    subtotal: price,
    tax_total: 0,
    shipping_total: 0,
    total: price,
    items: [{ description: `${device} — ${service}`.slice(0, 200), qty: 1, price }],
    warranty_text: '30-Day Limited Warranty',
  }, null);
  await pool.query('UPDATE repair_tickets SET invoice_id = $1 WHERE id = $2', [inv.id, t.id]);
  return inv;
}

// Crea la factura de la orden con TODOS los datos del cliente ya llenos:
// solo queda darle "Enviar por correo". La dirección de la orden viene como
// "Nombre | calle | ciudad, estado, zip" — se quita el nombre para no
// repetirlo y se une con comas.
async function createFromOrder(order) {
  const existing = await findByOrderId(order.id);
  if (existing) return existing;

  let address = order.address || null;
  if (address && order.customer_name && address.startsWith(order.customer_name + ' | ')) {
    address = address.slice(order.customer_name.length + 3);
  }
  if (address) address = address.split(' | ').filter(Boolean).join(', ');

  const when = order.created_at ? new Date(order.created_at) : new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(when).reduce((a, x) => { a[x.type] = x.value; return a; }, {});

  // Las líneas de Tax/Envío que Stripe guarda como artículos se EXTRAEN a sus
  // columnas: si no, el recibo mostraría Subtotal inflado y Tax $0.00.
  // desc (opcional): descripción corta del producto del catálogo, va debajo
  // del título en el PDF del recibo.
  const items = [];
  let taxTotal = 0;
  let shippingTotal = 0;
  for (const i of order.items || []) {
    const name = String(i.name || '').trim();
    const n = name.toLowerCase();
    const price = Number(i.price) || 0;
    if (n === 'impuestos' || n === 'tax') { taxTotal += price; continue; }
    if (n === 'envío' || n === 'envio' || n === 'shipping') { shippingTotal += price; continue; }
    items.push({
      description: name.slice(0, 200),
      ...(i.desc ? { desc: String(i.desc).slice(0, 200) } : {}),
      qty: Number(i.qty) || 1,
      price,
    });
  }
  const subtotal = items.reduce((a, i) => a + i.qty * i.price, 0);
  const total = Number(order.total) || (subtotal + taxTotal + shippingTotal);

  return create({
    order_id: order.id,
    seller_name: 'ElectronicST, LLC',
    seller_address: '3659 Lorna Rd Suite 157, Hoover, AL 35216',
    seller_phone: '(205) 573-7840',
    seller_email: 'ventas@electronicservicetechnology.com',
    buyer_name: order.customer_name || null,
    buyer_address: address,
    buyer_phone: order.phone || null,
    buyer_email: order.email || null,
    sale_date: `${parts.year}-${parts.month}-${parts.day}`,
    sale_time: `${parts.hour}:${parts.minute}`,
    // Las compras web son tarjeta vía Stripe; las de FB Marketplace se cobran
    // fuera — quedan como 'otro' para no inventar el método.
    payment_method: order.origen === 'fb_marketplace' ? 'otro' : 'tarjeta',
    tax_rate: 0, // el impuesto ya viene calculado dentro del pedido
    subtotal,
    tax_total: taxTotal,
    shipping_total: shippingTotal,
    total,
    items,
    warranty_text: '30-Day Limited Warranty',
  }, null);
}

module.exports = { listAll, findById, create, update, remove, createWithSale, updateWithSale, findByOrderId, createFromOrder, findByRepairId, createFromRepair, normalizeFields };
