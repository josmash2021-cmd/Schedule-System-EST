// Punto de entrada: conexión a WhatsApp con Baileys y ruteo de mensajes.
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  Browsers
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import config from './src/config.js';
import { responder, iaDisponible } from './src/ai.js';
import { notificarDueno } from './src/notificar.js';
import { transcribirAudio, transcripcionDisponible } from './src/transcribir.js';
import { encolar } from './src/cola.js';
import { iniciarAprendizaje } from './src/aprendizaje.js';

const logger = pino({ level: 'warn' });

// Usuarios a los que ya se les avisó que el LLM no está disponible
// (para no spamear al dueño con el mismo aviso en cada mensaje).
const avisadosSinIA = new Set();

// Registro persistente del último mensaje entrante procesado por chat
// (timestamp en segundos). Así, tras un reinicio, se responde lo que
// quedó pendiente aunque el bot haya escrito después en ese chat.
const ESTADO_PATH = path.join(config.dataDir, 'chats-estado.json');
let estadoChats = {};
try {
  if (existsSync(ESTADO_PATH)) {
    estadoChats = JSON.parse(readFileSync(ESTADO_PATH, 'utf8'));
  }
} catch { /* estado nuevo */ }

let estadoTimer = null;
function guardarEstadoChats() {
  if (estadoTimer) return;
  estadoTimer = setTimeout(() => {
    estadoTimer = null;
    try {
      mkdirSync(path.dirname(ESTADO_PATH), { recursive: true });
      const tmp = `${ESTADO_PATH}.tmp`;
      writeFileSync(tmp, JSON.stringify(estadoChats));
      renameSync(tmp, ESTADO_PATH);
    } catch (err) {
      console.error(`[bot] No se pudo guardar chats-estado: ${err.message}`);
    }
  }, 1000);
  estadoTimer.unref?.();
}

function marcarProcesado(jid, ts) {
  if ((estadoChats[jid] || 0) < ts) {
    estadoChats[jid] = ts;
    guardarEstadoChats();
  }
}

function extraerTexto(mensaje) {
  const m = mensaje.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    ''
  ).trim();
}

function esIgnorable(mensaje) {
  const jid = mensaje.key.remoteJid || '';
  return (
    mensaje.key.fromMe ||
    jid.endsWith('@g.us') ||          // grupos
    jid === 'status@broadcast' ||     // estados
    jid.endsWith('@broadcast') ||     // listas de difusión
    jid.endsWith('@newsletter')       // canales
  );
}

