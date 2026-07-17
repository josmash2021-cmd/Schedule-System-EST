import { BUSINESS, generateSlots, todayInBusinessTz, nowHHMMInBusinessTz, dayOfWeek } from './config.mjs';

const REQUIRED_FIELDS = ['nombre', 'telefono', 'fecha', 'hora', 'servicio'];
const OPTIONAL_FIELDS = ['direccion', 'correo'];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
const PHONE_RE = /^(\+1\s?)?(\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LEN = 200;

// Limpia el payload: recorta espacios y limita longitudes.
export function sanitizeAppointment(data) {
  const clean = {};
  for (const field of ALL_FIELDS) {
    clean[field] = typeof data[field] === 'string' ? data[field].trim().slice(0, MAX_LEN) : '';
  }
  return clean;
}

// Devuelve un array de errores (vacío si el payload es válido).
export function validateAppointment(data) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (!data[field]) errors.push(`Falta el campo: ${field}`);
  }
  if (errors.length > 0) return errors;

  if (!PHONE_RE.test(data.telefono)) errors.push('Teléfono inválido. Usa un formato válido de EE.UU.');

  if (!DATE_RE.test(data.fecha) || Number.isNaN(Date.parse(`${data.fecha}T00:00:00Z`))) {
    errors.push('Fecha inválida');
  } else {
    if (!BUSINESS.openDays.includes(dayOfWeek(data.fecha))) {
      errors.push('El negocio no abre ese día (atendemos de lunes a sábado)');
    }
    if (data.fecha < todayInBusinessTz()) {
      errors.push('La fecha ya pasó');
    } else if (data.fecha === todayInBusinessTz() && data.hora && data.hora <= nowHHMMInBusinessTz()) {
      errors.push('Esa hora ya pasó, elige otra');
    }
  }

  if (!generateSlots().includes(data.hora)) {
    errors.push('La hora está fuera del horario de atención');
  }

  if (!BUSINESS.services.includes(data.servicio)) {
    errors.push('Servicio no válido');
  }

  return errors;
}
