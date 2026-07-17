import { json } from './_lib/http.mjs';
import {
  BUSINESS,
  generateSlots,
  todayInBusinessTz,
  nowHHMMInBusinessTz,
  dayOfWeek,
} from './_lib/config.mjs';
import { appointmentsStore, getAppointment } from './_lib/store.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /.netlify/functions/slots?date=YYYY-MM-DD
// Devuelve todos los espacios del día con su disponibilidad.
// Verifica cada slot con get() para evitar inconsistencias de list() en Blobs.
export default async (req) => {
  const url = new URL(req.url);
  const fecha = url.searchParams.get('date');

  if (!fecha || !DATE_RE.test(fecha)) {
    return json({ error: 'Parámetro date requerido con formato YYYY-MM-DD' }, 400);
  }

  const hoy = todayInBusinessTz();
  const abierto = BUSINESS.openDays.includes(dayOfWeek(fecha)) && fecha >= hoy;
  const ahora = fecha === hoy ? nowHHMMInBusinessTz() : null;

  const store = appointmentsStore();
  const citas = await Promise.all(
    generateSlots().map(async (hora) => {
      const cita = await getAppointment(store, fecha, hora);
      return { hora, ocupada: cita && cita.estado !== 'cancelada' };
    })
  );
  const ocupadas = new Set(citas.filter((c) => c.ocupada).map((c) => c.hora));

  const slots = generateSlots().map((hora) => ({
    hora,
    disponible: abierto && !ocupadas.has(hora) && (ahora === null || hora > ahora),
  }));

  return json({ fecha, abierto, slots });
};
