const express = require('express');
const { pool } = require('../db');
const { validateCreate } = require('../validation');
const { validateDate, validateHora, requireAuth } = require('../utils');
const { sendOwnerSMSNotification, sendClientSMSConfirmation } = require('../notifications');

const router = express.Router();

// Crear cita (público)
router.post('/', async (req, res) => {
  const { errors, nombre, telefono, correo, servicio, fecha, hora } = validateCreate(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  const dateError = validateDate(fecha);
  if (dateError) return res.status(400).json({ error: dateError });

  const horaError = validateHora(hora);
  if (horaError) return res.status(400).json({ error: horaError });

  try {
    const result = await pool.query(
      `INSERT INTO appointments (nombre, telefono, correo, servicio, fecha, hora, estado)
       VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
       ON CONFLICT (fecha, hora) DO NOTHING
       RETURNING *`,
      [nombre, telefono, correo || null, servicio, fecha, hora]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Este horario ya está ocupado. Elige otro.' });
    }

    const cita = result.rows[0];

    // Notificaciones por SMS (no bloqueantes)
    const notificationData = { nombre, telefono, correo, servicio, fecha, hora };
    sendOwnerSMSNotification(notificationData).catch(() => {});
    sendClientSMSConfirmation(notificationData).catch(() => {});

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

module.exports = router;
