// Configuración central del negocio. Ajusta aquí horarios, duración y servicios.
export const BUSINESS = {
  timezone: 'America/Chicago', // Hoover, AL
  openDays: [1, 2, 3, 4, 5, 6], // 0 = domingo; lunes a sábado
  openTime: '10:00',
  closeTime: '15:00',
  slotMinutes: 30,
  services: [
    'Consulta',
    'Revision',
    'Reparacion',
    'Mantenimiento',
    'Configuracion',
    'Instalacion',
    'Diagnostico',
    'Servicios',
    'Presupuesto',
    'Factura',
    'Pedido',
    'Nota de Entrega',
    'Informe',
    'Formulario',
  ],
};

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// Genera los espacios de cita del día según openTime/closeTime/slotMinutes.
// Función pura: no depende de red ni de la fecha actual.
export function generateSlots() {
  const slots = [];
  const open = toMinutes(BUSINESS.openTime);
  const close = toMinutes(BUSINESS.closeTime);
  for (let t = open; t + BUSINESS.slotMinutes <= close; t += BUSINESS.slotMinutes) {
    slots.push(toHHMM(t));
  }
  return slots;
}

// "Hoy" en la zona horaria del negocio, formato YYYY-MM-DD.
export function todayInBusinessTz() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS.timezone }).format(new Date());
}

// Hora actual "HH:MM" (24h) en la zona horaria del negocio.
export function nowHHMMInBusinessTz() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

// Día de la semana (0 = domingo) de una fecha YYYY-MM-DD, sin ambigüedad de zona horaria.
export function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}
