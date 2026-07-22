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
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import config from './src/config.js';
import { responder, iaDisponible, esPrimeraVez, inactividadMs, cerrarSesion, sembrarSaludoVoz, sembrarDespedidaVoz } from './src/ai.js';
import { vozDisponible, obtenerAudioBienvenida, obtenerAudioDespedida } from './src/voz.js';
import { notificarDueno } from './src/notificar.js';
import { transcribirAudio, transcripcionDisponible } from './src/transcribir.js';
import { encolar } from './src/cola.js';
import { iniciarAprendizaje } from './src/aprendizaje.js';

const logger = pino({ level: 'warn' });

// Red de seguridad: el bot comparte proceso con el servidor web y el
// webhook de Instagram; un rejection sin manejar no debe tumbarlo todo.
process.on('unhandledRejection', (err) => {
  console.error(`[bot] unhandledRejection capturado (el proceso sigue): ${err?.message || err}`);
});

// Usuarios a los que ya se les avisó que el LLM no está disponible
// (para no spamear al dueño con el mismo aviso en cada mensaje).
const avisadosSinIA = new Set();

// Último QR de vinculación recibido de WhatsApp (null cuando ya está
// conectado). El servidor web lo expone como imagen en /bot-qr.
let ultimoQR = null;

// Historial de auto-reseteos por logout (protección antibucle).
let reseteosLogout = [];

export function obtenerQR() {
  return ultimoQR;
}

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

// Saludos típicos de apertura ("hola", "buenas noches", "buen día", ...).
// Si un cliente vuelve a saludar tras un rato largo sin escribir, se le
// manda otra vez la nota de voz de bienvenida.
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
// nueva conversación", "empezar de cero", "reinicia la sesión"...).
// OJO: "reiniciar" solo cuenta con contexto (sesión/conversación/chat) —
// en un negocio de reparación "mi laptop se reinicia sola" es cotidiano
// y NO debe borrar la conversación.
const REINICIO_RE = /(cierr\w*\s+(la\s+|esta\s+)?sesi[oó]n|cerrar\s+sesi[oó]n|nueva\s+conversaci[oó]n|empez\w*\s+de\s+(cero|nuevo)|reinici\w*\s+(la\s+|esta\s+)?(sesi[oó]n|conversaci[oó]n|chat))/i;

function esReinicio(texto) {
  return REINICIO_RE.test(texto || '');
}

// Mensaje que es SOLO una despedida o agradecimiento, sin pregunta ni
// contenido ("muchísimas gracias", "gracias que tenga buen día", "está
// bien gracias", "adiós"...). Se responde con la nota de voz de
// despedida (sin texto repetido). Se evalúa ANTES que el saludo para que
// "gracias que tenga buen día" no dispare la bienvenida por error.
const FRASE_GRACIAS = /(?:(?:much[íi]simas|muchas|mil|ok(?:i)?|vale|perfecto|est[áa]\s+bien|de\s+nada|no)\s+)*gracias(?:\s+(?:de\s+verdad|por\s+todo|por\s+su\s+(?:ayuda|tiempo)|por\s+tu\s+ayuda|mi\s+rey|amigo|amiga|rey|brou))?/;
const FRASE_QUE_TENGA = /que\s+(?:pase[n]?s?|tenga[n]?s?)\s+buen[oa]?s?\s+(?:d[íi]as?|tardes?|noches?)/;
const FRASE_ADIOS = /(?:adi[oó]s|hasta\s+(?:luego|pronto|mañana)|nos\s+vemos|chao|bye(?:\s+bye)?|thank\s+you(?:\s+so\s+much)?|thanks(?:\s+a\s+lot)?|igualmente|est[áa]\s+bien(?:\s+(?:mi\s+rey|brou|amigo|amiga))?)/;
const SOLO_DESPEDIDA_RE = new RegExp(
  '^\\s*(?:(?:' + FRASE_GRACIAS.source + '|' + FRASE_QUE_TENGA.source + '|' + FRASE_ADIOS.source + ')[\\s!¡?¿.,🙏😊👍]*)+$', 'iu');

