/* Inventario: productos (inventory_items) + movimientos de stock. */
const { pool } = require('../db');

// Campos editables del producto (stock inicial solo al crear).
const FIELDS = ['name', 'sku', 'category', 'description', 'price', 'cost', 'min_stock', 'image_url'];

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

async function create(fields, userId) {
  const cols = [];
  const vals = [];
  const ph = [];
  let i = 1;
  for (const k of FIELDS) if (fields[k] !== undefined) { cols.push(k); vals.push(fields[k]); ph.push(`$${i++}`); }
  if (fields.stock !== undefined) { cols.push('stock'); vals.push(fields.stock); ph.push(`$${i++}`); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(`INSERT INTO inventory_items (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`, vals);
    const item = r.rows[0];
    // El stock inicial ES una compra de mercancía: debe quedar su movimiento
    // de entrada, si no la inversión del mes no lo cuenta.
    if (Number(item.stock) > 0) {
      await client.query(
        'INSERT INTO inventory_movements (item_id, delta, reason, note, user_id) VALUES ($1, $2, $3, $4, $5)',
        [item.id, Number(item.stock), 'entrada', 'Stock inicial', userId || null]
      );
    }
    await client.query('COMMIT');
    return item;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

async function update(id, fields, userId) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of FIELDS) if (fields[k] !== undefined) { sets.push(`${k} = $${i++}`); vals.push(fields[k]); }
  // El stock también se puede corregir desde la ficha (Cantidad).
  const corrigeStock = fields.stock !== undefined;
  if (corrigeStock) { sets.push(`stock = $${i++}`); vals.push(fields.stock); }
  if (!sets.length) return findById(id);
  sets.push('updated_at = NOW()');
  vals.push(id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // La corrección directa de cantidad también deja su movimiento (si no,
    // las compras/ajustes hechos así no aparecen en la inversión del mes).
    if (corrigeStock) {
      const prev = await client.query('SELECT stock FROM inventory_items WHERE id = $1 FOR UPDATE', [id]);
      if (prev.rows.length) {
        const delta = Number(fields.stock) - Number(prev.rows[0].stock || 0);
        if (delta !== 0) {
          await client.query(
            'INSERT INTO inventory_movements (item_id, delta, reason, note, user_id) VALUES ($1, $2, $3, $4, $5)',
            [id, delta, delta > 0 ? 'entrada' : 'ajuste', 'Corrección de cantidad', userId || null]
          );
        }
      }
    }
    const r = await client.query(`UPDATE inventory_items SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
    await client.query('COMMIT');
    return r.rows[0] || null;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
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

// Mercancía comprada por mes: entradas de stock (delta > 0) × costo ACTUAL
// del producto, agrupado por mes calendario en hora de Chicago (los
// timestamps están en UTC). No hay foto del costo en el movimiento: si el
// costo del producto cambia después, los meses viejos reflejan el costo nuevo.
async function purchasesByMonth() {
  const r = await pool.query(
    `SELECT to_char(date_trunc('month', (m.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago'), 'YYYY-MM') AS mes,
            SUM(m.delta) AS unidades,
            SUM(m.delta * COALESCE(i.cost, 0)) AS total
     FROM inventory_movements m JOIN inventory_items i ON i.id = m.item_id
     WHERE m.delta > 0 AND (m.reason IS NULL OR m.reason <> 'venta anulada')
     GROUP BY 1 ORDER BY 1 DESC`
  );
  return r.rows.map((x) => ({ mes: x.mes, unidades: Number(x.unidades) || 0, total: Number(x.total) || 0 }));
}

// Inventario que quedaba al CIERRE de cada mes (para la contabilidad mensual
// de Ventas). Reconstruye el stock histórico: stock actual − movimientos
// posteriores a ese cierre. Valor a costo y a precio de venta. Todo en hora
// de Chicago; los timestamps de la base están en UTC.
async function stockAtMonthEnds() {
  const r = await pool.query(`
    WITH meses AS (
      SELECT DISTINCT date_trunc('month', (created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago') AS m
      FROM inventory_movements
    )
    SELECT to_char(meses.m, 'YYYY-MM') AS mes,
           SUM(GREATEST(i.stock - COALESCE(mov.despues, 0), 0)) AS unidades,
           SUM(GREATEST(i.stock - COALESCE(mov.despues, 0), 0) * COALESCE(i.cost, 0)) AS valor_costo,
           SUM(GREATEST(i.stock - COALESCE(mov.despues, 0), 0) * COALESCE(i.price, 0)) AS valor_venta
    FROM meses
    CROSS JOIN inventory_items i
    LEFT JOIN LATERAL (
      SELECT SUM(mv.delta) AS despues FROM inventory_movements mv
      WHERE mv.item_id = i.id
        AND (mv.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Chicago' >= meses.m + INTERVAL '1 month'
    ) mov ON true
    WHERE i.active
    GROUP BY meses.m ORDER BY meses.m DESC
  `);
  return r.rows.map((x) => ({
    mes: x.mes,
    unidades: Number(x.unidades) || 0,
    valorCosto: Number(x.valor_costo) || 0,
    valorVenta: Number(x.valor_venta) || 0,
  }));
}

module.exports = { FIELDS, listItems, findById, create, update, softDelete, adjustStock, listMovements, purchasesByMonth, stockAtMonthEnds };
