/* Reparaciones (repair_tickets) + fotos (repair_photos). */
const { pool } = require('../db');

const STATUSES = ['recibido', 'diagnostico', 'reparacion', 'listo', 'entregado'];
// Campos editables (texto/precio/asignado). El estado se maneja aparte.
const FIELDS = [
  'device_brand', 'device_model', 'device_serial',
  'customer_name', 'customer_phone',
  'problem', 'diagnosis',
  'quoted_price', 'final_price',
  'assigned_to',
];

async function listAll() {
  const r = await pool.query(
    `SELECT t.*, u.username AS assignee_username
     FROM repair_tickets t
     LEFT JOIN users u ON u.id = t.assigned_to
     ORDER BY (t.status = 'entregado') ASC, t.updated_at DESC`
  );
  // Conteo de fotos por ticket en una consulta simple aparte (se une en JS).
  const counts = await pool.query('SELECT ticket_id, COUNT(*)::int AS n FROM repair_photos GROUP BY ticket_id');
  const map = new Map(counts.rows.map((c) => [c.ticket_id, c.n]));
  return r.rows.map((t) => ({ ...t, photo_count: map.get(t.id) || 0 }));
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM repair_tickets WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function getWithPhotos(id) {
  const t = await findById(id);
  if (!t) return null;
  const p = await pool.query(
    'SELECT id, filename, created_at FROM repair_photos WHERE ticket_id = $1 ORDER BY created_at ASC',
    [id]
  );
  t.photos = p.rows;
  return t;
}

async function create(fields, createdBy) {
  const cols = [];
  const vals = [];
  const ph = [];
  let i = 1;
  for (const k of FIELDS) if (fields[k] !== undefined) { cols.push(k); vals.push(fields[k]); ph.push(`$${i++}`); }
  if (fields.status !== undefined) { cols.push('status'); vals.push(fields.status); ph.push(`$${i++}`); }
  cols.push('created_by'); vals.push(createdBy || null); ph.push(`$${i++}`);
  const r = await pool.query(
    `INSERT INTO repair_tickets (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`,
    vals
  );
  return r.rows[0];
}

async function update(id, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of FIELDS) if (fields[k] !== undefined) { sets.push(`${k} = $${i++}`); vals.push(fields[k]); }
  if (fields.status !== undefined) {
    sets.push(`status = $${i++}`); vals.push(fields.status);
    sets.push(`delivered_at = ${fields.status === 'entregado' ? 'NOW()' : 'NULL'}`);
  }
  if (!sets.length) return findById(id);
  sets.push('updated_at = NOW()');
  vals.push(id);
  const r = await pool.query(`UPDATE repair_tickets SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return r.rows[0] || null;
}

async function remove(id) {
  await pool.query('DELETE FROM repair_tickets WHERE id = $1', [id]);
}

async function listPhotoFilenames(ticketId) {
  const r = await pool.query('SELECT filename FROM repair_photos WHERE ticket_id = $1', [ticketId]);
  return r.rows.map((x) => x.filename);
}

async function addPhoto(ticketId, filename, uploadedBy) {
  const r = await pool.query(
    'INSERT INTO repair_photos (ticket_id, filename, uploaded_by) VALUES ($1, $2, $3) RETURNING id, filename, created_at',
    [ticketId, filename, uploadedBy || null]
  );
  return r.rows[0];
}

async function getPhoto(photoId) {
  const r = await pool.query('SELECT * FROM repair_photos WHERE id = $1', [photoId]);
  return r.rows[0] || null;
}

async function removePhoto(photoId) {
  await pool.query('DELETE FROM repair_photos WHERE id = $1', [photoId]);
}

module.exports = {
  STATUSES, FIELDS, listAll, findById, getWithPhotos, create, update, remove,
  listPhotoFilenames, addPhoto, getPhoto, removePhoto,
};
