/* Diagnóstico: movimientos de inventario positivos por mes y razón.
   Uso: railway run --service "Schedule-System-EST" node server/scripts/diag-inversion.js [YYYY-MM] */
const { pool } = require('../db');
const mes = process.argv[2] || null;
(async () => {
  const params = [];
  let where = "m.delta > 0 AND (m.reason IS NULL OR m.reason <> 'venta anulada')";
  if (mes) { params.push(mes); where += ` AND to_char(date_trunc('month', (m.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago'), 'YYYY-MM') = $1`; }
  const r = await pool.query(
    `SELECT to_char(date_trunc('month', (m.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago'), 'YYYY-MM') AS mes,
            COALESCE(m.reason, '(sin razón)') AS razon,
            COUNT(*) AS movimientos, SUM(m.delta) AS unidades, SUM(m.delta * COALESCE(i.cost,0)) AS total
     FROM inventory_movements m JOIN inventory_items i ON i.id = m.item_id
     WHERE ${where}
     GROUP BY 1, 2 ORDER BY 1 DESC, 5 DESC`, params);
  console.table(r.rows);
  if (mes) {
    const d = await pool.query(
      `SELECT m.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago' AS fecha, i.name, m.delta, i.cost, m.delta*i.cost AS total, m.reason, m.note
       FROM inventory_movements m JOIN inventory_items i ON i.id = m.item_id
       WHERE ${where} ORDER BY m.created_at`, params);
    console.table(d.rows.map((x) => ({ ...x, total: Number(x.total) })));
  }
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
