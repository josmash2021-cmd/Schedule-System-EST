/* Ventas directas (sales + sale_items). El total se calcula SIEMPRE en el
   servidor a partir de las líneas; las líneas con item_id descuentan stock y
   dejan su movimiento de inventario en la misma transacción.
   create/remove aceptan un client ya en transacción (opts.client) para que
   las facturas puedan crear/anular su venta dentro de SU transacción. */
const { pool, withTransaction } = require('../db');

// Error con código para que la ruta responda 400/409 en vez de 500.
function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function listAll() {
  // invoice_*: la factura ligada a la venta (si hay), para que Ventas muestre
  // "Ver factura" en vez de crear una duplicada, y el cliente de la factura.
  const r = await pool.query(
    `SELECT s.*, u.username AS seller_username,
            inv.id AS invoice_id, inv.invoice_number, inv.buyer_name AS invoice_buyer
     FROM sales s
     LEFT JOIN users u ON u.id = s.created_by
     LEFT JOIN LATERAL (
       SELECT id, invoice_number, buyer_name FROM invoices WHERE sale_id = s.id ORDER BY id DESC LIMIT 1
     ) inv ON true
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

// items: [{ item_id?, name?, qty, price? }] — validados por la ruta (o por la
// factura que la genera). sale_date/sale_time (opcionales, 'YYYY-MM-DD' y
// 'HH:MM' en hora de Chicago): fecha REAL de la venta; sin ellos, ahora.
// Los timestamps de la base están en UTC.
async function create({ items, payment_method, note, sale_date, sale_time }, userId, opts = {}) {
  return withTransaction(async (client) => {
    let ts = null;
    if (sale_date && /^\d{4}-\d{2}-\d{2}$/.test(sale_date)) {
      const time = sale_time && /^\d{2}:\d{2}(:\d{2})?$/.test(sale_time) ? sale_time : '12:00';
      const r = await client.query(
        `SELECT to_char(((($1::date + $2::time) AT TIME ZONE 'America/Chicago') AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS') AS ts`,
        [sale_date, time]
      );
      ts = r.rows[0].ts;
    }
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
          'INSERT INTO inventory_movements (item_id, delta, reason, note, user_id, created_at) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamp, NOW()::timestamp))',
          [p.id, -it.qty, 'venta', note || null, userId || null, ts]
        );
      } else {
        line = { item_id: null, name: it.name, qty: it.qty, price: it.price, cost: null };
      }
      lines.push(line);
      total += line.qty * line.price;
    }
    total = Math.round(total * 100) / 100;
    const s = await client.query(
      'INSERT INTO sales (total, payment_method, note, created_by, created_at) VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, NOW()::timestamp)) RETURNING *',
      [total, payment_method || null, note || null, userId || null, ts]
    );
    const sale = s.rows[0];
    for (const l of lines) {
      await client.query(
        'INSERT INTO sale_items (sale_id, item_id, name, qty, price, cost) VALUES ($1, $2, $3, $4, $5, $6)',
        [sale.id, l.item_id, l.name, l.qty, l.price, l.cost]
      );
    }
    return { ...sale, items: lines };
  }, opts.client);
}

// Anular una venta: repone el stock de sus líneas de inventario (con su
// movimiento "venta anulada") y borra la venta. Devuelve false si no existe.
// opts.note: nota del movimiento (por defecto "Venta #N").
async function remove(id, userId, opts = {}) {
  return withTransaction(async (client) => {
    const s = await client.query('SELECT id FROM sales WHERE id = $1 FOR UPDATE', [id]);
    if (!s.rows.length) return false;
    const items = await client.query('SELECT * FROM sale_items WHERE sale_id = $1 AND item_id IS NOT NULL', [id]);
    for (const it of items.rows) {
      const u = await client.query(
        'UPDATE inventory_items SET stock = stock + $2, updated_at = NOW() WHERE id = $1 RETURNING id',
        [it.item_id, it.qty]
      );
      if (u.rowCount) {
        // El motivo DEBE ser 'venta anulada': purchasesByMonth lo excluye
        // para no contar la reposición como compra de inventario.
        await client.query(
          'INSERT INTO inventory_movements (item_id, delta, reason, note, user_id) VALUES ($1, $2, $3, $4, $5)',
          [it.item_id, it.qty, 'venta anulada', opts.note || `Venta #${id}`, userId || null]
        );
      }
    }
    await client.query('DELETE FROM sales WHERE id = $1', [id]); // líneas caen por CASCADE
    return true;
  }, opts.client);
}

// Borrado total (reinicio de la página de Ventas). NO repone stock: es una
// limpieza de historial, no una anulación — esas unidades sí se vendieron.
async function removeAll() {
  const r = await pool.query('DELETE FROM sales');
  return r.rowCount;
}

module.exports = { listAll, create, remove, removeAll, fail };
