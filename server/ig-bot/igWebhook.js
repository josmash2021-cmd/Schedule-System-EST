// Webhook de Instagram Messaging (API oficial de Meta) para el bot Angel.
// Bot independiente: website-est/server/index.js lo monta con import
// dinámico (este módulo es ESM, el servidor es CommonJS). Los avisos al
// dueño salen por CallMeBot HTTP (src/notificar.js), sin depender del
// bot de WhatsApp (wa-bot).
//
// Rutas:
//   GET  /api/instagram/webhook  — verificación de Meta (hub.challenge)
//   POST /api/instagram/webhook  — eventos de mensajería (responde 200 ya)
import express from 'express';
import path from 'node:path';
import config from './src/config.js';
import { responder, iaDisponible, esPrimeraVez, inactividadMs, cerrarSesion, sembrarSaludoVoz } from './src/ai.js';
import { encolar } from './src/cola.js';
import { transcribirAudio, transcripcionDisponible } from './src/transcribir.js';
import { enviarTextoIG, enviarAudioIG, accionIG, verificarFirmaIG, crearCanalIG } from './src/instagram.js';
import { notificarDuenoIG } from './src/notificar.js';
// La voz de bienvenida la genera el módulo compartido del wa-bot
// (mismos audios cacheados en DATA_DIR/voz, servidos públicos en /voz/).
import { vozDisponible, obtenerM4aBienvenida } from '../wa-bot/src/voz.js';

const router = express.Router();

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// URL pública del servidor (para adjuntar el audio a Instagram: la API de
// Meta no acepta subir archivos, solo URLs https accesibles).
const BASE_PUBLICA = (process.env.PUBLIC_BASE_URL || 'https://schedule-system-est-production.up.railway.app').replace(/\/+$/, '');

// Saludos típicos de apertura ("hola", "buenas noches", "buen día", ...).
// Misma regla que en WhatsApp: si un cliente vuelve a saludar tras un
// rato largo sin escribir, se le manda otra vez la bienvenida de voz.
const SALUDO_RE = /^\s*(hola+|o-la|buen[ao]s?(?:\s+(d[íi]as|tardes|noches))?|buen\s*d[íi]a|qu[eé]\s*tal|saludos|hey|hi|hello)\b/i;

function esSaludo(texto) {
  return SALUDO_RE.test(texto || '');
}

// Mensaje que es SOLO un saludo, sin pregunta ni contenido ("hola",
// "hola buenas noches!", "buenas"...). Si ya se mandó la nota de voz de
// bienvenida, no hace falta responder nada por texto.
const SOLO_SALUDO_RE = /^\s*(?:(?:hola+|o-la|buen[ao]s?(?:\s+(?:d[íi]as|tardes|noches|d[íi]a))?|buen\s*d[íi]a|qu[eé]\s*tal|saludos|hey|hi|hello)[\s!¡?¿.,]*)+$/i;

function esSoloSaludo(texto) {
  return SOLO_SALUDO_RE.test(texto || '');
}

// Petición de empezar de cero ("cierra esta sesión", "hablemos como una
// nueva conversación", "empezar de cero", ...). Se respeta aunque venga
// con faltas de ortografía.
const REINICIO_RE = /(cierr\w*\s+(la\s+|esta\s+)?sesi[oó]n|cerrar\s+sesi[oó]n|nueva\s+conversaci[oó]n|empez\w*\s+de\s+(cero|nuevo)|reinici\w*)/i;

function esReinicio(texto) {
  return REINICIO_RE.test(texto || '');
}

// Inactividad mínima para repetir la bienvenida de voz ante un saludo.
const INACTIVIDAD_SALUDO_MS = 3 * 60 * 60 * 1000; // 3 horas

// Antispam de la nota de voz: aunque el cliente salude varias veces
// seguidas, máximo 1 audio de bienvenida cada 15 min por chat.
const ANTISPAM_VOZ_MS = 15 * 60 * 1000;
const ultimaVozPorChat = new Map();

// Dedup por message.mid: Meta reintenta la entrega si algo falla y el mismo
// mensaje no debe procesarse dos veces. Set con tope de 1000 entradas.
const midsVistos = new Set();
function yaProcesado(mid) {
  if (!mid) return false;
  if (midsVistos.has(mid)) return true;
  midsVistos.add(mid);
  if (midsVistos.size > 1000) {
    midsVistos.delete(midsVistos.values().next().value); // el más antiguo
  }
  return false;
}

