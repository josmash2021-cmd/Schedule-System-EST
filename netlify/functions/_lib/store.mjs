import { getStore } from '@netlify/blobs';

// Estados posibles de una cita.
export const ESTADOS = ['pendiente', 'confirmada', 'cancelada', 'atendida'];

// La llave es "fecha/hora": un solo slot = una sola cita activa.
export function appointmentKey(fecha, hora) {
  return `${fecha}/${hora}`;
}

export function appointmentsStore() {
  return getStore('appointments');
}

export async function getAppointment(store, fecha, hora) {
  return store.get(appointmentKey(fecha, hora), { type: 'json' });
}

// Lista citas. Si se pasa fecha (YYYY-MM-DD), solo las de ese día; si no, todas.
export async function listAppointments(store, fecha = null) {
  const prefix = fecha ? `${fecha}/` : '';
  const { blobs } = await store.list({ prefix });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
  return items
    .filter(Boolean)
    .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
}
