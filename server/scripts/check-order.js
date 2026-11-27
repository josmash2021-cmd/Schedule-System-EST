/* Consulta el estado actual de una orden por su número de tracking.
   Uso: railway run node server/scripts/check-order.js <tracking_number> */
const { pool } = require('../db');

(async () => {
  const num = process.argv[2];
  if (!num) { console.log('Falta el número de tracking.'); process.exit(1); }
  const r = await pool.query(
    'SELECT id, customer_name, ship_status, ship_tag, tracking_number, expected_delivery, ship_note, ship_note_en FROM online_orders WHERE tracking_number = $1',
    [num]
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