// Contexto para el cerebro (src/ai.js). No hay socket de WhatsApp: los
// avisos al dueño salen por CallMeBot HTTP (src/notificar.js), así que
// `sock` va en null y no se usa.
function contextoIG(igsid) {
  return {
    telefono: '', // Instagram no proporciona el teléfono del usuario
    jid: `ig:${igsid}`,
    sock: null,
    canal: crearCanalIG(igsid),
    canalTipo: 'instagram'
  };
}

// Llama al cerebro y envía la respuesta como burbujas de Instagram
// (misma convención que WhatsApp: ||| separa mensajes, máximo 3).
// Sin API key del LLM: fallback amable y aviso al dueño (una vez por usuario).
const avisadosSinIA = new Set();
async function responderYEnviar(igsid, texto) {
  let respuesta;
  if (iaDisponible()) {
    respuesta = await responder(`ig:${igsid}`, texto, contextoIG(igsid));
  } else {
    respuesta =
      '¡Hola! 👋 En este momento nuestro asistente automático no está disponible, ' +
      'pero ya dejé tu mensaje con el supervisor y te contactamos muy pronto. Gracias por tu paciencia. 🙏';
    if (!avisadosSinIA.has(igsid)) {
      avisadosSinIA.add(igsid);
      await notificarDuenoIG(
        `⚠️ Cliente de Instagram esperando atención (IA no configurada)\n` +
        `👤 IGSID: ${igsid}\n💬 Mensaje: ${texto}`
      );
    }
  }

  const partes = String(respuesta)
    .split('|||')
    .map((s) => s.trim())
    .filter(Boolean);
  // Máximo 3 burbujas, pero NADA se tira: si la IA manda más, las
  // sobrantes se fusionan en la tercera (antes se cortaban y los
  // mensajes llegaban incompletos).
  const burbujas = partes.length <= 3
    ? partes
    : [...partes.slice(0, 2), partes.slice(2).join('\n')];
  for (const burbuja of burbujas) {
    await accionIG(igsid, 'typing_on');
    await esperar(800 + Math.min(burbuja.length * 25, 2500));
    await enviarTextoIG(igsid, burbuja);
  }
  await accionIG(igsid, 'typing_off');
  console.log(`[ig] Respuesta enviada a ${igsid} (${burbujas.length} burbuja(s))`);
}

// Ritmo humano igual que en WhatsApp: a los 5s marca leído, a los 7s
// "escribiendo...", y la respuesta llega en burbujas.
async function manejarTexto(igsid, texto) {
  console.log(`[ig] ${igsid}: ${texto}`);
  try {
    // Reinicio a petición del cliente: la sesión se cierra y ESTE mensaje
    // ya se procesa como el primero de una conversación nueva (con la
    // bienvenida de voz, si está activa).
    if (esReinicio(texto) && cerrarSesion(`ig:${igsid}`)) {
      console.log(`[ig] Sesión reiniciada a petición del cliente: ${igsid}`);
    }

    await esperar(5000);
    await accionIG(igsid, 'mark_seen');
    await esperar(2000);

    // Bienvenida por nota de voz (misma regla que WhatsApp): primera vez
    // que escribe, cuando vuelve a SALUDAR tras 3+ horas sin actividad,
    // o cuando el saludo incluye la hora del día ("hola buenas tardes",
    // "buenos días"...) aunque la sesión siga activa.
    // Antispam: máximo 1 nota de voz cada 15 min por chat.
    // El saludo ("buenos días/tardes/noches") depende de la hora del
    // negocio. Si falla, la IA saluda por texto como antes.
    const saludoConHora = /(buenos\s+d[íi]as|buenas\s+tardes|buenas\s+noches|buen\s+d[íi]a)/i.test(texto);
    const vozReciente = (Date.now() - (ultimaVozPorChat.get(igsid) || 0)) < ANTISPAM_VOZ_MS;
    const tocaVoz =
      !vozReciente &&
      (esPrimeraVez(`ig:${igsid}`) ||
        (esSaludo(texto) && inactividadMs(`ig:${igsid}`) > INACTIVIDAD_SALUDO_MS) ||
        saludoConHora);
    if (tocaVoz && vozDisponible()) {
      try {
        const audio = await obtenerM4aBienvenida();
        if (audio) {
          const url = `${BASE_PUBLICA}/voz/${path.basename(audio.ruta)}`;
          await enviarAudioIG(igsid, url);
          ultimaVozPorChat.set(igsid, Date.now());
          console.log(`[ig] Nota de voz de bienvenida enviada a ${igsid} (${audio.saludo})`);

          // Si el cliente SOLO saludó ("hola", "buenas noches"...), la
          // nota de voz ya cubre el saludo: NO se manda texto repetido.
          // Queda sembrado en el historial para que la IA tenga contexto.
          // (Si luego dice que no la escuchó, la IA se lo escribe.)
          if (esSoloSaludo(texto)) {
            sembrarSaludoVoz(`ig:${igsid}`, audio.saludo);
            console.log('[ig] Saludo cubierto por la nota de voz; no se envía texto.');
            return;
          }
        }
      } catch (err) {
        console.error(`[ig] No se pudo enviar la bienvenida de voz: ${err.message}`);
      }
    }

    await accionIG(igsid, 'typing_on');
    await responderYEnviar(igsid, texto);
  } catch (err) {
    console.error(`[ig] Error al procesar texto de ${igsid}: ${err.message}`);
    await accionIG(igsid, 'typing_off').catch(() => {});
    try {
      await enviarTextoIG(igsid, 'Lo siento, tuve un problema técnico. 😅 Ya le avisé al supervisor y te contactamos muy pronto. 🙏');
    } catch { /* si falla el envío, solo queda el log */ }
  }
}

