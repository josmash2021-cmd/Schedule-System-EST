/* Limpieza de los datos de demostración que cargó la antigua "Simulación".
   GET  /x/s/demo-data  → cuántas filas demo quedan (0 = sistema 100% real).
   DELETE /x/s/demo-data → las borra todas. Solo admin.

   Los datos demo son reconocibles sin ambigüedad:
     - usuarios  demo.juan / demo.maria / demo.luis
     - teléfonos (205) 555-XXXX  (rango 555 = ficticio por convención)
     - inventario con SKU DEMO-*
   Nada real del taller cae en esos patrones. */
const express = require('express');
const { pool } = require('../db');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, loadUser, requireRole('admin'));

const DEMO_USERS = ['demo.juan', 'demo.maria', 'demo.luis'];
const DEMO_PHONE = '(205) 555-%';
const DEMO_SKU = 'DEMO-%';

async function counts(q) {
  const [repairs, citas, items, workers] = await Promise.all([
    q('SELECT COUNT(*)::int AS n FROM repair_tickets WHERE customer_phone LIKE $1', [DEMO_PHONE]),
    q('SELECT COUNT(*)::int AS n FROM appointments WHERE telefono LIKE $1', [DEMO_PHONE]),
    q('SELECT COUNT(*)::int AS n FROM inventory_items WHERE sku LIKE $1', [DEMO_SKU]),
    q('SELECT COUNT(*)::int AS n FROM users WHERE LOWER(username) = ANY($1)', [DEMO_USERS]),
  ]);
  const c = {
    repairs: repairs.rows[0].n,
    citas: citas.rows[0].n,
    items: items.rows[0].n,
    workers: workers.rows[0].n,
  };
  c.total = c.repairs + c.citas + c.items + c.workers;
  return c;
}

router.get('/', async (_req, res) => {
  try {
    res.json({ ok: true, counts: await counts((t, p) => pool.query(t, p)) });
  } catch (err) {
    console.error('GET /demo-data error:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el estado de los datos de demostración.' });
  }
});

router.delete('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const before = await counts((t, p) => client.query(t, p));
    await client.query('BEGIN');
    // repair_photos e inventory_movements caen por ON DELETE CASCADE;
    // los tickets/tareas de los usuarios demo quedan con assigned_to NULL.
    const del = {};
    del.repairs = (await client.query('DELETE FROM repair_tickets WHERE customer_phone LIKE $1', [DEMO_PHONE])).rowCount;
    del.citas = (await client.query('DELETE FROM appointments WHERE telefono LIKE $1', [DEMO_PHONE])).rowCount;
    del.items = (await client.query('DELETE FROM inventory_items WHERE sku LIKE $1', [DEMO_SKU])).rowCount;
    del.workers = (await client.query('DELETE FROM users WHERE LOWER(username) = ANY($1)', [DEMO_USERS])).rowCount;
    await client.query('COMMIT');
    console.log('Datos demo eliminados por admin:', JSON.stringify(del));
    res.json({ ok: true, deleted: del, before, counts: await counts((t, p) => client.query(t, p)) });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* conexión ya rota */ }
    console.error('DELETE /demo-data error:', err.message);
    res.status(500).json({ error: 'No se pudieron eliminar los datos de demostración.' });
  } finally {
    client.release();
  }
});

module.exports = router;
