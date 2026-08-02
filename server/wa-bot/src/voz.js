// Texto a voz con ElevenLabs: despedidas y aviso de llamada (cacheados),
// y respuestas habladas generadas al vuelo con la voz de la persona del chat.
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import config from './config.js';

const execFileAsync = promisify(execFile);

const API_KEY = process.env.ELEVENLABS_API_KEY || '';

// Personas de voz del bot: la despedida y las respuestas habladas las dice
// Ángela o Alex, según la persona asignada al chat (fija por turnos).
// Ambas usan eleven_v3: el modelo MÁS expresivo de ElevenLabs (entonación
// actoral, pausas y matices de voz real). Estabilidad 0.0 ("Creative"):
// máxima naturalidad y variación — con más estabilidad suena a locutora
// leyendo un guion.
const VOCES = [
  {
    id: process.env.ELEVENLABS_VOICE_ID || 'JcWDFG8DiES2OzGhZJUJ',
    modelo: process.env.ELEVENLABS_MODEL || 'eleven_v3',
    ajustes: { stability: 0.0, similarityBoost: 0.75, style: 0.0, useSpeakerBoost: true },
    nombre: 'Ángela', slug: 'angela'
  },
  {
    id: process.env.ELEVENLABS_VOICE_ID_2 || 'Aoh8oiCIlPke1wFxeNuK',
    modelo: process.env.ELEVENLABS_MODEL_2 || 'eleven_v3',
    ajustes: { stability: 0.0, similarityBoost: 0.75, style: 0.0, useSpeakerBoost: true },
    nombre: 'Alex', slug: 'alex'
  }
];

function vozAlAzar() {
  return VOCES[Math.floor(Math.random() * VOCES.length)];
}

// Persona fija POR CHAT: el que atienda la primera vez (Ángela o Alex, por
// turnos alternados) atiende esa conversación para siempre. Se persiste en
// disco para que sobreviva a los redeploys (volumen de Railway).
const PERSONAS_PATH = path.join(config.dataDir, 'personas.json');
let personasPorChat = {};
try {
  if (existsSync(PERSONAS_PATH)) {
    personasPorChat = JSON.parse(readFileSync(PERSONAS_PATH, 'utf8'));
  }
} catch { /* mapa nuevo */ }

let personasTimer = null;
function guardarPersonas() {
  if (personasTimer) return;
  personasTimer = setTimeout(() => {
    personasTimer = null;
    try {
      mkdirSync(path.dirname(PERSONAS_PATH), { recursive: true });
      writeFileSync(PERSONAS_PATH, JSON.stringify(personasPorChat));
    } catch (err) {
      console.error(`[voz] No se pudo guardar personas.json: ${err.message}`);
    }
  }, 1000);
  personasTimer.unref?.();
}

function vozParaChat(jid) {
  const clave = String(jid || '');
  if (!clave) return vozAlAzar(); // sin chat (scripts de prueba): aleatorio
  const asignada = personasPorChat[clave];
  if (asignada) {
    const voz = VOCES.find((v) => v.slug === asignada);
    if (voz) return voz;
  }
  // Reparto por turnos (round-robin): un chat nuevo lo atiende Ángela, el
  // siguiente Alex, el siguiente Ángela... El contador se persiste en el
  // mismo personas.json (clave "__contador") para que el turno sobreviva a
  // los redeploys y lo compartan WhatsApp e Instagram (mapa compartido).
  const turno = Number(personasPorChat.__contador || 0);
  const nueva = VOCES[turno % VOCES.length];
  personasPorChat.__contador = turno + 1;
  personasPorChat[clave] = nueva.slug;
  guardarPersonas();
  console.log(`[voz] Chat ${clave.slice(-10)} asignado a ${nueva.nombre} (turno ${turno + 1}; lo atiende siempre)`);
  return nueva;
}

// Persona asignada a un chat: la IA la usa para presentarse POR TEXTO con
// el mismo nombre que dice la nota de voz de ese chat (Ángela o Alex).
// Si el chat aún no tiene persona, la asigna por turnos.
export function personaParaChat(jid) {
  return vozParaChat(jid);
}

// Zona horaria del negocio (Hoover, Alabama) — la misma que usa src/ai.js.
const ZONA_NEGOCIO = 'America/Chicago';

// Los audios se generan UNA sola vez y se guardan en disco: así no se
// gastan créditos de ElevenLabs en cada cliente nuevo.
const CACHE_DIR = path.join(config.dataDir, 'voz');

