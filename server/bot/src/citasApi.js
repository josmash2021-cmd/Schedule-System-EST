// Cliente HTTP para el sistema de citas del sitio web del negocio.
// Endpoints públicos: GET /api/slots y POST /api/appointments.
import config from './config.js';

const TIMEOUT_MS = 10_000;

async function fetchConTimeout(url, opciones = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opciones, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Consulta los horarios libres de un día en el sitio web.
 * @param {string} fecha - Fecha en formato YYYY-MM-DD.
 * @returns {Promise<string[]|null>} Horas libres (ej: ["10:00", "11:30"]),
 *   un array vacío si el día está cerrado o lleno, o null si hubo error de red/HTTP.
 */
export async function consultarSlots(fecha) {
  const url = `${config.websiteApiUrl}/api/slots?date=${encodeURIComponent(fecha)}`;
  let respuesta;
  try {
    respuesta = await fetchConTimeout(url);
  } catch (err) {
    console.error(`[citasApi] Error de red consultando slots: ${err.message}`);
    return null;
  }
  if (!respuesta.ok) {
    // 400 = regla de negocio (domingo, fecha pasada, etc.): se trata como
    // "sin horarios libres". Otros códigos se consideran error del servidor.
    if (respuesta.status === 400) {
      try {
        const data = await respuesta.json();
        console.warn(`[citasApi] Slots no disponibles para ${fecha}: ${data?.error || 'sin detalle'}`);
      } catch { /* cuerpo no JSON */ }
      return [];
    }
    console.error(`[citasApi] GET /api/slots respondió ${respuesta.status}`);
    return null;
  }
  try {
    const data = await respuesta.json();
    if (!data.abierto || !Array.isArray(data.slots)) return [];
    return data.slots.filter((s) => s.disponible).map((s) => s.hora);
  } catch (err) {
    console.error(`[citasApi] Respuesta inválida de /api/slots: ${err.message}`);
    return null;
  }
}

/**
 * Crea una cita en el sistema web (el servidor notifica al dueño por WhatsApp).
 * @param {{nombre: string, telefono: string, correo?: string, servicio: string, fecha: string, hora: string}} cita
 * @returns {Promise<{ok: true}|{ok: false, status: number|null, motivo: string}>}
 *   status 409 = horario ya ocupado; 400 = validación rechazada; null = error de red.
 */
export async function crearCitaWeb(cita) {
  const url = `${config.websiteApiUrl}/api/appointments`;
  // Solo los campos que el backend conoce; campos extra se omiten a propósito.
  const body = {
    nombre: cita.nombre,
    telefono: cita.telefono,
    correo: cita.correo || '',
    servicio: cita.servicio,
    fecha: cita.fecha,
    hora: cita.hora
  };
  let respuesta;
  try {
    respuesta = await fetchConTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error(`[citasApi] Error de red creando cita: ${err.message}`);
    return { ok: false, status: null, motivo: `Error de red: ${err.message}` };
  }
  if (respuesta.status === 201) {
    return { ok: true };
  }
  let motivo = `HTTP ${respuesta.status}`;
  try {
    const data = await respuesta.json();
    if (data && (data.error || data.mensaje || data.message)) {
      motivo = data.error || data.mensaje || data.message;
    }
  } catch {
    // El cuerpo no era JSON; se queda el motivo genérico.
  }
  if (respuesta.status === 409) {
    motivo = 'Horario ocupado';
  }
  console.error(`[citasApi] POST /api/appointments falló: ${motivo}`);
  return { ok: false, status: respuesta.status, motivo };
}
