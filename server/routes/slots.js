const express = require('express');
const { pool } = require('../db');
const { generateSlots, validateDate, isSlotBookable } = require('../utils');

const router = express.Router();

router.get('/', async (req, res) => {
  const date = String(req.query.date || '').trim();
  const dateError = validateDate(date);
  if (dateError) {
    return res.status(400).json({ error: dateError });
  }

  try {
    const result = await pool.query(
      // to_char 'HH24:MI': TIME::text devuelve 'HH:MM:SS' y jamás
      // coincidiría con los slots 'HH:MM' de generateSlots() — bug que
      // mostraba los horarios ocupados como disponibles.
      "SELECT to_char(hora, 'HH24:MI') as hora FROM appointments WHERE fecha = $1 AND estado != $2",
      [date, 'cancelada']
    );
    const booked = new Set(result.rows.map(r => r.hora));
    const allSlots = generateSlots();
    const slots = allSlots
      .filter(hora => !booked.has(hora))
      .filter(hora => isSlotBookable(date, hora))
      .map(hora => ({ hora, disponible: true }));

    res.json({ abierto: true, date, slots });
  } catch (err) {
    console.error('Error /api/slots:', err);
    res.status(500).json({ error: 'Error al consultar disponibilidad.' });
  }
});

module.exports = router;
