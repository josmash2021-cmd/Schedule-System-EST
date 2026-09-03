// Desglose de la inversión de agosto 2026 (entradas × costo actual).
const { pool } = require('./server/db');
(async () => {
  const r = await pool.query(
    `SELECT i.name, m.delta, i.cost, m.delta * COALESCE(i.cost,0) AS subtotal, m.reason, m.note,
            (m.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago' AS fecha
     FROM inventory_movements m JOIN inventory_items i ON i.id = m.item_id
     WHERE m.delta > 0 AND (m.reason IS NULL OR m.reason <> 'venta anulada')
       AND date_trunc('month', (m.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago') = '2026-08-01'
     ORDER BY m.created_at`
  );
  let total = 0;
  for (const x of r.rows) {
    total += Number(x.subtotal);
    console.log(`${x.fecha.toISOString().slice(0,10)} | ${x.name} | +${x.delta} × $${x.cost ?? '—'} = $${Number(x.subtotal).toFixed(2)} | ${x.note || x.reason || ''}`);
  }
  console.log('\nTOTAL agosto: $' + total.toFixed(2));
  await pool.end();
})();
