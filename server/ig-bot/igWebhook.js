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
import config from './src/config.js';
import { responder, iaDisponible } from './src/ai.js';
import { encolar } from './src/cola.js';
import { transcribirAudio, transcripcionDisponible } from './src/transcribir.js';
import { enviarTextoIG, accionIG, verificarFirmaIG, crearCanalIG } from './src/instagram.js';
import { notificarDuenoIG } from './src/notificar.js';

const router = express.Router();

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const burbujas = String(respuesta)
    .split('|||')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  for (const burbuja of burbujas) {
    await accionIG(igsid, 'typing_on');
    await esperar(800 + Math.min(burbuja.length * 25, 2500));
    await enviarTextoIG(igsid, burbuja);
  }
  await accionIG(igsid, 'typing_off');
  console.log(`[ig] Respuesta enviada a ${igsid} (${burbujas.length} burbuja(s))`);
}

// Ritmo humano igual que en WhatsApp: mark_seen, pausa, "escribiendo...",
// respuesta en burbujas y typing_off.
async function manejarTexto(igsid, texto) {
  console.log(`[ig] ${igsid}: ${texto}`);
  try {
    await accionIG(igsid, 'mark_seen');
    await esperar(5000);
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
