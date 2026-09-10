/* Reparaciones (repair_tickets) + fotos (repair_photos). */
const crypto = require('node:crypto');
const { pool } = require('../db');

const STATUSES = ['recibido', 'diagnostico', 'reparacion', 'listo', 'entregado'];
const DEVICE_TYPES = ['telefono', 'tablet', 'laptop'];
const SERVICE_TYPES = ['revision', 'reparacion', 'mantenimiento'];
// Campos editables (texto/precio/asignado). El estado se maneja aparte.
const FIELDS = [
  'device_type', 'service_type',
  'device_brand', 'device_model', 'device_serial',
  'customer_name', 'customer_phone', 'customer_email',
  'problem', 'diagnosis',
  'quoted_price', 'final_price',
  'assigned_to',
  'tracking_number', 'carrier',
  'amount_paid', 'invoice_id',
];

async function listAll() {
  const r = await pool.query(
    `SELECT t.*, u.username AS assignee_username,
            COALESCE(pin.invoice_number,
              (SELECT i.invoice_number FROM invoices i WHERE i.repair_id = t.id ORDER BY i.id DESC LIMIT 1)
            ) AS invoice_number
     FROM repair_tickets t
     LEFT JOIN users u ON u.id = t.assigned_to
     LEFT JOIN invoices pin ON pin.id = t.invoice_id
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
  // Token público de seguimiento (link de track.html para el cliente).
  cols.push('track_token'); vals.push(crypto.randomBytes(24).toString('hex')); ph.push(`$${i++}`);
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

// Borrado masivo. Tres modos: `ids` (las seleccionadas), `delivered` (solo las
// entregadas = las ventas) o nada (TODAS). Devuelve los archivos de foto que
// quedaron huérfanos para que la ruta los borre del disco (las filas de
// repair_photos caen solas por ON DELETE CASCADE).
async function removeMany({ ids = null, delivered = false } = {}) {
  if (ids && !ids.length) return { deleted: 0, files: [] };
  const params = ids ? [ids] : [];
  const ticketWhere = ids ? ' WHERE id = ANY($1)' : delivered ? " WHERE status = 'entregado'" : '';
  const photoWhere = ids ? ' WHERE ticket_id = ANY($1)'
    : delivered ? " WHERE ticket_id IN (SELECT id FROM repair_tickets WHERE status = 'entregado')" : '';
  const p = await pool.query(`SELECT filename FROM repair_photos${photoWhere}`, params);
  const r = await pool.query(`DELETE FROM repair_tickets${ticketWhere}`, params);
  return { deleted: r.rowCount, files: p.rows.map((x) => x.filename) };
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

// Página pública de seguimiento (track.html): por token secreto o por número
// de rastreo, igual que las órdenes de envío.
async function findByTrackToken(token) {
  const r = await pool.query('SELECT * FROM repair_tickets WHERE track_token = $1', [token]);
  return r.rows[0] || null;
}

async function findByTrackingNumber(num) {
  const r = await pool.query(
    'SELECT * FROM repair_tickets WHERE tracking_number = $1 ORDER BY updated_at DESC',
    [num]
  );
  return r.rows[0] || null;
}

// Por id del proveedor de rastreo (AfterShip lo manda en su webhook).
async function findByTrackingId(trackingId) {
  const r = await pool.query('SELECT * FROM repair_tickets WHERE tracking_id = $1', [trackingId]);
  return r.rows[0] || null;
}

// ---- Seguimiento automático del repuesto (pieza en camino al taller) ----
// Mismo vocabulario que online_orders: ship_tag fino (InTransit/OutForDelivery/
// Delivered) escrito por el job de rastreo; shipped_at se sella la PRIMERA vez
// que se carga tracking (de esa fecha cuentan las 24 h de la regla sin
// proveedor). Sin correos automáticos: el panel ya tiene el botón de enviar
// el correo de seguimiento a mano.
async function stampShipped(id) {
  await pool.query('UPDATE repair_tickets SET shipped_at = COALESCE(shipped_at, NOW()) WHERE id = $1', [id]);
}

async function setTrackingId(id, trackingId) {
  await pool.query('UPDATE repair_tickets SET tracking_id = COALESCE($2, tracking_id) WHERE id = $1', [id, trackingId || null]);
}

async function updateShipTag(id, tag) {
  await pool.query('UPDATE repair_tickets SET ship_tag = $2 WHERE id = $1', [id, tag || null]);
}

async function updateExpectedDelivery(id, date) {
  await pool.query('UPDATE repair_tickets SET expected_delivery = $2 WHERE id = $1', [id, date || null]);
}

// Marca un correo de reparación como enviado (columna en lista blanca).
async function markEmailSent(id, col) {
  if (!['email_part_arrived', 'email_ready'].includes(col)) return;
  await pool.query(`UPDATE repair_tickets SET ${col} = true WHERE id = $1`, [id]);
}

// Tickets cuya pieza sigue en camino (el job los consulta cada 15 min).
async function listPartsInTransit() {
  const r = await pool.query(
    `SELECT * FROM repair_tickets
     WHERE tracking_number IS NOT NULL AND status <> 'entregado'
       AND (ship_tag IS NULL OR ship_tag <> 'Delivered')`
  );
  return r.rows;
}

module.exports = {
  STATUSES, DEVICE_TYPES, SERVICE_TYPES, FIELDS, listAll, findById, getWithPhotos, create, update, remove, removeMany,
  listPhotoFilenames, addPhoto, getPhoto, removePhoto,
  findByTrackToken, findByTrackingNumber, findByTrackingId,
  stampShipped, setTrackingId, updateShipTag, updateExpectedDelivery, listPartsInTransit, markEmailSent,
};
