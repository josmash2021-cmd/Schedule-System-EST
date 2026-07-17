import { json } from './_lib/http.mjs';
import { requireAdmin } from './_lib/auth.mjs';
import { appointmentsStore, listAppointments } from './_lib/store.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /.netlify/functions/appointments-list[?date=YYYY-MM-DD]
// Lista citas (todas o de un día). Requiere Authorization: Bearer <ADMIN_TOKEN>.
export default async (req) => {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const fecha = url.searchParams.get('date');

  if (fecha && !DATE_RE.test(fecha)) {
    return json({ error: 'Parámetro date inválido (YYYY-MM-DD)' }, 400);
  }

  const store = appointmentsStore();
  const citas = await listAppointments(store, fecha);
  return json({ citas });
};
