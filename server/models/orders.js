/* Órdenes online (compras web pagadas por Stripe Checkout) y manuales de
   FB Marketplace. Las web se crean desde el webhook/sync de checkout; las
   manuales desde el panel. No se anulan ni editan aquí: los reembolsos se
   hacen en Stripe / trato directo en FB. */
const crypto = require('crypto');
const { pool } = require('../db');
const invoices = require('./invoices');
const { getItem } = require('../catalog');
const trackEvents = require('../lib/trackEvents');

// Toda orden nueva (web o FB) genera su factura automáticamente con los
// datos del cliente ya llenos, lista para adjuntar en el correo de
// confirmación. Un fallo de facturación NUNCA debe impedir registrar la orden.
async function autoInvoice(order) {
  if (!order) return;
  try {
    await invoices.createFromOrder(order);
  } catch (e) {
    console.error('auto invoice error:', e.message);
  }
}

// Link secreto de seguimiento del cliente (página pública track.html).
function newTrackToken() {
  return crypto.randomBytes(24).toString('hex'); // 48 hex chars, no adivinable
}

// order: { sessionId, customerName, email, phone, address, items, total, currency, createdAt?, costo? }
// ON CONFLICT DO NOTHING: Stripe entrega los webhooks "al menos una vez"; si el
// evento se repite (o el server se reinicia y pierde el dedupe en memoria), la
// orden no se duplica. Devuelve la fila insertada o null si ya existía.
async function createFromStripe(order) {
  const r = await pool.query(
    `INSERT INTO online_orders (stripe_session_id, customer_name, email, phone, address, items, total, currency, created_at, track_token, costo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamp, NOW()), $10, $11)
     ON CONFLICT (stripe_session_id) DO NOTHING
     RETURNING *`,
    [
      order.sessionId,
      order.customerName || null,
      order.email || null,
      order.phone || null,
      order.address || null,
      JSON.stringify(order.items || []),
      order.total || 0,
      order.currency || 'usd',
      order.createdAt || null, // backfill: fecha real del pago (epoch de Stripe)
      newTrackToken(),
      Number(order.costo) || 0,
    ]
  );
  await autoInvoice(r.rows[0]);
  return r.rows[0] || null;
}

