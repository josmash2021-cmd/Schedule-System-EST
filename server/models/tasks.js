/* Tareas asignadas a trabajadores. */
const { pool } = require('../db');

const STATUSES = ['pending', 'in_progress', 'done'];

async function listAll() {
  const r = await pool.query(
    `SELECT t.*, u.username AS assignee_username
     FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
     ORDER BY (t.status = 'done') ASC, t.created_at DESC`
  );
  return r.rows;
}

async function listForUser(userId) {
  const r = await pool.query(
    `SELECT * FROM tasks WHERE assigned_to = $1
     ORDER BY (status = 'done') ASC, created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function create({ title, description, assigned_to, created_by, due_date }) {
  const r = await pool.query(
    `INSERT INTO tasks (title, description, assigned_to, created_by, due_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [title, description || null, assigned_to || null, created_by || null, due_date || null]
  );
  return r.rows[0];
}

async function update(id, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of ['title', 'description', 'assigned_to', 'due_date']) {
    if (fields[k] !== undefined) { sets.push(`${k} = $${i++}`); vals.push(fields[k] === '' ? null : fields[k]); }
  }
  if (fields.status !== undefined) {
    sets.push(`status = $${i++}`); vals.push(fields.status);
    sets.push(`completed_at = ${fields.status === 'done' ? 'NOW()' : 'NULL'}`);
  }
  if (!sets.length) return findById(id);
  sets.push('updated_at = NOW()');
  vals.push(id);
  const r = await pool.query(`UPDATE tasks SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return r.rows[0] || null;
}

async function setStatus(id, status) {
  const r = await pool.query(
    `UPDATE tasks
     SET status = $2, completed_at = CASE WHEN $2 = 'done' THEN NOW() ELSE NULL END, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return r.rows[0] || null;
}

async function remove(id) {
  await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
}

module.exports = { STATUSES, listAll, listForUser, findById, create, update, setStatus, remove };
