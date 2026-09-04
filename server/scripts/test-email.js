/* Envía la confirmación de una orden real a un correo de prueba.
   Uso: node /app/scripts/test-email.js <correo> [orderId] */
const { pool } = require('../db');
(async () => {
  const to = process.argv[2];
  const id = Number(process.argv[3]) || 1;
  if (!to || !to.includes('@')) { console.error('Falta el correo destino.'); process.exit(1); }
  const r = await pool.query('SELECT * FROM online_orders WHERE id = $1', [id]);
  const order = r.rows[0];
  if (!order) { console.error('Orden no encontrada.'); await pool.end(); process.exit(1); }
  const email = require('../lib/email');
  await email.sendNewOrderEmails({ ...order, email: to });
  console.log('Enviado a', to, '(orden #' + id + ')');
  await pool.end();
})().catch(async (e) => { console.error('FALLO:', e.message); try { await pool.end(); } catch (_) {} process.exit(1); });
