/* Diagnóstico: inventario al cierre de cada mes (lo que ve el panel).
   Uso: node /app/scripts/diag-stock.js */
const { pool } = require('../db');
const inventory = require('../models/inventory');
(async () => {
  console.table(await inventory.stockAtMonthEnds());
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
