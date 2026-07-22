// Cliente mínimo de la API de Instagram Messaging (Graph API de Meta).
// Sin IG_ACCESS_TOKEN los envíos solo se loguean ("envío simulado") y no
// rompen: permite desarrollar y probar el flujo sin credenciales de Meta.
import crypto from 'node:crypto';
import config, { igConfigurado } from './config.js';

async function postIG(cuerpo) {
  if (!igConfigurado()) {
    console.log(`[ig] envío simulado (falta IG_ACCESS_TOKEN): ${JSON.stringify(cuerpo)}`);
    return { simulado: true };
  }
  // Tokens de "API setup with Instagram login" (IGAA...) usan el host
  // graph.instagram.com (no graph.facebook.com).
  const url = `https://graph.instagram.com/${config.instagram.graphVersion}/me/messages` +
    `?access_token=${encodeURIComponent(config.instagram.accessToken)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    // Sin timeout, un cuelgue de la Graph API deja mudo al chat (cola serial).
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`Graph API respondió ${r.status}: ${detalle.slice(0, 300)}`);
  }
  return r.json().catch(() => ({}));
}

/** Envía un mensaje de texto a un usuario de Instagram (IGSID). */
export async function enviarTextoIG(igsid, texto) {
  return postIG({ recipient: { id: igsid }, message: { text: texto } });
}

/**
 * Envía una imagen por URL. La API no admite caption junto a la imagen,
 * así que el caption (si viene) se manda antes como mensaje de texto.
 */
export async function enviarImagenIG(igsid, url, caption) {
  if (caption) {
    await enviarTextoIG(igsid, caption);
  }
  return postIG({
    recipient: { id: igsid },
    message: { attachment: { type: 'image', payload: { url, is_reusable: true } } }
  });
}

/** Sender actions: 'mark_seen', 'typing_on', 'typing_off'. */
export async function accionIG(igsid, accion) {
  return postIG({ recipient: { id: igsid }, sender_action: accion });
}

/**
 * Envía un audio por URL pública (la API de Meta no acepta subir el
 * archivo directo: debe ser una URL https accesible, ej. /voz/*.m4a).
 */
export async function enviarAudioIG(igsid, url) {
  return postIG({
    recipient: { id: igsid },
    message: { attachment: { type: 'audio', payload: { url, is_reusable: true } } }
  });
}

/**
 * Verifica la firma X-Hub-Signature-256 del webhook (HMAC-SHA256 del body
 * crudo con el app secret). Sin IG_APP_SECRET configurada se advierte y se
 * acepta el evento (modo desarrollo).
 */
export function verificarFirmaIG(rawBody, signatureHeader) {
  const secreto = config.instagram.appSecret;
  if (!secreto) {
    // Fail-closed en producción: aceptar eventos sin firma deja el webhook
    // (URL predecible) abierto a eventos falsos. En desarrollo se advierte.
    if (process.env.NODE_ENV === 'production') {
      console.error('[ig] IG_APP_SECRET no configurada: evento RECHAZADO (firma no verificable).');
      return false;
    }
    console.warn('[ig] IG_APP_SECRET no configurada: evento aceptado sin verificar firma (solo desarrollo).');
    return true;
  }
  if (!rawBody || !signatureHeader) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(rawBody).digest('hex');
  const a = Buffer.from(esperada);
  const b = Buffer.from(String(signatureHeader));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Adaptador de canal de Instagram para las herramientas del cerebro
 * (src/ai.js): misma interfaz que crearCanalWhatsApp (src/canal.js).
 * El destino queda fijo en el IGSID de la conversación.
 */
export function crearCanalIG(igsid) {
  return {
    enviarTexto: (_destino, texto) => enviarTextoIG(igsid, texto),
    enviarImagen: (_destino, url, caption) => enviarImagenIG(igsid, url, caption)
  };
}