// Nota de voz: mismos tiempos que en WhatsApp, luego se descarga el audio
// y se transcribe para procesarlo como texto.
async function manejarAudio(igsid, audio) {
  if (!transcripcionDisponible()) {
    await enviarTextoIG(igsid, '¡Hola! Por ahora no puedo escuchar notas de voz 😅 ¿me lo escribes en texto porfa?');
    return;
  }
  try {
    await esperar(5000);
    await accionIG(igsid, 'mark_seen');
    // "Escuchar" el audio por su duración (tope 120s; si no viene, 10s).
    const duracionSeg = Math.min(Number(audio.payload?.duration) || 10, 120);
    await esperar(duracionSeg * 1000);
    await esperar(3000);
    await accionIG(igsid, 'typing_on');

    const url = audio.payload?.url;
    if (!url) throw new Error('attachment de audio sin URL');
    const r = await fetch(url);
    if (!r.ok) throw new Error(`descarga del audio falló (HTTP ${r.status})`);
    const buffer = Buffer.from(await r.arrayBuffer());
    const texto = await transcribirAudio(buffer, 'audio/mp4');
    console.log(`[ig] Nota de voz de ${igsid} transcrita: "${texto}"`);
    if (!texto) {
      await accionIG(igsid, 'typing_off').catch(() => {});
      await enviarTextoIG(igsid, 'No alcancé a entender bien el audio 😅 ¿me lo repites por texto?');
      return;
    }
    await responderYEnviar(igsid, texto);
  } catch (err) {
    console.error(`[ig] Error al transcribir nota de voz de ${igsid}: ${err.message}`);
    await accionIG(igsid, 'typing_off').catch(() => {});
    try {
      await enviarTextoIG(igsid, 'Tuve un problema para escuchar tu audio 😅 ¿me lo escribes en texto porfa?');
    } catch { /* solo queda el log */ }
  }
}

function procesarEvento(evento) {
  const mensaje = evento.message;
  if (!mensaje || mensaje.is_echo) return; // ecos: mensajes enviados por la propia página
  if (yaProcesado(mensaje.mid)) {
    console.log(`[ig] Evento duplicado ignorado (mid ${mensaje.mid}).`);
    return;
  }
  const igsid = evento.sender?.id;
  if (!igsid) return;

  const texto = (mensaje.text || '').trim();
  const audio = (mensaje.attachments || []).find((a) => a.type === 'audio');
  if (!texto && !audio) return; // stickers, imágenes, reacciones, etc.

  // Cola por conversación: orden por cliente, paralelismo entre clientes.
  encolar(`ig:${igsid}`, () => (audio ? manejarAudio(igsid, audio) : manejarTexto(igsid, texto)));
}

// GET: verificación del webhook por parte de Meta.
router.get('/api/instagram/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === config.instagram.verifyToken) {
    console.log('[ig] Webhook verificado por Meta.');
    return res.status(200).send(challenge || '');
  }
  return res.sendStatus(403);
});

// POST: eventos de mensajería. Meta exige un 200 rápido (si no, reintenta),
// así que se responde de inmediato y el procesamiento sigue en segundo plano.
router.post('/api/instagram/webhook', (req, res) => {
  res.sendStatus(200);
  try {
    // El body crudo lo captura el express.json() global (verify) en
    // website-est/server/index.js, solo para esta ruta.
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    if (!verificarFirmaIG(raw, req.get('x-hub-signature-256'))) {
      console.warn('[ig] Firma X-Hub-Signature-256 inválida: evento descartado.');
      return;
    }
    for (const entry of req.body?.entry || []) {
      for (const evento of entry.messaging || []) {
        try {
          procesarEvento(evento);
        } catch (err) {
          console.error(`[ig] Error procesando evento: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error(`[ig] Error en webhook: ${err.message}`);
  }
});

export default router;
