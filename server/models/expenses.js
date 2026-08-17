/* Gastos del negocio (contabilidad simple: ingresos vs egresos). */
const { pool } = require('../db');

async function listAll() {
  const r = await pool.query(
    `SELECT e.*, u.username AS created_by_username
     FROM expenses e LEFT JOIN users u ON u.id = e.created_by
     ORDER BY e.created_at DESC`
  );
  return r.rows;
}

async function create({ description, category, amount }, userId) {
  const r = await pool.query(
    `INSERT INTO expenses (description, category, amount, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [description, category || null, amount, userId || null]
  );
  return r.rows[0];
}

async function remove(id) {
  const r = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
  return r.rowCount > 0;
}

module.exports = { listAll, create, remove };
