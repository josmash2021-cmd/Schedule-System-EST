import { json } from './_lib/http.mjs';
import { appointmentsStore, getAppointment, appointmentKey } from './_lib/store.mjs';
import { sanitizeAppointment, validateAppointment } from './_lib/validation.mjs';

// POST /.netlify/functions/appointments-create
// Crea una cita nueva si el horario sigue disponible.
export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Método no permitido' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido' }, 400);
  }

  // Honeypot anti-bots: si viene lleno, fingimos éxito sin guardar nada.
  if (body['bot-field']) {
    return json({ ok: true });
  }

  const data = sanitizeAppointment(body);
  const errors = validateAppointment(data);
  if (errors.length > 0) {
    return json({ error: errors.join('. ') }, 400);
  }

  const store = appointmentsStore();
  const existente = await getAppointment(store, data.fecha, data.hora);
  if (existente && existente.estado !== 'cancelada') {
    return json({ error: 'Ese horario ya está ocupado. Elige otro.' }, 409);
  }

  const cita = {
    ...data,
    estado: 'pendiente',
    creadaEn: new Date().toISOString(),
  };
  await store.setJSON(appointmentKey(data.fecha, data.hora), cita);

  return json({ ok: true, cita }, 201);
};
