// Envío de avisos al dueño del negocio por WhatsApp.
import config from './config.js';

/**
 * Envía un mensaje de texto a TODOS los números de aviso (NOTIFY_NUMBERS,
 * o OWNER_NUMBER si aquella no está definida). Si no hay ninguno configurado,
 * solo se registra en consola.
 * @param {object|null} sock - Socket de Baileys (puede ser null en pruebas).
 * @param {string} texto - Mensaje a enviar.
 * @returns {Promise<boolean>} true si se envió al menos a un número.
 */
export async function notificarDueno(sock, texto) {
  const numeros = config.notifyNumbers?.length
    ? config.notifyNumbers
    : (config.ownerNumber ? [config.ownerNumber] : []);

  if (!numeros.length) {
    console.log(`[notificar] NOTIFY_NUMBERS/OWNER_NUMBER no configurados. Aviso solo en consola:\n${texto}`);
    return false;
  }
  if (!sock) {
    console.log(`[notificar] Socket no disponible. Aviso solo en consola:\n${texto}`);
    return false;
  }

  let enviados = 0;
  for (const numero of numeros) {
    try {
      // WhatsApp puede haber migrado el número a direccionamiento LID:
      // enviar al JID de teléfono es rechazado con ack 463 (missing tctoken).
      // Si conocemos el LID mapeado, lo usamos; si no, caemos al JID normal.
      let jid = `${numero}@s.whatsapp.net`;
      try {
        const lid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(jid);
        if (lid) jid = typeof lid === 'string' ? lid : lid?.lid || jid;
      } catch { /* sin mapeo LID disponible, se usa el JID de teléfono */ }
      await sock.sendMessage(jid, { text: texto });
      enviados++;
    } catch (err) {
      console.error(`[notificar] Error al avisar a ${numero}: ${err.message}`);
    }
  }
  return enviados > 0;
}