// Filtro de AMBIENTE: mezcla un ruido rosa muy bajito bajo la voz para que
// el audio no suene "seco" (estudio con aislamiento) sino como una nota de
// voz normal grabada en una tienda. Se aplica en TODOS los audios.
const FILTRO_AMBIENTE =
  '[1:a]volume=0.02[n];[0:a][n]amix=inputs=2:duration=first:normalize=0[out]';
const ENTRADA_RUIDO = ['-f', 'lavfi', '-i', 'anoisesrc=color=pink:amplitude=0.4'];

let cliente = null;
if (API_KEY) {
  cliente = new ElevenLabsClient({ apiKey: API_KEY });
} else {
  console.warn('[voz] ELEVENLABS_API_KEY no configurada. Las respuestas se enviarán como texto.');
}

export function vozDisponible() {
  return cliente !== null;
}

/**
 * Devuelve el saludo correcto según la hora actual del negocio:
 * días antes de las 12 p.m., tardes de 12 a 7 p.m., noches después.
 */
export function saludoSegunHora() {
  let hora = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONA_NEGOCIO,
      hour: 'numeric',
      hour12: false
    }).format(new Date())
  );
  if (hora === 24) hora = 0; // algunos entornos reportan medianoche como 24
  if (hora < 12) return 'buenos días';
  if (hora < 19) return 'buenas tardes';
  return 'buenas noches';
}

/**
 * Convierte texto a voz con ElevenLabs y lo guarda en los formatos que
 * usa cada canal, con el ambiente mezclado:
 *  - ogg/opus: WhatsApp (nota de voz con waveform).
 *  - m4a/aac:  Instagram (adjunto de audio por URL pública).
 */
