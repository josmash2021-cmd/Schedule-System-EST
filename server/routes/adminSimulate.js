/* TEMPORAL (a petición del dueño): carga datos de demostración para probar
   el sistema. POST /x/s/simulate (solo admin). Cuando termine la prueba hay
   que eliminar este archivo, su montaje en index.js y el botón del Dashboard.
   Los datos demo son reconocibles: usuarios demo.*, SKU DEMO-* y nombres
   generados (clientes "Demo" en las notas no aplica; nombres aleatorios). */
const express = require('express');
const { pool } = require('../db');
const { hashPassword } = require('../lib/passwords');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, loadUser, requireRole('admin'));

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const FIRST = ['Carlos', 'Ana', 'Pedro', 'Luisa', 'Mario', 'Rosa', 'Jorge', 'Elena', 'Diego', 'Carmen', 'Andrés', 'Sofía', 'Raúl', 'Nadia'];
const LAST = ['Ruiz', 'Torres', 'Sosa', 'Mora', 'Paz', 'Leal', 'Gómez', 'Vargas', 'Reyes', 'Ortiz', 'Campos', 'Ríos'];
const DEVICES = [
  ['Apple', 'iPhone 13'], ['Apple', 'iPhone 12'], ['Apple', 'iPhone 11'], ['Apple', 'iPad 9'],
  ['Apple', 'MacBook Air 13'], ['Apple', 'MacBook Pro 14'], ['Samsung', 'Galaxy S22'],
  ['Samsung', 'Galaxy S21'], ['Samsung', 'Galaxy Tab A8'], ['Lenovo', 'ThinkPad E14'], ['HP', 'Pavilion 15'],
];
const PROBLEMS = ['Pantalla rota', 'Batería se descarga rápido', 'No enciende', 'Puerto de carga dañado', 'Mantenimiento general', 'Cámara borrosa', 'Altavoz no suena', 'Mojado, no carga'];
const SERVICES = ['Consulta', 'Mantenimiento', 'Reparacion'];
const ACTIVE_STATUS = ['recibido', 'diagnostico', 'reparacion', 'listo'];
const PRODUCTS = [
  ['Pantalla iPhone 13', 'DEMO-PNT-IP13', 'Pantallas', 89.99],
  ['Pantalla iPhone 12', 'DEMO-PNT-IP12', 'Pantallas', 74.99],
  ['Batería iPhone 13', 'DEMO-BAT-IP13', 'Baterías', 39.99],
  ['Batería MacBook Air', 'DEMO-BAT-MBA', 'Baterías', 59.50],
  ['Cable USB-C 1m', 'DEMO-CBL-USBC', 'Accesorios', 9.99],
  ['Cargador 20W USB-C', 'DEMO-CHG-20W', 'Accesorios', 19.99],
  ['SSD 512GB', 'DEMO-SSD-512', 'Almacenamiento', 64.99],
  ['RAM 8GB DDR4', 'DEMO-RAM-8G', 'Memoria', 34.99],
];

// Timestamp hace `days` días a una hora laboral (10–15 h aprox.).
function ago(days) {
  const d = new Date(Date.now() - days * 86400000);
  d.setUTCHours(d.getUTCHours() + randInt(-2, 2));
  return d;
}

router.post('/', async (req, res) => {
  const created = { workers: 0, repairs: 0, citas: 0, items: 0 };
  try {
    // 1) Trabajadores demo (si no existen).
    const hash = await hashPassword('Demo123456');
    const workerIds = [];
    for (const uname of ['demo.juan', 'demo.maria', 'demo.luis']) {
      const ex = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [uname]);
      if (ex.rows.length) { workerIds.push(ex.rows[0].id); continue; }
      const r = await pool.query(
        "INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES ($1, NULL, $2, 'worker', false) RETURNING id",
        [uname, hash]
      );
      workerIds.push(r.rows[0].id);
      created.workers += 1;
    }

    // 2) Reparaciones: ~140 en el último año; la mayoría entregadas (ventas).
    // Guardia anti-duplicados: si ya hay reparaciones demo (de una corrida
    // anterior, aunque haya fallado a medias), no se vuelven a crear.
    const demoRepairs = await pool.query("SELECT COUNT(*)::int AS n FROM repair_tickets WHERE customer_phone LIKE '(205) 555-%'");
    if (demoRepairs.rows[0].n < 100) {
      for (let i = 0; i < 140; i++) {
        const createdDays = randInt(0, 365);
        const delivered = Math.random() < 0.8;
        const [brand, model] = pick(DEVICES);
        const quoted = randInt(30, 400);
        const createdAt = ago(createdDays);
        let status = pick(ACTIVE_STATUS);
        let finalPrice = null;
        let deliveredAt = null;
        if (delivered) {
          status = 'entregado';
          finalPrice = quoted + randInt(-10, 30);
          deliveredAt = ago(Math.max(0, createdDays - randInt(0, 3)));
        }
        await pool.query(
          `INSERT INTO repair_tickets
             (device_brand, device_model, customer_name, customer_phone, problem, diagnosis,
              quoted_price, final_price, status, assigned_to, created_by, created_at, updated_at, delivered_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            brand, model,
            `${pick(FIRST)} ${pick(LAST)}`, `(205) 555-${String(randInt(1000, 9999))}`,
            pick(PROBLEMS), delivered ? pick(PROBLEMS) : null,
            quoted, finalPrice, status,
            pick(workerIds), req.user.id, createdAt, deliveredAt || createdAt, deliveredAt,
          ]
        );
        created.repairs += 1;
      }
    }

    // 3) Citas: ~40 entre 30 días atrás y 10 adelante (hora en slots de 30 min).
    for (let i = 0; i < 40; i++) {
      const offset = randInt(-30, 10);
      const fecha = ago(offset).toISOString().slice(0, 10);
      if (fecha.slice(8, 10) && new Date(fecha + 'T12:00:00Z').getUTCDay() === 0) continue; // domingo
      const hora = `${String(randInt(10, 14)).padStart(2, '0')}:${pick(['00', '30'])}`;
      const estado = offset < 0 ? 'atendida' : pick(['pendiente', 'confirmada']);
      // OJO: la unicidad es un índice PARCIAL (estado <> 'cancelada'), así
      // que el ON CONFLICT debe repetir el predicado para coincidir con él.
      const r = await pool.query(
        `INSERT INTO appointments (nombre, telefono, correo, servicio, fecha, hora, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (fecha, hora) WHERE estado <> 'cancelada' DO NOTHING`,
        [`${pick(FIRST)} ${pick(LAST)}`, `(205) 555-${String(randInt(1000, 9999))}`, null, pick(SERVICES), fecha, hora, estado]
      );
      created.citas += r.rowCount;
    }

    // 4) Inventario demo (si no existe por SKU).
    for (const [name, sku, category, price] of PRODUCTS) {
      const ex = await pool.query('SELECT id FROM inventory_items WHERE sku = $1', [sku]);
      if (ex.rows.length) continue;
      await pool.query(
        'INSERT INTO inventory_items (name, sku, category, price, cost, stock, min_stock) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [name, sku, category, price, Math.round(price * 0.55 * 100) / 100, randInt(0, 40), randInt(2, 8)]
      );
      created.items += 1;
    }

    res.json({ ok: true, created });
  } catch (err) {
    console.error('POST /simulate error:', err.message);
    res.status(500).json({ error: 'No se pudieron crear los datos de demostración.' });
  }
});

module.exports = router;
