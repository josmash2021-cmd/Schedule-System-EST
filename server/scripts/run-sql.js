/* Ejecuta SQL arbitrario contra la base (herramienta de diagnóstico local vía
   railway ssh). Uso: node /app/scripts/run-sql.js "SELECT 1" */
const { pool } = require('../db');
(async () => {
  const sql = process.argv.slice(2).join(' ');
  if (!sql) { console.error('Falta el SQL.'); process.exit(1); }
  const r = await pool.query(sql);
  if (r.rows && r.rows.length) console.table(r.rows);
  console.log('rowCount:', r.rowCount);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