async function generarAudios(texto, slug, voz) {
  const stream = await cliente.textToSpeech.convert(voz.id, {
    modelId: voz.modelo,
    text: texto,
    outputFormat: 'mp3_44100_128',
    voiceSettings: voz.ajustes
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const mp3 = Buffer.concat(chunks);

  mkdirSync(CACHE_DIR, { recursive: true });
  const rutaOgg = path.join(CACHE_DIR, `${slug}.ogg`);
  const rutaM4a = path.join(CACHE_DIR, `${slug}.m4a`);
  const tmpMp3 = path.join(CACHE_DIR, `${slug}.tmp.mp3`);
  writeFileSync(tmpMp3, mp3);
  try {
    await execFileAsync(ffmpegPath, [
      '-y', '-i', tmpMp3, ...ENTRADA_RUIDO,
      '-filter_complex', FILTRO_AMBIENTE, '-map', '[out]',
      '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000',
      rutaOgg
    ]);
    await execFileAsync(ffmpegPath, [
      '-y', '-i', tmpMp3, ...ENTRADA_RUIDO,
      '-filter_complex', FILTRO_AMBIENTE, '-map', '[out]',
      '-c:a', 'aac', '-b:a', '96k',
      rutaM4a
    ]);
  } finally {
    try { unlinkSync(tmpMp3); } catch { /* best-effort */ }
  }
}

/**
 * Garantiza que exista el par de audios (ogg + m4a) de un texto cacheado.
 */
async function asegurarPar(slug, texto, etiqueta, voz) {
  const rutaOgg = path.join(CACHE_DIR, `${slug}.ogg`);
  const rutaM4a = path.join(CACHE_DIR, `${slug}.m4a`);
  if (!existsSync(rutaOgg) || !existsSync(rutaM4a)) {
    console.log(`[voz] Generando audio (${etiqueta}) con ElevenLabs...`);
    await generarAudios(texto, slug, voz);
  }
  return { rutaOgg, rutaM4a };
}

// Despedidas por nota de voz, según la hora del negocio (como el saludo):
// "buen día" en la mañana, "buenas tardes" de 12 a 7 p.m., "buenas
// noches" después. Tres variantes por franja, elegida una AL AZAR.
const VARIANTES_DESPEDIDA = [
  (d) => `Perfecto, cualquier duda o pregunta estamos a la orden, ¡que tenga ${d}!`,
  (d) => `Con gusto. Aquí estamos para lo que necesite, ¡que tenga ${d}!`,
  (d) => `Gracias por escribirnos. Cualquier cosa me avisa, ¡que tenga ${d}!`
];
const SLUG_DESPEDIDA = {
  'buenos días': { slug: 'despedida-v11', texto: 'buen día' },
  'buenas tardes': { slug: 'despedida-tardes-v11', texto: 'buenas tardes' },
  'buenas noches': { slug: 'despedida-noches-v11', texto: 'buenas noches' }
};

// Texto de la despedida para la hora actual del negocio (lo usan los
// generadores de audio y el sembrado en el historial de la IA).
export function textoDespedida() {
  return `Perfecto, cualquier duda o pregunta estamos a la orden, ¡que tenga ${SLUG_DESPEDIDA[saludoSegunHora()].texto}!`;
}

async function asegurarDespedida(jid) {
  const d = SLUG_DESPEDIDA[saludoSegunHora()];
  const voz = vozParaChat(jid);
  const i = Math.floor(Math.random() * VARIANTES_DESPEDIDA.length);
  const slug = `${d.slug}-${voz.slug}-${i + 1}`;
  const texto = VARIANTES_DESPEDIDA[i](d.texto);
  const par = await asegurarPar(slug, texto, `despedida ${d.texto} ${voz.nombre} v${i + 1}`, voz);
  return { ...par, nombre: voz.nombre, texto };
}

/**
 * Despedida por nota de voz para WhatsApp: devuelve { buffer, nombre,
 * texto } de una variante al azar con la persona asignada al chat, según
 * la hora del negocio. null si la voz no está disponible.
 */
export async function obtenerAudioDespedida(jid) {
  if (!vozDisponible()) return null;
  try {
    const { rutaOgg, ...meta } = await asegurarDespedida(jid);
    return { buffer: readFileSync(rutaOgg), ...meta };
  } catch (err) {
    console.error(`[voz] Error al generar la despedida de voz: ${err.message}`);
    return null;
  }
}

/**
 * Despedida por nota de voz para Instagram: devuelve { ruta, nombre,
 * texto } del m4a cacheado (Meta solo acepta audios por URL pública).
 */
export async function obtenerM4aDespedida(jid) {
  if (!vozDisponible()) return null;
  try {
    const { rutaM4a, ...meta } = await asegurarDespedida(jid);
    return { ruta: rutaM4a, ...meta };
  } catch (err) {
    console.error(`[voz] Error al generar la despedida de voz: ${err.message}`);
    return null;
  }
}

// --- Respuestas habladas (conversación por notas de voz) ---

// Convierte un texto dinámico (la respuesta de la IA) a nota de voz ogg
// con la voz y el modelo de la persona asignada al chat — la MISMA voz
// humana de las bienvenidas. No se cachea: cada respuesta es distinta.
export async function generarVozTexto(texto, jid) {
  if (!vozDisponible()) return null;
  const voz = vozParaChat(jid);
  const tmpMp3 = path.join(CACHE_DIR, `respuesta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp.mp3`);
  const tmpOgg = tmpMp3.replace(/\.tmp\.mp3$/, '.tmp.ogg');
  try {
    const stream = await cliente.textToSpeech.convert(voz.id, {
      modelId: voz.modelo,
      text: texto,
      outputFormat: 'mp3_44100_128',
      voiceSettings: voz.ajustes
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(tmpMp3, Buffer.concat(chunks));
    await execFileAsync(ffmpegPath, [
      '-y', '-i', tmpMp3, ...ENTRADA_RUIDO,
      '-filter_complex', FILTRO_AMBIENTE, '-map', '[out]',
      '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000',
      tmpOgg
    ]);
    return { buffer: readFileSync(tmpOgg), nombre: voz.nombre };
  } catch (err) {
    console.error(`[voz] Error al generar respuesta hablada: ${err.message}`);
    return null;
  } finally {
    try { unlinkSync(tmpMp3); } catch { /* best-effort */ }
    try { unlinkSync(tmpOgg); } catch { /* best-effort */ }
  }
}

// Aviso de llamada rechazada por nota de voz: frase FIJA por persona, así
// que se cachea como las bienvenidas (no gasta créditos en cada llamada).
const TEXTO_LLAMADA = (n) =>
  `Hola, vi que nos llamaste. Por aquí no puedo contestar llamadas, pero mándame una nota de voz o escríbeme por este mismo chat y te ayudo enseguida.`;

export async function obtenerAudioLlamada(jid) {
  if (!vozDisponible()) return null;
  const voz = vozParaChat(jid);
  const slug = `llamada-v5-${voz.slug}`;
  try {
    const { rutaOgg } = await asegurarPar(slug, TEXTO_LLAMADA(voz.nombre), `llamada ${voz.nombre}`, voz);
    return { buffer: readFileSync(rutaOgg), nombre: voz.nombre };
  } catch (err) {
    console.error(`[voz] Error al generar el aviso de llamada: ${err.message}`);
    return null;
  }
}
