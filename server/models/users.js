/* Acceso a la tabla users. Nunca devuelve password_hash/totp_secret al cliente
   (usar toPublic). Los cambios de rol/estado/contraseña incrementan
   token_version para invalidar tokens existentes de inmediato. */
const { pool } = require('../db');

function toPublic(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    active: u.active,
    must_change_password: u.must_change_password,
    last_login: u.last_login,
    created_at: u.created_at,
  };
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function findByUsername(username) {
  const r = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1', [String(username || '')]);
  return r.rows[0] || null;
}

async function findByEmail(email) {
  if (!email) return null;
  const r = await pool.query('SELECT * FROM users WHERE email IS NOT NULL AND LOWER(email) = LOWER($1) LIMIT 1', [email]);
  return r.rows[0] || null;
}

async function list() {
  const r = await pool.query(
    `SELECT id, username, email, role, active, must_change_password, last_login, created_at
     FROM users ORDER BY created_at DESC`
  );
  return r.rows;
}

async function create({ username, email, password_hash, role, must_change_password }) {
  const r = await pool.query(
    `INSERT INTO users (username, email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [username, email || null, password_hash, role, !!must_change_password]
  );
  return r.rows[0];
}

async function update(id, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  if (fields.email !== undefined) { sets.push(`email = $${i++}`); vals.push(fields.email || null); }
  if (fields.role !== undefined) { sets.push(`role = $${i++}`); vals.push(fields.role); }
  if (fields.active !== undefined) { sets.push(`active = $${i++}`); vals.push(fields.active); }
  if (!sets.length) return findById(id);
  // Cambiar rol o desactivar debe cerrar las sesiones activas del usuario.
  if (fields.role !== undefined || fields.active !== undefined) sets.push('token_version = token_version + 1');
  sets.push('updated_at = NOW()');
  vals.push(id);
  const r = await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return r.rows[0] || null;
}

async function setPassword(id, password_hash, { mustChange = false } = {}) {
  const r = await pool.query(
    `UPDATE users
     SET password_hash = $2, must_change_password = $3,
         token_version = token_version + 1, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id, password_hash, mustChange]
  );
  return r.rows[0] || null;
}

async function bumpTokenVersion(id) {
  const r = await pool.query(
    'UPDATE users SET token_version = token_version + 1, updated_at = NOW() WHERE id = $1 RETURNING *',
    [id]
  );
  return r.rows[0] || null;
}

async function touchLastLogin(id) {
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [id]);
}

async function countActiveAdmins() {
  const r = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND active = true");
  return r.rows[0].n;
}

module.exports = {
  toPublic, findById, findByUsername, findByEmail, list,
  create, update, setPassword, bumpTokenVersion, touchLastLogin, countActiveAdmins,
};
