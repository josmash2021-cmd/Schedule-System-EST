// Envío de avisos al dueño del negocio por WhatsApp vía CallMeBot (HTTP).
// A diferencia del bot de WhatsApp (wa-bot), este bot NO tiene socket de
// Baileys: los avisos salen por una llamada GET a la API de CallMeBot,
// así el bot de Instagram no depende para nada del bot de WhatsApp.

// Número del dueño que recibe los avisos (con código de país, sin "+").
const NOTIFY_PHONE = (process.env.IG_NOTIFY_PHONE || process.env.OWNER_PHONE || '12055737840')
  .replace(/\D/g, '');
// API key de CallMeBot para ese número (la misma que ya usa el servidor web).
const API_KEY = process.env.IG_CALLMEBOT_API_KEY || process.env.CALLMEBOT_API_KEY || '';

/**
 * Envía un aviso al dueño por WhatsApp (CallMeBot). Si falta la API key,
 * el aviso solo se registra en consola (no rompe el flujo del bot).
 * @param {string} texto - Mensaje a enviar.
 * @returns {Promise<boolean>} true si CallMeBot aceptó el aviso.
 */
export async function notificarDuenoIG(texto) {
  if (!API_KEY) {
    console.log(`[notificar] IG_CALLMEBOT_API_KEY/CALLMEBOT_API_KEY no configurada. Aviso solo en consola:\n${texto}`);
    return false;
  }
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(NOTIFY_PHONE)}` +
      `&text=${encodeURIComponent(texto)}&apikey=${encodeURIComponent(API_KEY)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('[notificar] Aviso al dueño enviado por WhatsApp (CallMeBot).');
    return true;
  } catch (err) {
    console.error(`[notificar] Error al avisar al dueño por CallMeBot: ${err.message}`);
    return false;
  }
}
