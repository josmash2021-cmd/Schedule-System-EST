/* Inventario: productos (inventory_items) + movimientos de stock. */
const { pool } = require('../db');

// Campos editables del producto (stock inicial solo al crear).
const FIELDS = ['name', 'sku', 'category', 'description', 'price', 'cost', 'min_stock'];

async function listItems(search) {
  if (search) {
    const q = '%' + String(search).replace(/[%_\\]/g, '') + '%';
    const r = await pool.query(
      `SELECT * FROM inventory_items
       WHERE active AND (name ILIKE $1 OR COALESCE(sku, '') ILIKE $1 OR COALESCE(category, '') ILIKE $1)
       ORDER BY name ASC`,
      [q]
    );
    return r.rows;
  }
  const r = await pool.query('SELECT * FROM inventory_items WHERE active ORDER BY name ASC');
  return r.rows;
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM inventory_items WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function create(fields) {
  const cols = [];
  const vals = [];
  const ph = [];
  let i = 1;
  for (const k of FIELDS) if (fields[k] !== undefined) { cols.push(k); vals.push(fields[k]); ph.push(`$${i++}`); }
  if (fields.stock !== undefined) { cols.push('stock'); vals.push(fields.stock); ph.push(`$${i++}`); }
  const r = await pool.query(`INSERT INTO inventory_items (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`, vals);
  return r.rows[0];
}

async function update(id, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of FIELDS) if (fields[k] !== undefined) { sets.push(`${k} = $${i++}`); vals.push(fields[k]); }
  if (!sets.length) return findById(id);
  sets.push('updated_at = NOW()');
  vals.push(id);
  const r = await pool.query(`UPDATE inventory_items SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return r.rows[0] || null;
}

// Baja lógica (preserva el historial de movimientos).
async function softDelete(id) {
  const r = await pool.query('UPDATE inventory_items SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id', [id]);
  return r.rowCount > 0;
}

// Ajuste de stock ATÓMICO: actualiza el stock y registra el movimiento en una
// sola transacción (nunca queda un stock cambiado sin su movimiento).
async function adjustStock(itemId, delta, reason, note, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(
      'UPDATE inventory_items SET stock = stock + $2, updated_at = NOW() WHERE id = $1 AND active RETURNING *',
      [itemId, delta]
    );
    if (u.rowCount === 0) { await client.query('ROLLBACK'); return null; }
    await client.query(
      'INSERT INTO inventory_movements (item_id, delta, reason, note, user_id) VALUES ($1, $2, $3, $4, $5)',
      [itemId, delta, reason || null, note || null, userId || null]
    );
    await client.query('COMMIT');
    return u.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function listMovements(itemId, limit = 50) {
  const r = await pool.query(
    `SELECT m.id, m.delta, m.reason, m.note, m.created_at, u.username
     FROM inventory_movements m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.item_id = $1 ORDER BY m.created_at DESC LIMIT $2`,
    [itemId, limit]
  );
  return r.rows;
}

module.exports = { FIELDS, listItems, findById, create, update, softDelete, adjustStock, listMovements };