async function manejarMensaje(sock, mensaje) {
  if (esIgnorable(mensaje)) return;

  const jid = mensaje.key.remoteJid;
  marcarProcesado(jid, Number(mensaje.messageTimestamp || Math.floor(Date.now() / 1000)));
  let texto = extraerTexto(mensaje);

  // Nota de voz: descargar y transcribir para responderla como texto.
  if (!texto && mensaje.message?.audioMessage) {
    const remitente = jid.split('@')[0];
    if (!transcripcionDisponible()) {
      await sock.sendMessage(jid, {
        text: '¡Hola! Por ahora no puedo escuchar notas de voz 😅 ¿me lo escribes en texto porfa?'
      });
      return;
    }
    try {
      // Marcar la nota como escuchada (palomitas y micrófono en azul),
      // como cuando una persona le da play en WhatsApp.
      try {
        await sock.readMessages([mensaje.key]);
        await sock.sendReceipt(jid, undefined, [mensaje.key.id], 'played');
      } catch { /* best-effort */ }

      // Simular que está escuchando la nota: esperar su duración real
      // (tope 120s) en silencio, y solo entonces mostrar "escribiendo...".
      const duracionSeg = Math.min(Number(mensaje.message.audioMessage.seconds || 0), 120);
      if (duracionSeg > 0) {
        await new Promise((r) => setTimeout(r, duracionSeg * 1000));
      }
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      const buffer = await downloadMediaMessage(mensaje, 'buffer', {});
      texto = await transcribirAudio(buffer, mensaje.message.audioMessage.mimetype);
      console.log(`[mensaje] Nota de voz de ${remitente} transcrita: "${texto}"`);
      if (!texto) {
        await sock.sendMessage(jid, {
          text: 'No alcancé a entender bien el audio 😅 ¿me lo repites por texto?'
        });
        return;
      }
    } catch (err) {
      console.error(`[mensaje] Error al transcribir nota de voz: ${err.message}`);
      await sock.sendMessage(jid, {
        text: 'Tuve un problema para escuchar tu audio 😅 ¿me lo escribes en texto porfa?'
      });
      return;
    }
  }

  // Anti-spam básico: solo texto (o caption de imagen). Se ignoran
  // stickers, reacciones, mensajes vacíos, etc.
  if (!texto) return;

  // Con direccionamiento LID, jid es el identificador privado (no el número).
  // El teléfono real (PN) viene en remoteJidAlt; si falta, se intenta
  // resolver con el mapeo LID→PN de la sesión.
  let telefono = (mensaje.key.remoteJidAlt || '').split('@')[0];
  if (!telefono && jid.endsWith('@lid')) {
    try {
      const pn = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid);
      telefono = String(pn || '').split('@')[0];
    } catch { /* sin mapeo disponible */ }
  }
  if (!telefono) telefono = jid.split('@')[0];
  console.log(`[mensaje] ${telefono}: ${texto}`);

  // La presencia ("escribiendo...") es decorativa: si WhatsApp la rechaza
  // (p. ej. ack 463 por contactos LID), no debe frenar la respuesta.
  const presencia = async (estado) => {
    try { await sock.sendPresenceUpdate(estado, jid); } catch { /* best-effort */ }
  };

  // Envolver el envío en timeout: si el ack del servidor se cuelga, el bot
  // no puede quedarse mudo para siempre.
  const enviar = (texto) => Promise.race([
    sock.sendMessage(jid, { text: texto }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout al enviar (ack no recibido)')), 45000))
  ]);

  try {
    // Ritmo humano: a los 5s marca leído (palomitas azules) y a los 7s
    // empieza el "escribiendo...".
    await new Promise((r) => setTimeout(r, 5000));
    try { await sock.readMessages([mensaje.key]); } catch { /* best-effort */ }
    await new Promise((r) => setTimeout(r, 2000));
    await presencia('composing');
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));

    let respuesta;
    if (iaDisponible()) {
      respuesta = await responder(jid, texto, { telefono, sock, jid });
    } else {
      // Sin API key: fallback amable y aviso al dueño (una vez por usuario).
      respuesta =
        '¡Hola! 👋 En este momento nuestro asistente automático no está disponible, ' +
        'pero ya dejé tu mensaje con el supervisor y te contactamos muy pronto. Gracias por tu paciencia. 🙏';
      if (!avisadosSinIA.has(jid)) {
        avisadosSinIA.add(jid);
        await notificarDueno(
          sock,
          `⚠️ Cliente esperando atención (IA no configurada)\n📞 Tel: ${telefono}\n💬 Mensaje: ${texto}`
        );
      }
    }

    await presencia('paused');

    // La IA separa los mensajes con ||| : cada uno va como burbuja propia
    // de WhatsApp, con "escribiendo..." y una pausa según su largo, como
    // si una persona los estuviera tecleando.
    const burbujas = String(respuesta)
      .split('|||')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
    for (const burbuja of burbujas) {
      await presencia('composing');
      await new Promise((r) => setTimeout(r, 800 + Math.min(burbuja.length * 25, 2500)));
      await presencia('paused');
      await enviar(burbuja);
    }
    console.log(`[mensaje] Respuesta enviada a ${telefono} (${burbujas.length} burbuja(s))`);
  } catch (err) {
    console.error(`[mensaje] Error al procesar: ${err.message}`);
    try {
      await enviar('Lo siento, tuve un problema técnico. 😅 Ya le avisé al supervisor y te contactamos muy pronto. 🙏');
    } catch { /* si falla el envío, solo queda el log */ }
  }
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[bot] Usando versión de WhatsApp Web: ${version.join('.')}`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[bot] Escanea este código QR con WhatsApp (Dispositivos vinculados):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const fueLogout = codigo === DisconnectReason.loggedOut;
      console.log(`[bot] Conexión cerrada (código ${codigo}). ¿Reconectar? ${!fueLogout}`);
      if (!fueLogout) {
        iniciarBot(); // reconexión automática
      } else {
        console.log('[bot] Sesión cerrada (logout). Borra la carpeta auth_info/ y vuelve a iniciar para escanear un nuevo QR.');
      }
    }

    if (connection === 'open') {
      console.log(`[bot] ✅ Conectado a WhatsApp como "${config.negocio.nombre}". Listo para atender clientes.`);
      iniciarAprendizaje(sock);
      if (!iaDisponible()) {
        console.warn('[bot] ⚠️ OPENAI_API_KEY no configurada: el bot responderá con el mensaje de fallback.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Mensajes en vivo: cada chat en su propia cola (orden por cliente,
    // paralelismo entre clientes — hasta 50 chats sin bloquearse).
    if (type === 'notify') {
      for (const mensaje of messages) {
        const jid = mensaje.key?.remoteJid || '';
        if (!jid) continue;
        encolar(jid, () => manejarMensaje(sock, mensaje));
      }
      return;
    }

    // Mensajes que llegaron mientras el bot estaba apagado (type 'append'):
    // por cada chat se toma el ÚLTIMO mensaje ENTRANTE (texto o nota de
    // voz) y se responde solo si es más nuevo que lo ya procesado (registro
    // persistente en data/chats-estado.json) — así no importa si el bot
    // escribió después en ese chat (p. ej. notificaciones al dueño).
    if (type === 'append') {
      const ultimoPorChat = new Map();
      for (const m of messages) {
        const jid = m.key?.remoteJid || '';
        if (!jid || m.key.fromMe || jid.endsWith('@g.us') || jid.endsWith('@broadcast') ||
            jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue;
        if (!extraerTexto(m) && !m.message?.audioMessage) continue;
        const ts = Number(m.messageTimestamp || 0);
        const actual = ultimoPorChat.get(jid);
        if (!actual || ts > actual.ts) ultimoPorChat.set(jid, { m, ts });
      }
      const ahoraSeg = Math.floor(Date.now() / 1000);
      for (const [jid, { m, ts }] of ultimoPorChat) {
        if (ts <= (estadoChats[jid] || 0)) continue;  // ya procesado
        if (ahoraSeg - ts > 24 * 3600) continue;      // muy viejo para retomar
        console.log(`[mensaje] Retomando mensaje no respondido de ${(m.key.remoteJidAlt || jid).split('@')[0]} (llegó mientras el bot estaba apagado)`);
        encolar(jid, () => manejarMensaje(sock, m));
      }
    }
  });
}

iniciarBot().catch((err) => {
  console.error(`[bot] Error fatal: ${err.message}`);
  process.exit(1);
});
