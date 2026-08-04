/* Citas desde el panel (/x/s/appointments) — admin Y trabajadores.
   Es la vía interna: el mostrador atiende a alguien que llama o entra por la
   puerta y le agenda la cita. Por eso no pasa por el rate-limit ni el honeypot
   del POST público, y no exige la hora de anticipación (una cita para el
   siguiente hueco de hoy es justo el caso normal). Lo demás sí se respeta:
   días pasados, domingos, ventana de 60 días y la rejilla de 30 minutos.

   Editar y borrar citas siguen siendo solo del admin, en /api/appointments. */
const express = require('express');
const { pool } = require('../db');
const { generateSlots, validateDate, validateHora } = require('../utils');
const { verifyToken, loadUser } = require('../middleware/auth');
const audit = require('../models/audit');
const { getClientIp } = require('../lib/rateLimit');

const router = express.Router();
router.use(verifyToken, loadUser); // admin + trabajadores

const ESTADOS = ['pendiente', 'confirmada', 'atendida', 'cancelada'];
const SELECT_COLS = `id, nombre, telefono, correo, direccion, servicio,
  fecha::text AS fecha, hora::text AS hora, estado, created_at`;

// Listado: ?date=YYYY-MM-DD para un día, sin parámetro para todas.
router.get('/', async (req, res) => {
  const date = String(req.query.date || '').trim();
  try {
    const filtra = /^\d{4}-\d{2}-\d{2}$/.test(date);
    const r = await pool.query(
      `SELECT ${SELECT_COLS} FROM appointments${filtra ? ' WHERE fecha = $1' : ''}
       ORDER BY fecha DESC, hora DESC`,
      filtra ? [date] : []
    );
    res.json({ citas: r.rows });
  } catch (err) {
    console.error('GET /x/s/appointments error:', err.message);
    res.status(500).json({ error: 'Error al listar citas.' });
  }
});

// Horarios de un día con su estado, para que el formulario no ofrezca huecos
// ya tomados (el índice único los rechazaría con un 409).
router.get('/slots', async (req, res) => {
  const date = String(req.query.date || '').trim();
  const dateError = validateDate(date);
  if (dateError) return res.status(400).json({ error: dateError });
  try {
    const r = await pool.query(
      "SELECT to_char(hora, 'HH24:MI') AS hora FROM appointments WHERE fecha = $1 AND estado <> 'cancelada'",
      [date]
    );
    const ocupados = new Set(r.rows.map((x) => x.hora));
    res.json({ date, slots: generateSlots().map((hora) => ({ hora, ocupado: ocupados.has(hora) })) });
  } catch (err) {
    console.error('GET /x/s/appointments/slots error:', err.message);
    res.status(500).json({ error: 'Error al consultar horarios.' });
  }
});

router.post('/', async (req, res) => {
  const s = (v) => String(v ?? '').trim();
  const nombre = s(req.body?.nombre);
  const telefono = s(req.body?.telefono);
  const correo = s(req.body?.correo);
  const servicio = s(req.body?.servicio);
  const fecha = s(req.body?.fecha);
  const hora = s(req.body?.hora).slice(0, 5);

  if (!nombre) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
  if (!telefono) return res.status(400).json({ error: 'El teléfono es obligatorio.' });
  if (!servicio) return res.status(400).json({ error: 'El servicio es obligatorio.' });

  const dateError = validateDate(fecha);
  if (dateError) return res.status(400).json({ error: dateError });
  const horaError = validateHora(hora);
  if (horaError) return res.status(400).json({ error: horaError });

  try {
    const r = await pool.query(
      // El índice único es PARCIAL (estado <> 'cancelada'): el ON CONFLICT
      // debe repetir ese predicado para coincidir con él.
      `INSERT INTO appointments (nombre, telefono, correo, servicio, fecha, hora, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (fecha, hora) WHERE estado <> 'cancelada' DO NOTHING
       RETURNING ${SELECT_COLS}`,
      [nombre, telefono, correo || null, servicio, fecha, hora,
        ESTADOS.includes(req.body?.estado) ? req.body.estado : 'confirmada']
    );
    if (!r.rows.length) return res.status(409).json({ error: 'Ese horario ya está ocupado. Elige otro.' });
    audit.logAction(req.user.id, 'cita.create', {
      targetType: 'cita', targetId: String(r.rows[0].id), ip: getClientIp(req),
      metadata: { fecha, hora, servicio },
    });
    res.status(201).json({ ok: true, cita: r.rows[0] });
  } catch (err) {
    console.error('POST /x/s/appointments error:', err.message);
    res.status(500).json({ error: 'No se pudo crear la cita.' });
  }
});

// Cambiar el estado (confirmada / atendida / cancelada…). El resto de la
// edición y el borrado siguen siendo del admin.
router.patch('/:id/estado', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Cita no encontrada.' });
  const estado = String(req.body?.estado || '');
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });
  try {
    const r = await pool.query(
      `UPDATE appointments SET estado = $1 WHERE id = $2 RETURNING ${SELECT_COLS}`,
      [estado, id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Cita no encontrada.' });
    audit.logAction(req.user.id, 'cita.estado', {
      targetType: 'cita', targetId: String(id), ip: getClientIp(req), metadata: { estado },
    });
    res.json({ ok: true, cita: r.rows[0] });
  } catch (err) {
    console.error('PATCH /x/s/appointments/:id/estado error:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la cita.' });
  }
});

module.exports = router;
