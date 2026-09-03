/* Inspecciona un producto por nombre: datos + movimientos.
   Uso: node /app/scripts/diag-item.js "Macbook Neo" */
const { pool } = require('../db');
(async () => {
  const name = process.argv[2];
  const it = await pool.query('SELECT * FROM inventory_items WHERE name ILIKE $1 ORDER BY id', [`%${name}%`]);
  console.table(it.rows.map((r) => ({ id: r.id, name: r.name, stock: r.stock, cost: r.cost, price: r.price, active: r.active, created_at: r.created_at })));
  for (const item of it.rows) {
    const m = await pool.query('SELECT id, delta, reason, note, created_at FROM inventory_movements WHERE item_id = $1 ORDER BY created_at, id', [item.id]);
    console.log('Movimientos de', item.name, '(id ' + item.id + '):');
    console.table(m.rows);
  }
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
