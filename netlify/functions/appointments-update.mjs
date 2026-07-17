import { json } from './_lib/http.mjs';
import { requireAdmin } from './_lib/auth.mjs';
import { appointmentsStore, getAppointment, appointmentKey, ESTADOS } from './_lib/store.mjs';

// PATCH /.netlify/functions/appointments-update
// Cambia el estado de una cita. Requiere Authorization: Bearer <ADMIN_TOKEN>.
// Body: { fecha, hora, estado }
export default async (req) => {
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (req.method !== 'PATCH') {
    return json({ error: 'Método no permitido' }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo JSON inválido' }, 400);
  }

  const { fecha, hora, estado } = body;
  if (!fecha || !hora || !ESTADOS.includes(estado)) {
    return json({ error: `Se requiere fecha, hora y estado (${ESTADOS.join(', ')})` }, 400);
  }

  const store = appointmentsStore();
  const cita = await getAppointment(store, fecha, hora);
  if (!cita) {
    return json({ error: 'Cita no encontrada' }, 404);
  }

  const actualizada = { ...cita, estado, actualizadaEn: new Date().toISOString() };
  await store.setJSON(appointmentKey(fecha, hora), actualizada);

  return json({ ok: true, cita: actualizada });
};
