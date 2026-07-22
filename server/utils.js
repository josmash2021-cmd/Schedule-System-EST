const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

const OPEN_HOUR = 10;
const CLOSE_HOUR = 15;
const SLOT_MINUTES = 30;
const BUSINESS_TZ = 'America/Chicago';
const LEAD_MINUTES = 60; // mismo día: reservable solo con 1 h de anticipación

// "Ahora" en la zona horaria del negocio: { dateStr: 'YYYY-MM-DD', minutes: minutos desde medianoche }
function businessNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return {
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute)
  };
}

// ¿Se puede reservar ese slot? Para hoy exige LEAD_MINUTES de anticipación.
function isSlotBookable(dateStr, hora, now = businessNow()) {
  if (dateStr !== now.dateStr) return true;
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m >= now.minutes + LEAD_MINUTES;
}

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
  return dateStr < businessNow().dateStr;
}

// Ventana máxima de reserva: sin límite, un script podría reservar todos
// los slots de cualquier fecha futura y bloquear la agenda real.
const MAX_DIAS_FUTURO = 60;

function isTooFarAhead(dateStr) {
  const limite = new Date(Date.now() + MAX_DIAS_FUTURO * 24 * 3600 * 1000);
  return dateStr > toISODate(limite);
}

function validateDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 'Formato de fecha inválido.';
  if (isNaN(Date.parse(dateStr))) return 'Fecha inválida.';
  if (isPastDate(dateStr)) return 'No se pueden reservar citas en días pasados.';
  if (isSunday(dateStr)) return 'No atendemos los domingos.';
  if (isTooFarAhead(dateStr)) return `Solo se puede reservar con hasta ${MAX_DIAS_FUTURO} días de anticipación.`;
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
  businessNow,
  isSlotBookable,
  LEAD_MINUTES,
};
