/* Órdenes online (compras web pagadas por Stripe Checkout). Se crean desde el
   webhook de checkout; el panel solo las lista (no se anulan ni editan aquí:
   los reembolsos se hacen en Stripe). */
const { pool } = require('../db');

// order: { sessionId, customerName, email, phone, address, items, total, currency }
// ON CONFLICT DO NOTHING: Stripe entrega los webhooks "al menos una vez"; si el
// evento se repite (o el server se reinicia y pierde el dedupe en memoria), la
// orden no se duplica. Devuelve true si se insertó.
async function createFromStripe(order) {
  const r = await pool.query(
    `INSERT INTO online_orders (stripe_session_id, customer_name, email, phone, address, items, total, currency)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    ]
  );
  return r.rowCount > 0;
}

async function listAll() {
  const r = await pool.query('SELECT * FROM online_orders ORDER BY created_at DESC');
  return r.rows;
}

module.exports = { createFromStripe, listAll };
