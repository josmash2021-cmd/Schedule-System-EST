/* Marca una orden como En tránsito (uso puntual, vía railway run):
   node scripts/mark-intransit.js <email-cliente> */
const { pool } = require('../db');
(async () => {
  const email = process.argv[2];
  if (!email) { console.error('Falta el email.'); process.exit(1); }
  const { rows } = await pool.query(
    'SELECT * FROM online_orders WHERE lower(email) = lower($1) ORDER BY id DESC LIMIT 1',
    [email]
  );
  const o = rows[0];
  if (!o) { console.error('Orden no encontrada.'); process.exit(1); }
  console.log(`Orden #${o.id}: ${o.customer_name} | estado=${o.ship_status} tag=${o.ship_tag}`);
  const tracking = require('../lib/tracking');
  await tracking.applyUpdate(o, { tag: 'InTransit' });
  console.log('Listo: tag InTransit aplicado.');
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
