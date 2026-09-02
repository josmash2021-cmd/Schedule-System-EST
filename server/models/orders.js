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

module.exports = { createFromStripe, listAll, listSessionIds };
