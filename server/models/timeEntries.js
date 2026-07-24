/* Fichaje de horas (time_entries). Un turno = clock_in..clock_out.
   El índice único parcial garantiza un solo turno abierto por trabajador. */
const { pool } = require('../db');

async function getOpen(userId) {
  const r = await pool.query('SELECT * FROM time_entries WHERE user_id = $1 AND clock_out IS NULL LIMIT 1', [userId]);
  return r.rows[0] || null;
}

async function clockIn(userId) {
  const r = await pool.query('INSERT INTO time_entries (user_id) VALUES ($1) RETURNING *', [userId]);
  return r.rows[0];
}

async function clockOut(userId) {
  const r = await pool.query(
    'UPDATE time_entries SET clock_out = NOW() WHERE user_id = $1 AND clock_out IS NULL RETURNING *',
    [userId]
  );
  return r.rows[0] || null;
}

async function recentForUser(userId, days = 14) {
  // Corte calculado en JS: evita aritmética de intervalos en SQL. Es un filtro
  // de recencia (para mostrar), no un cálculo exacto de duración.
  const cutoff = new Date(Date.now() - days * 86400000);
  const r = await pool.query(
    `SELECT * FROM time_entries
     WHERE user_id = $1 AND clock_in >= $2
     ORDER BY clock_in DESC`,
    [userId, cutoff]
  );
  return r.rows;
}

// Admin: quién está fichado ahora mismo (turno abierto), con nombre.
async function openNow() {
  const r = await pool.query(
    `SELECT t.id, t.user_id, t.clock_in, u.username, u.role
     FROM time_entries t JOIN users u ON u.id = t.user_id
     WHERE t.clock_out IS NULL
     ORDER BY t.clock_in ASC`
  );
  return r.rows;
}

// Admin: turnos recientes de todos, con nombre.
async function recentAll(days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000);
  const r = await pool.query(
    `SELECT t.id, t.user_id, t.clock_in, t.clock_out, u.username
     FROM time_entries t JOIN users u ON u.id = t.user_id
     WHERE t.clock_in >= $1
     ORDER BY t.clock_in DESC`,
    [cutoff]
  );
  return r.rows;
}

module.exports = { getOpen, clockIn, clockOut, recentForUser, openNow, recentAll };
