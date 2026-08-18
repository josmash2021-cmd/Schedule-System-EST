/* Ventas directas (sales + sale_items). El total se calcula SIEMPRE en el
   servidor a partir de las líneas; las líneas con item_id descuentan stock y
   dejan su movimiento de inventario en la misma transacción. */
const { pool } = require('../db');

// Error con código para que la ruta responda 400/409 en vez de 500.
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function listAll() {
  const r = await pool.query(
    `SELECT s.*, u.username AS seller_username
     FROM sales s LEFT JOIN users u ON u.id = s.created_by
     ORDER BY s.created_at DESC`
  );
  const items = await pool.query('SELECT * FROM sale_items ORDER BY id ASC');
  const bySale = new Map();
  for (const it of items.rows) {
    if (!bySale.has(it.sale_id)) bySale.set(it.sale_id, []);
    bySale.get(it.sale_id).push(it);
  }
  return r.rows.map((s) => ({ ...s, items: bySale.get(s.id) || [] }));
}

// items: [{ item_id?, name?, qty, price? }] — validados por la ruta.
async function create({ items, payment_method, note }, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lines = [];
    let total = 0;
    for (const it of items) {
      let line;
      if (it.item_id) {
        // FOR UPDATE: dos ventas simultáneas del mismo producto no pueden
        // descontar el mismo stock dos veces.
        const r = await client.query('SELECT * FROM inventory_items WHERE id = $1 AND active FOR UPDATE', [it.item_id]);
        const p = r.rows[0];
        if (!p) throw fail(400, 'Uno de los productos ya no existe en el inventario.');
        if (p.stock < it.qty) throw fail(409, `Stock insuficiente de "${p.name}" (quedan ${p.stock}).`);
        const price = it.price != null ? it.price : (Number(p.price) || 0);
        line = { item_id: p.id, name: p.name, qty: it.qty, price, cost: Number(p.cost) || 0 };
        await client.query('UPDATE inventory_items SET stock = stock - $2, updated_at = NOW() WHERE id = $1', [p.id, it.qty]);
        await client.query(
          'INSERT INTO inventory_movements (item_id, delta, reason, note, user_id) VALUES ($1, $2, $3, $4, $5)',
          [p.id, -it.qty, 'venta', null, userId || null]
        );
      } else {
        line = { item_id: null, name: it.name, qty: it.qty, price: it.price, cost: null };
      }
      lines.push(line);
      total += line.qty * line.price;
    }
    total = Math.round(total * 100) / 100;
    const s = await client.query(
      'INSERT INTO sales (total, payment_method, note, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [total, payment_method || null, note || null, userId || null]
    );
    const sale = s.rows[0];
    for (const l of lines) {
      await client.query(
        'INSERT INTO sale_items (sale_id, item_id, name, qty, price, cost) VALUES ($1, $2, $3, $4, $5, $6)',
        [sale.id, l.item_id, l.name, l.qty, l.price, l.cost]
      );
    }
    await client.query('COMMIT');
    return { ...sale, items: lines };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

// Anular una venta: repone el stock de sus líneas de inventario (con su
// movimiento "venta anulada") y borra la venta. Devuelve false si no existe.
async function remove(id, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const s = await client.query('SELECT id FROM sales WHERE id = $1 FOR UPDATE', [id]);
    if (!s.rows.length) { await client.query('ROLLBACK'); return false; }
    const items = await client.query('SELECT * FROM sale_items WHERE sale_id = $1 AND item_id IS NOT NULL', [id]);
    for (const it of items.rows) {
      const u = await client.query(
        'UPDATE inventory_items SET stock = stock + $2, updated_at = NOW() WHERE id = $1 RETURNING id',
        [it.item_id, it.qty]
      );
      if (u.rowCount) {
        await client.query(
          'INSERT INTO inventory_movements (item_id, delta, reason, note, user_id) VALUES ($1, $2, $3, $4, $5)',
          [it.item_id, it.qty, 'venta anulada', `Venta #${id}`, userId || null]
        );
      }
    }
    await client.query('DELETE FROM sales WHERE id = $1', [id]); // líneas caen por CASCADE
    await client.query('COMMIT');
    return true;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión rota */ }
    throw err;
  } finally {
    client.release();
  }
}

// Borrado total (reinicio de la página de Ventas). NO repone stock: es una
// limpieza de historial, no una anulación — esas unidades sí se vendieron.
async function removeAll() {
  const r = await pool.query('DELETE FROM sales');
  return r.rowCount;
}

module.exports = { listAll, create, remove, removeAll, fail };
