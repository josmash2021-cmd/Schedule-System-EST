/* Órdenes online (compras web pagadas por Stripe Checkout). Se crean desde el
   webhook de checkout; el panel solo las lista (no se anulan ni editan aquí:
   los reembolsos se hacen en Stripe). */
const { pool } = require('../db');

// order: { sessionId, customerName, email, phone, address, items, total, currency, createdAt? }
// ON CONFLICT DO NOTHING: Stripe entrega los webhooks "al menos una vez"; si el
// evento se repite (o el server se reinicia y pierde el dedupe en memoria), la
// orden no se duplica. Devuelve true si se insertó.
async function createFromStripe(order) {
  const r = await pool.query(
    `INSERT INTO online_orders (stripe_session_id, customer_name, email, phone, address, items, total, currency, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamp, NOW()))
     ON CONFLICT (stripe_session_id) DO NOTHING`,
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
    ]
  );
  return r.rowCount > 0;
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
// calculado por la ruta (server-side). Nacen como envío 'pendiente'.
async function createManual({ customer_name, email, phone, address, items, total }) {
  const r = await pool.query(
    `INSERT INTO online_orders (stripe_session_id, customer_name, email, phone, address, items, total, currency, origen)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, 'usd', 'fb_marketplace')
     RETURNING *`,
    [
      customer_name || null,
      email || null,
      phone || null,
      address || null,
      JSON.stringify(items || []),
      total || 0,
    ]
  );
  return r.rows[0];
}

// Guardar el número de tracking: la orden pasa automáticamente a 'enviado'
// (sin tracking no hay envío). tracking_id es el id en AfterShip (si hay API).
async function updateTracking(id, { tracking_number, carrier, tracking_id }) {
  const r = await pool.query(
    `UPDATE online_orders
     SET tracking_number = $2, carrier = $3, tracking_id = COALESCE($4, tracking_id),
         ship_status = CASE WHEN ship_status = 'pendiente' THEN 'enviado' ELSE ship_status END
     WHERE id = $1 RETURNING *`,
    [id, tracking_number || null, carrier || null, tracking_id || null]
  );
  return r.rows[0] || null;
}

const SHIP_STATUSES = ['pendiente', 'enviado', 'entregado'];

async function updateShipStatus(id, status) {
  const r = await pool.query(
    'UPDATE online_orders SET ship_status = $2 WHERE id = $1 RETURNING *',
    [id, status]
  );
  return r.rows[0] || null;
}

// Órdenes con tracking activo que aún no se marcan entregadas: el job de
// AfterShip las consulta periódicamente.
async function listInTransit() {
  const r = await pool.query(
    `SELECT id, tracking_id, tracking_number, carrier FROM online_orders
     WHERE tracking_id IS NOT NULL AND ship_status <> 'entregado'`
  );
  return r.rows;
}

module.exports = { createFromStripe, createManual, listAll, listSessionIds, updateTracking, updateShipStatus, listInTransit, SHIP_STATUSES };