// Venta web aplicada al inventario: por cada artículo del catálogo que tenga
// invId, descuenta el stock (FOR UPDATE, con su movimiento 'venta') y suma
// costo × cantidad. Devuelve el costo total de la orden. Corre DESPUÉS de
// insertar la orden (solo si se insertó: el dedupe no descuenta dos veces).
// Si el stock no alcanza, igual se registra la venta y el stock queda en 0.
async function applySaleToInventory(orderItems) {
  let costo = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const it of orderItems || []) {
      const prod = getItem(String(it.id || ''));
      if (!prod || !prod.invId) continue;
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      const r = await client.query('SELECT id, name, stock, cost FROM inventory_items WHERE id = $1 AND active FOR UPDATE', [prod.invId]);
      const item = r.rows[0];
      if (!item) continue;
      costo += (Number(item.cost) || 0) * qty;
      const nuevo = Math.max(0, Number(item.stock) - qty);
      await client.query('UPDATE inventory_items SET stock = $2, updated_at = NOW() WHERE id = $1', [item.id, nuevo]);
      await client.query(
        'INSERT INTO inventory_movements (item_id, delta, reason, note, user_id) VALUES ($1, $2, $3, $4, $5)',
        [item.id, -qty, 'venta', 'Venta online', null]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
  return Math.round(costo * 100) / 100;
}

// Backfill al arranque (idempotente): órdenes web viejas con costo 0. Los
// artículos guardados vienen como "Nombre (Condición)" — se emparejan con el
// catálogo y se toma el costo actual del inventario ligado (invId). NO toca
// el stock (esas unidades ya se vendieron hace tiempo); solo la contabilidad.
async function backfillCosts() {
  const r = await pool.query(
    `SELECT o.id, o.items FROM online_orders o WHERE o.origen = 'website' AND (o.costo IS NULL OR o.costo = 0)`
  );
  if (!r.rows.length) return 0;
  const inv = await pool.query('SELECT id, cost FROM inventory_items');
  const costById = new Map(inv.rows.map((i) => [i.id, Number(i.cost) || 0]));
  const { CATALOG } = require('../catalog');
  let updated = 0;
  for (const o of r.rows) {
    const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
    let costo = 0;
    for (const it of items) {
      const name = String(it.name || '');
      const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
      for (const p of Object.values(CATALOG)) {
        if (!p.invId) continue;
        if (name === p.name || name.startsWith(p.name + ' (') || name.startsWith(p.name + ' ')) {
          costo += (costById.get(p.invId) || 0) * qty;
          break;
        }
      }
    }
    if (costo > 0) {
      await pool.query('UPDATE online_orders SET costo = $2 WHERE id = $1', [o.id, Math.round(costo * 100) / 100]);
      updated += 1;
    }
  }
  return updated;
}

async function listAll() {
  const r = await pool.query('SELECT * FROM online_orders ORDER BY created_at DESC');
  return r.rows;
}

// Ids de sesión ya guardadas: la sincronización con Stripe los usa para no
// releer (ni reinsertar) órdenes que ya están en la base.
async function listSessionIds() {
  const r = await pool.query('SELECT stripe_session_id FROM online_orders');
  return r.rows.map((x) => x.stripe_session_id);
}

// Órdenes manuales (FB Marketplace): sin stripe_session_id; el total llega ya
// calculado por la ruta (server-side) y el costo lo da el dueño en el
// formulario (la mercancía de FB no siempre está en el inventario).
// Nacen como envío 'pendiente'.
async function createManual({ customer_name, email, phone, address, items, total, costo }) {
  const r = await pool.query(
    `INSERT INTO online_orders (stripe_session_id, customer_name, email, phone, address, items, total, currency, origen, track_token, costo)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, 'usd', 'fb_marketplace', $7, $8)
     RETURNING *`,
    [
      customer_name || null,
      email || null,
      phone || null,
      address || null,
      JSON.stringify(items || []),
      total || 0,
      newTrackToken(),
      Math.max(0, Number(costo) || 0),
    ]
  );
  await autoInvoice(r.rows[0]);
  return r.rows[0];
}

// Guardar el número de tracking: la orden pasa automáticamente a 'enviado'
// (sin tracking no hay envío). tracking_id es el id en AfterShip (si hay API).
// shipped_at queda en la PRIMERA vez que se carga tracking: de esa fecha
// cuentan las 24 h para que el job lo marque 'InTransit' solo.
async function updateTracking(id, { tracking_number, carrier, tracking_id }) {
  const r = await pool.query(
    `UPDATE online_orders
     SET tracking_number = $2, carrier = $3, tracking_id = COALESCE($4, tracking_id),
         shipped_at = COALESCE(shipped_at, NOW()),
         ship_status = CASE WHEN ship_status = 'pendiente' THEN 'enviado' ELSE ship_status END
     WHERE id = $1 RETURNING *`,
    [id, tracking_number || null, carrier || null, tracking_id || null]
  );
  trackEvents.emit('update', id);
  return r.rows[0] || null;
}

const SHIP_STATUSES = ['pendiente', 'enviado', 'entregado'];

// Tag fino de AfterShip (InTransit/OutForDelivery/Delivered): lo escribe el
// job de rastreo y alimenta la barra de progreso de 4 pasos.
async function updateShipTag(id, tag) {
  await pool.query('UPDATE online_orders SET ship_tag = $2 WHERE id = $1', [id, tag || null]);
}

async function updateShipStatus(id, status) {
  const r = await pool.query(
    'UPDATE online_orders SET ship_status = $2 WHERE id = $1 RETURNING *',
    [id, status]
  );
  trackEvents.emit('update', id);
  return r.rows[0] || null;
}

// Fecha estimada de entrega reportada por AfterShip ('YYYY-MM-DD').
async function updateExpectedDelivery(id, date) {
  await pool.query('UPDATE online_orders SET expected_delivery = $2 WHERE id = $1', [id, date || null]);
}

// Órdenes con tracking activo que aún no se marcan entregadas: el job de
// rastreo las consulta periódicamente. Con USPS no hay registro previo, así
// que basta el tracking_number (se usa tracking_id si existe, si no el número).
async function listInTransit() {
  const r = await pool.query(
    `SELECT * FROM online_orders
     WHERE tracking_number IS NOT NULL AND ship_status <> 'entregado'`
  );
  return r.rows;
}

// Página pública de seguimiento: busca por el token secreto del cliente.
async function findByTrackToken(token) {
  const r = await pool.query('SELECT * FROM online_orders WHERE track_token = $1', [token]);
  return r.rows[0] || null;
}

// Búsqueda pública por número de rastreo (el cliente lo escribe en track.html
// cuando entra a "Mi pedido" sin el link del correo).
async function findByTrackingNumber(num) {
  const r = await pool.query(
    'SELECT * FROM online_orders WHERE tracking_number = $1 ORDER BY id DESC LIMIT 1',
    [String(num || '').trim()]
  );
  return r.rows[0] || null;
}

// El webhook de AfterShip identifica el paquete por su tracking id.
async function findByTrackingId(trackingId) {
  const r = await pool.query('SELECT * FROM online_orders WHERE tracking_id = $1', [String(trackingId || '')]);
  return r.rows[0] || null;
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM online_orders WHERE id = $1', [id]);
  return r.rows[0] || null;
}

// Costo calculado tras insertar la orden (applySaleToInventory corre después
// del INSERT para que un webhook duplicado no descuente stock dos veces).
async function setCosto(id, costo) {
  await pool.query('UPDATE online_orders SET costo = $2 WHERE id = $1', [id, Math.max(0, Number(costo) || 0)]);
}

// Marca un correo como enviado para no reenviarlo (whitelist estricta).
const EMAIL_FLAGS = ['email_shipped', 'email_transit', 'email_delivered'];
async function markEmailSent(id, flag) {
  if (!EMAIL_FLAGS.includes(flag)) return;
  await pool.query(`UPDATE online_orders SET ${flag} = true WHERE id = $1`, [id]);
}

module.exports = {
  createFromStripe, createManual, listAll, listSessionIds,
  updateTracking, updateShipStatus, updateShipTag, updateExpectedDelivery, listInTransit,
  findByTrackToken, findByTrackingNumber, findByTrackingId, findById, setCosto, markEmailSent, applySaleToInventory, backfillCosts, SHIP_STATUSES,
};