function esSoloDespedida(texto) {
  return SOLO_DESPEDIDA_RE.test(texto || '');
}

// Inactividad mínima para repetir la bienvenida de voz ante un saludo.
const INACTIVIDAD_SALUDO_MS = 3 * 60 * 60 * 1000; // 3 horas

// Antispam de la nota de voz: aunque el cliente salude varias veces
// seguidas, máximo 1 audio de bienvenida cada 15 min por chat.
const ANTISPAM_VOZ_MS = 15 * 60 * 1000;
const ultimaVozPorChat = new Map();

// Antispam de la despedida, INDEPENDIENTE del de bienvenida: que el
// cliente reciba el saludo por voz no debe impedir que su despedida unos
// minutos después también salga por voz.
const ultimaDespedidaPorChat = new Map();

// Antispam de llamadas rechazadas: máximo 1 mensaje + aviso cada hora
// por número, aunque el cliente insista llamando.
const ANTISPAM_LLAMADA_MS = 60 * 60 * 1000;
const ultimaLlamadaPorChat = new Map();

async function manejarMensaje(sock, mensaje) {
  if (esIgnorable(mensaje)) return;

  const jid = mensaje.key.remoteJid;
  const tsMensaje = Number(mensaje.messageTimestamp || Math.floor(Date.now() / 1000));
  // OJO: el mensaje se marca como procesado SOLO después de responderlo
  // (al final de cada camino). Si el contenedor muere a mitad (deploy,
  // reinicio), al reconectar el catch-up lo ve como pendiente y reintenta.
  let texto = extraerTexto(mensaje);

  // Nota de voz: descargar y transcribir para responderla como texto.
  if (!texto && mensaje.message?.audioMessage) {
    const remitente = jid.split('@')[0];
    if (!transcripcionDisponible()) {
      await sock.sendMessage(jid, {
        text: '¡Hola! Por ahora no puedo escuchar notas de voz 😅 ¿me lo escribes en texto porfa?'
      });
      marcarProcesado(jid, tsMensaje);
      return;
    }
    try {
      // Ritmo humano con notas de voz:
      // 1) 5s de silencio, 2) se marca escuchada (azul),
      // 3) "la escucha" por su duración real (tope 120s),
      // 4) 3s más y aparece "escribiendo..." antes de responder.
      await new Promise((r) => setTimeout(r, 5000));
      try {
        await sock.readMessages([mensaje.key]);
        await sock.sendReceipt(jid, undefined, [mensaje.key.id], 'played');
      } catch { /* best-effort */ }

      const duracionSeg = Math.min(Number(mensaje.message.audioMessage.seconds || 0), 120);
      if (duracionSeg > 0) {
        await new Promise((r) => setTimeout(r, duracionSeg * 1000));
      }
      await new Promise((r) => setTimeout(r, 3000));
      await sock.sendPresenceUpdate('composing', jid).catch(() => {});
      const buffer = await downloadMediaMessage(mensaje, 'buffer', {});
      texto = await transcribirAudio(buffer, mensaje.message.audioMessage.mimetype);
      console.log(`[mensaje] Nota de voz de ${remitente} transcrita: "${texto}"`);
      if (!texto) {
        await sock.sendMessage(jid, {
          text: 'No alcancé a entender bien el audio 😅 ¿me lo repites por texto?'
        });
        marcarProcesado(jid, tsMensaje);
        return;
      }
    } catch (err) {
      console.error(`[mensaje] Error al transcribir nota de voz: ${err.message}`);
      await sock.sendMessage(jid, {
        text: 'Tuve un problema para escuchar tu audio 😅 ¿me lo escribes en texto porfa?'
      });
      marcarProcesado(jid, tsMensaje);
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

  // Reinicio a petición del cliente: la sesión se cierra y ESTE mensaje
  // ya se procesa como el primero de una conversación nueva (con la
  // bienvenida de voz, si está activa).
  if (esReinicio(texto) && cerrarSesion(jid)) {
    console.log(`[mensaje] Sesión reiniciada a petición del cliente: ${telefono}`);
  }

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

    // Despedida por nota de voz — se evalúa ANTES que la bienvenida: un
    // mensaje como "gracias que tenga buen día" contiene "buen día" y
    // dispararía el saludo por error. Si el cliente SOLO se despide o
    // agradece ("muchísimas gracias", "está bien gracias", "adiós"...),
    // se responde con el audio de despedida y no se manda texto repetido.
    // Mismo antispam de 15 min que la bienvenida.
    if (esSoloDespedida(texto) && vozDisponible() &&
        (Date.now() - (ultimaDespedidaPorChat.get(jid) || 0)) >= ANTISPAM_VOZ_MS) {
      try {
        await presencia('recording');
        const audioDesp = await obtenerAudioDespedida();
        if (audioDesp) {
          await sock.sendMessage(jid, {
            audio: audioDesp,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
          });
          ultimaDespedidaPorChat.set(jid, Date.now());
          console.log(`[mensaje] Nota de voz de despedida enviada a ${telefono}`);
          await presencia('paused');
          sembrarDespedidaVoz(jid);
          marcarProcesado(jid, tsMensaje);
          return;
        }
      } catch (err) {
        console.error(`[mensaje] No se pudo enviar la despedida de voz: ${err.message}`);
      }
    }

    // Bienvenida por nota de voz. Se envía cuando:
    //  a) es el primer mensaje de la conversación (sesión nueva),
    //  b) el cliente vuelve a SALUDAR ("hola", "buenas noches", etc.)
    //     tras más de 3 horas sin escribir, o
    //  c) el saludo incluye la hora del día ("hola buenas tardes",
    //     "buenos días"...) — aunque la sesión siga activa.
    // Saluda según la hora del negocio ("buenos días/tardes/noches").
    // Antispam: máximo 1 nota de voz cada 15 min por chat.
    // Si falla, la IA saluda por texto.
    const saludoConHora = /(buenos\s+d[íi]as|buenas\s+tardes|buenas\s+noches|buen\s+d[íi]a)/i.test(texto);
    const vozReciente = (Date.now() - (ultimaVozPorChat.get(jid) || 0)) < ANTISPAM_VOZ_MS;
    const tocaVoz =
      !vozReciente &&
      (esPrimeraVez(jid) ||
        (esSaludo(texto) && inactividadMs(jid) > INACTIVIDAD_SALUDO_MS) ||
        saludoConHora);
    if (tocaVoz && vozDisponible()) {
      try {
        await presencia('recording');
        const audio = await obtenerAudioBienvenida();
        if (audio) {
          await sock.sendMessage(jid, {
            audio: audio.buffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
          });
          ultimaVozPorChat.set(jid, Date.now());
          console.log(`[mensaje] Nota de voz de bienvenida enviada a ${telefono} (${audio.saludo})`);
          await presencia('paused');

          // Si el cliente SOLO saludó ("hola", "buenas noches"...), la
          // nota de voz ya cubre el saludo: NO se manda texto repetido.
          // Queda sembrado en el historial para que la IA tenga contexto.
          // (Si luego dice que no la escuchó, la IA se lo escribe.)
          if (esSoloSaludo(texto)) {
            sembrarSaludoVoz(jid, audio.saludo);
            console.log('[mensaje] Saludo cubierto por la nota de voz; no se envía texto.');
            marcarProcesado(jid, tsMensaje);
            return;
          }
        }
      } catch (err) {
        console.error(`[mensaje] No se pudo enviar la bienvenida de voz: ${err.message}`);
      }
    }

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
    // si una persona los estuviera tecleando. Máximo 3 burbujas, pero
    // NADA se tira: las sobrantes se fusionan en la tercera (antes se
    // cortaban y los mensajes llegaban incompletos).
    const partes = String(respuesta)
      .split('|||')
      .map((s) => s.trim())
      .filter(Boolean);
    const burbujas = partes.length <= 3
      ? partes
      : [...partes.slice(0, 2), partes.slice(2).join('\n')];
    for (const burbuja of burbujas) {
      await presencia('composing');
      await new Promise((r) => setTimeout(r, 800 + Math.min(burbuja.length * 25, 2500)));
      await presencia('paused');
      await enviar(burbuja);
    }
    console.log(`[mensaje] Respuesta enviada a ${telefono} (${burbujas.length} burbuja(s))`);
    marcarProcesado(jid, tsMensaje);
  } catch (err) {
    console.error(`[mensaje] Error al procesar: ${err.message}`);
    try {
      await enviar('Lo siento, tuve un problema técnico. 😅 Ya le avisé al supervisor y te contactamos muy pronto. 🙏');
      // El fallback ya es una respuesta para el cliente; se marca.
      marcarProcesado(jid, tsMensaje);
    } catch { /* si falla el envío, NO se marca: el catch-up reintenta */ }
  }
}

// Reconexión con backoff exponencial (2s → 4s → ... → tope 60s) y SIEMPRE
// con .catch: un rejection sin manejar tumba el proceso entero, y aquí el
// bot comparte proceso con el servidor web y el webhook de Instagram.
let intentosReconexion = 0;

function reconectarConBackoff() {
  intentosReconexion += 1;
  const espera = Math.min(2000 * 2 ** (intentosReconexion - 1), 60000);
  console.log(`[bot] Reconectando en ${espera / 1000}s (intento ${intentosReconexion})...`);
  setTimeout(() => {
    iniciarBot().catch((err) => {
      console.error(`[bot] Error al reiniciar (intento ${intentosReconexion}): ${err.message}`);
      reconectarConBackoff();
    });
  }, espera);
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);  const { version } = await fetchLatestBaileysVersion();
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
      // Se guarda el QR crudo para que el servidor web lo muestre como
      // imagen en /bot-qr (escanearlo desde los logs es difícil y caduca).
      ultimoQR = qr;
      console.log('\n[bot] Escanea este código QR con WhatsApp (Dispositivos vinculados):\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode;
      const fueLogout = codigo === DisconnectReason.loggedOut;
      console.log(`[bot] Conexión cerrada (código ${codigo}). ¿Reconectar? ${!fueLogout}`);
      if (!fueLogout) {
        reconectarConBackoff();
      } else {
        // Logout (401): las credenciales guardadas ya no sirven (típico
        // cuando dos instancias pisan la misma sesión en un deploy).
        // Se borran y se arranca de cero: sale un QR nuevo solo.
        // Límite de seguridad: máximo 3 reseteos en 10 min para no
        // entrar en bucle si WhatsApp tiene la cuenta restringida.
        const ahora = Date.now();
        reseteosLogout = reseteosLogout.filter((t) => ahora - t < 10 * 60 * 1000);
        if (reseteosLogout.length >= 3) {
          console.error('[bot] Sesión cerrada (logout) por 3ª vez en 10 min. No se reintenta: revisa la vinculación manualmente.');
          return;
        }
        reseteosLogout.push(ahora);
        console.log('[bot] Sesión cerrada (logout). Reseteando credenciales para generar un QR nuevo...');
        try {
          rmSync(config.authDir, { recursive: true, force: true });
          console.log('[bot] Credenciales eliminadas. Reiniciando en 10s para generar QR nuevo...');
        } catch (err) {
          console.error(`[bot] No se pudo borrar auth_info: ${err.message}`);
        }
        setTimeout(() => {
          iniciarBot().catch((err) => console.error(`[bot] Error al reiniciar tras reseteo: ${err.message}`));
        }, 10000);
      }
    }

    if (connection === 'open') {
      ultimoQR = null; // ya vinculado: no hay QR que mostrar
      intentosReconexion = 0; // conectado: se resetea el backoff
      console.log(`[bot] ✅ Conectado a WhatsApp como "${config.negocio.nombre}". Listo para atender clientes.`);
      iniciarAprendizaje(sock);
      if (!iaDisponible()) {
        console.warn('[bot] ⚠️ OPENAI_API_KEY no configurada: el bot responderá con el mensaje de fallback.');
      }
    }
  });

  // Llamadas de voz/video: Baileys no puede contestarlas (limitación del
  // protocolo de WhatsApp Web). Se rechazan automáticamente y se le
  // responde al cliente por chat al instante, con aviso al supervisor.
  // Antispam: máximo 1 mensaje + 1 aviso cada hora por número.
  sock.ev.on('call', async (llamadas) => {
    for (const llamada of llamadas) {
      const jid = llamada.from || '';
      if (!jid || llamada.isGroup) continue;
      const telefono = jid.split('@')[0];
      const tipo = llamada.isVideo ? 'videollamada' : 'llamada';
      try {
        await sock.rejectCall(llamada.id, jid);
        console.log(`[llamada] ${tipo} de ${telefono} rechazada automáticamente`);
      } catch (err) {
        console.error(`[llamada] No se pudo rechazar la ${tipo} de ${telefono}: ${err.message}`);
      }

      const ahora = Date.now();
      if (ahora - (ultimaLlamadaPorChat.get(jid) || 0) < ANTISPAM_LLAMADA_MS) continue;
      ultimaLlamadaPorChat.set(jid, ahora);
      // Pausa humana de 5s tras colgar: el mensaje no llega "de inmediato",
      // como si uno hubiera visto la llamada perdida y escrito enseguida.
      await new Promise((r) => setTimeout(r, 5000));
      try {
        await sock.sendMessage(jid, {
          text: '¡Hola! Vi que nos llamaste 😊 Por aquí no puedo contestar llamadas, pero cuéntame por mensaje (texto o nota de voz) y te ayudo enseguida.'
        });
      } catch (err) {
        console.error(`[llamada] No se pudo enviar el mensaje a ${telefono}: ${err.message}`);
      }
      try {
        await notificarDueno(
          sock,
          `📞 *Llamada perdida* (rechazada por el bot)\n` +
          `📱 Cliente: +${telefono}\n` +
          `🎥 Tipo: ${tipo}\n` +
          `💬 Ya se le respondió por chat invitándolo a escribir.`
        );
      } catch (err) {
        console.error(`[llamada] No se pudo avisar al supervisor: ${err.message}`);
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

    // Mensajes que llegaron mientras el bot estaba apagado. WhatsApp los
    // entrega al reconectar como 'append' (recientes) o 'history' (sinc
    // de historial, típico tras vincular con QR nuevo): se tratan igual.
    // Por cada chat se toma el ÚLTIMO mensaje ENTRANTE (texto o nota de
    // voz) y se responde solo si es más nuevo que lo ya procesado (registro
    // persistente en data/chats-estado.json) — así no importa si el bot
    // escribió después en ese chat (p. ej. notificaciones al dueño).
    if (type === 'append' || type === 'history') {
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

// Arranque protegido: el servidor web (website-est/server/index.js) importa
// este módulo y llama iniciarBotSeguro(); un fallo del bot no tumba la web.
export async function iniciarBotSeguro() {
  try {
    await iniciarBot();
  } catch (err) {
    console.error(`[bot] Error al iniciar: ${err.message}`);
  }
}

// Auto-arranque solo en ejecución directa (`node index.js`), no al importarse
// como módulo desde el servidor web.
const esEjecucionDirecta = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (esEjecucionDirecta) {
  iniciarBot().catch((err) => {
    console.error(`[bot] Error fatal: ${err.message}`);
    process.exit(1);
  });
}
