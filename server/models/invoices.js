/* Facturas (Bill of Sale). Una factura puede estar ligada a una venta de
   mostrador (sale_id), a una reparación entregada (repair_id) o a ninguna
   (factura libre). Los textos se guardan tal como fueron emitidos. */
const { pool } = require('../db');

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

function normalizeItems(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.slice(0, 50).map((it) => ({
    description: trim(it.description, 200) || '',
    qty: Number(it.qty) || 1,
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

async function create(body, userId) {
  const fields = normalizeFields(body);
  if (!fields.invoice_number) {
    const last = await pool.query("SELECT invoice_number FROM invoices WHERE invoice_number ~ '^EST-[0-9]+$' ORDER BY id DESC LIMIT 1");
    const n = last.rows.length ? Number(last.rows[0].invoice_number.split('-')[1]) + 1 : 1;
    fields.invoice_number = `EST-${String(n).padStart(4, '0')}`;
  }
  const cols = Object.keys(fields);
  const vals = Object.values(fields);
  const ph = cols.map((_, i) => `$${i + 1}`);
  cols.push('created_by'); vals.push(userId || null); ph.push(`$${cols.length}`);
  const r = await pool.query(
    `INSERT INTO invoices (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`,
    vals
  );
  return r.rows[0];
}

async function update(id, body) {
  const fields = normalizeFields(body);
  const keys = Object.keys(fields);
  if (!keys.length) return findById(id);
  const sets = keys.map((k, i) => `${k} = $${i + 1}`);
  sets.push('updated_at = NOW()');
  const vals = Object.values(fields);
  vals.push(id);
  const r = await pool.query(`UPDATE invoices SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`, vals);
  return r.rows[0] || null;
}

async function remove(id) {
  const r = await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
  return r.rowCount > 0;
}

// Factura de una orden de envío (website/FB). Devuelve null si ya existe una
// para esa orden (no duplicar).
async function findByOrderId(orderId) {
  const r = await pool.query('SELECT * FROM invoices WHERE order_id = $1 ORDER BY id DESC LIMIT 1', [orderId]);
  const row = r.rows[0] || null;
  if (row && typeof row.items === 'string') row.items = JSON.parse(row.items);
  return row;
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

  // desc (opcional): descripción corta del producto del catálogo, va debajo
  // del título en el PDF del recibo.
  const items = (order.items || []).map((i) => ({
    description: String(i.name || '').slice(0, 200),
    ...(i.desc ? { desc: String(i.desc).slice(0, 200) } : {}),
    qty: Number(i.qty) || 1,
    price: Number(i.price) || 0,
  }));
  const total = Number(order.total) || items.reduce((a, i) => a + i.qty * i.price, 0);

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
    tax_rate: 0, // el impuesto ya viene como línea dentro de items
    subtotal: total,
    tax_total: 0,
    total,
    items,
    warranty_text: '30-Day Limited Warranty',
  }, null);
}

module.exports = { listAll, findById, create, update, remove, findByOrderId, createFromOrder, normalizeFields };
