const express = require('express');
const { pool } = require('../db');
const { validateCreate } = require('../validation');
const { validateDate, validateHora, requireAuth, isSlotBookable } = require('../utils');
const { sendOwnerWhatsAppNotification } = require('../notifications');

const router = express.Router();

// Rate limit del POST público de citas: sin él, un bot puede llenar la
// agenda de citas basura (y disparar un WhatsApp al dueño por cada una).
// Máx. 10 creaciones por hora por IP.
const POST_LIMITE = 10;
const POST_VENTANA_MS = 60 * 60 * 1000;
const intentosPorIp = new Map();

setInterval(() => {
  const ahora = Date.now();
  for (const [ip, reg] of intentosPorIp) {
    if (reg.resetAt < ahora) intentosPorIp.delete(ip);
  }
}, 60_000).unref();

function ipDe(req) {
  // El ÚLTIMO valor de X-Forwarded-For es el que añade el proxy (Railway);
  // el primero lo puede falsear el cliente.
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || req.socket?.remoteAddress || 'unknown';
}

function rateLimitCitas(req, res, next) {
  const ip = ipDe(req);
  const ahora = Date.now();
  let reg = intentosPorIp.get(ip);
  if (!reg || reg.resetAt < ahora) {
    reg = { count: 0, resetAt: ahora + POST_VENTANA_MS };
    intentosPorIp.set(ip, reg);
  }
  reg.count += 1;
  if (reg.count > POST_LIMITE) {
    return res.status(429).json({ error: 'Demasiadas reservas seguidas. Intenta de nuevo en un rato.' });
  }
  next();
}

// Crear cita (público)
router.post('/', rateLimitCitas, async (req, res) => {
  // Honeypot anti-bots: el frontend lo deja vacío; los bots lo rellenan.
  // Se finge éxito para no darles pistas, pero no se crea nada.
  if (String(req.body?.['bot-field'] || '').trim() !== '') {
    console.warn(`[citas] Honeypot activado (bot descartado) desde ${ipDe(req)}`);
    return res.status(201).json({ ok: true, cita: null });
  }

  const { errors, nombre, telefono, correo, servicio, fecha, hora } = validateCreate(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  const dateError = validateDate(fecha);
  if (dateError) return res.status(400).json({ error: dateError });

  const horaError = validateHora(hora);
  if (horaError) return res.status(400).json({ error: horaError });

  // Mismo día: exigir al menos 1 hora de anticipación
  if (!isSlotBookable(fecha, hora)) {
    return res.status(400).json({ error: 'Ese horario ya no está disponible. Reserva con al menos 1 hora de anticipación.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO appointments (nombre, telefono, correo, servicio, fecha, hora, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
       ON CONFLICT (fecha, hora) WHERE estado <> 'cancelada' DO NOTHING
       RETURNING *`,
      [nombre, telefono, correo || null, servicio, fecha, hora]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Este horario ya está ocupado. Elige otro.' });
    }

    const cita = result.rows[0];

    // Notificación al dueño por WhatsApp (no bloqueante)
    const notificationData = { nombre, telefono, correo, servicio, fecha, hora };
    sendOwnerWhatsAppNotification(notificationData).catch(() => {});

    res.status(201).json({ ok: true, cita });
  } catch (err) {
    console.error('Error POST /api/appointments:', err);
    res.status(500).json({ error: 'Error al guardar la cita.' });
  }
});

// Listar citas (admin)
router.get('/', requireAuth, async (req, res) => {
  const date = String(req.query.date || '').trim();
  try {
    let query = 'SELECT id, nombre, telefono, correo, direccion, servicio, fecha::text as fecha, hora::text as hora, estado, created_at FROM appointments';
    const params = [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      query += ' WHERE fecha = $1';
      params.push(date);
    }
    query += ' ORDER BY fecha DESC, hora DESC';

    const result = await pool.query(query, params);
    res.json({ citas: result.rows });
  } catch (err) {
    console.error('Error GET /api/appointments:', err);
    res.status(500).json({ error: 'Error al listar citas.' });
  }
});

// Eliminar todas las citas (admin)
router.delete('/', requireAuth, async (_req, res) => {
  try {
    await pool.query('DELETE FROM appointments');
    res.json({ ok: true, message: 'Todas las citas han sido eliminadas.' });
  } catch (err) {
    console.error('Error DELETE /api/appointments:', err);
    res.status(500).json({ error: 'Error al eliminar citas.' });
  }
});

// Actualizar estado (admin)
router.patch('/', requireAuth, async (req, res) => {
  const { fecha, hora, estado } = req.body;
  const validStates = ['pendiente', 'confirmada', 'atendida', 'cancelada'];

  if (!fecha || !hora || !validStates.includes(estado)) {
    return res.status(400).json({ error: 'Datos inválidos.' });
  }

  try {
    const result = await pool.query(
      'UPDATE appointments SET estado = $1 WHERE fecha = $2 AND hora = $3 RETURNING *',
      [estado, fecha, hora]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }
    res.json({ ok: true, cita: result.rows[0] });
  } catch (err) {
    console.error('Error PATCH /api/appointments:', err);
    res.status(500).json({ error: 'Error al actualizar la cita.' });
  }
});

// Editar una cita (admin). Acepta cualquier subconjunto de campos.
router.patch('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });

  const validStates = ['pendiente', 'confirmada', 'atendida', 'cancelada'];
  const s = (v) => String(v ?? '').trim();
  const fields = {};

  if (req.body.nombre !== undefined) {
    if (!s(req.body.nombre)) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    fields.nombre = s(req.body.nombre);
  }
  if (req.body.telefono !== undefined) {
    if (!s(req.body.telefono)) return res.status(400).json({ error: 'El teléfono es obligatorio.' });
    fields.telefono = s(req.body.telefono);
  }
  if (req.body.correo !== undefined) fields.correo = s(req.body.correo) || null;
  if (req.body.servicio !== undefined) {
    if (!s(req.body.servicio)) return res.status(400).json({ error: 'El servicio es obligatorio.' });
    fields.servicio = s(req.body.servicio);
  }
  if (req.body.fecha !== undefined) {
    // Edición admin: solo se exige formato (no reglas de reserva como
    // "no pasado" o "no domingo", la cita ya existe).
    const f = s(req.body.fecha);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || isNaN(Date.parse(f))) {
      return res.status(400).json({ error: 'Fecha inválida.' });
    }
    fields.fecha = f;
  }
  if (req.body.hora !== undefined) {
    const h = s(req.body.hora).slice(0, 5);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) {
      return res.status(400).json({ error: 'Hora inválida.' });
    }
    fields.hora = h;
  }
  if (req.body.estado !== undefined) {
    if (!validStates.includes(req.body.estado)) return res.status(400).json({ error: 'Estado inválido.' });
    fields.estado = req.body.estado;
  }

  const keys = Object.keys(fields);
  if (!keys.length) return res.status(400).json({ error: 'Nada que actualizar.' });

  try {
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const result = await pool.query(
      `UPDATE appointments SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
      [...keys.map((k) => fields[k]), id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cita no encontrada.' });
    res.json({ ok: true, cita: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya hay una cita en esa fecha y hora.' });
    console.error('Error PATCH /api/appointments/:id:', err);
    res.status(500).json({ error: 'Error al actualizar la cita.' });
  }
});

// Eliminar una cita (admin)
router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const result = await pool.query('DELETE FROM appointments WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cita no encontrada.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error DELETE /api/appointments/:id:', err);
    res.status(500).json({ error: 'Error al eliminar la cita.' });
  }
});

module.exports = router;
