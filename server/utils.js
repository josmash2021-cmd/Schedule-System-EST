const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

const OPEN_HOUR = 10;
const CLOSE_HOUR = 15;
const SLOT_MINUTES = 30;

function generateSlots() {
  const slots = [];
  const totalMinutes = (CLOSE_HOUR - OPEN_HOUR) * 60;
  for (let m = 0; m <= totalMinutes; m += SLOT_MINUTES) {
    const h = OPEN_HOUR + Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return slots;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSunday(dateStr) {
  return new Date(dateStr + 'T00:00:00').getDay() === 0;
}

function isPastDate(dateStr) {
  const today = toISODate(new Date());
  return dateStr < today;
}

function validateDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'Formato de fecha inválido.';
  if (isNaN(Date.parse(dateStr))) return 'Fecha inválida.';
  if (isPastDate(dateStr)) return 'No se pueden reservar citas en días pasados.';
  if (isSunday(dateStr)) return 'No atendemos los domingos.';
  return null;
}

function validateHora(hora) {
  const slots = generateSlots();
  if (!slots.includes(hora)) return 'Horario no válido.';
  return null;
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      throw new Error('Rol inválido');
    }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'No autorizado' });
  }
}

module.exports = {
  generateSlots,
  toISODate,
  isSunday,
  isPastDate,
  validateDate,
  validateHora,
  requireAuth,
};
