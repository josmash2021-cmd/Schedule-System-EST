// Nota de voz de bienvenida: texto a voz con ElevenLabs.
// Solo se usa para el saludo inicial de cada conversación ("Hola, buenos
// días/tardes/noches, mi nombre es Ángela..."). El resto de las respuestas
// del bot siguen siendo texto.
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import config from './config.js';

const execFileAsync = promisify(execFile);

const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const VOZ_ID = process.env.ELEVENLABS_VOICE_ID || 'NKNnfxyJilN0daSOIf11';
const MODELO = 'eleven_v3';

// Zona horaria del negocio (Hoover, Alabama) — la misma que usa src/ai.js.
const ZONA_NEGOCIO = 'America/Chicago';

// Los audios se generan UNA sola vez y se guardan en disco: así no se
// gastan créditos de ElevenLabs en cada cliente nuevo.
const CACHE_DIR = path.join(config.dataDir, 'voz');

// Variantes de bienvenida por franja horaria (se elige una AL AZAR cada
// vez para que no suene repetitivo). El slug lleva versión: al cambiar
// las frases se sube y los audios viejos se ignoran.
const VARIANTES_BIENVENIDA = [
  (s) => `Hola, ${s}. Soy Ángela, ¿cómo te puedo ayudar?`,
  (s) => `Hola, ${s}, habla Ángela. ¿En qué te puedo ayudar?`,
  (s) => `${s.charAt(0).toUpperCase() + s.slice(1)}, bienvenido a Electronic Service Technology. Soy Ángela, ¿en qué te ayudo?`
];
const SLUG_BIENVENIDA = {
  'buenos días': 'buenos-dias-v7',
  'buenas tardes': 'buenas-tardes-v7',
  'buenas noches': 'buenas-noches-v7'
};

let cliente = null;
if (API_KEY) {
  cliente = new ElevenLabsClient({ apiKey: API_KEY });
} else {
  console.warn('[voz] ELEVENLABS_API_KEY no configurada. La bienvenida se enviará como texto.');
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
 * usa cada canal:
 *  - ogg/opus: WhatsApp (nota de voz con waveform).
 *  - m4a/aac:  Instagram (adjunto de audio por URL pública).
 */
async function generarAudios(texto, slug) {
  const stream = await cliente.textToSpeech.convert(VOZ_ID, {
    modelId: MODELO,
    text: texto,
    outputFormat: 'mp3_44100_128'
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
      '-y', '-i', tmpMp3,
      '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000',
      rutaOgg
    ]);
    await execFileAsync(ffmpegPath, [
      '-y', '-i', tmpMp3,
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
async function asegurarPar(slug, texto, etiqueta) {
  const rutaOgg = path.join(CACHE_DIR, `${slug}.ogg`);
  const rutaM4a = path.join(CACHE_DIR, `${slug}.m4a`);
  if (!existsSync(rutaOgg) || !existsSync(rutaM4a)) {
    console.log(`[voz] Generando audio (${etiqueta}) con ElevenLabs...`);
    await generarAudios(texto, slug);
  }
  return { rutaOgg, rutaM4a };
}

/**
 * Garantiza que existan los audios cacheados de una variante de saludo y
 * devuelve las rutas de UNA variante elegida al azar (para que la
 * bienvenida no suene siempre igual).
 */
async function asegurarAudios(saludo) {
  const base = SLUG_BIENVENIDA[saludo];
  if (!base) throw new Error(`Saludo desconocido: ${saludo}`);
  const i = Math.floor(Math.random() * VARIANTES_BIENVENIDA.length);
  const slug = `${base}-${i + 1}`;
  const texto = VARIANTES_BIENVENIDA[i](saludo);
  return asegurarPar(slug, texto, `bienvenida ${saludo} v${i + 1}`);
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
  'buenos días': { slug: 'despedida-v4', texto: 'buen día' },
  'buenas tardes': { slug: 'despedida-tardes-v4', texto: 'buenas tardes' },
  'buenas noches': { slug: 'despedida-noches-v4', texto: 'buenas noches' }
};

// Texto de la despedida para la hora actual del negocio (lo usan los
// generadores de audio y el sembrado en el historial de la IA).
export function textoDespedida() {
  return `Perfecto, cualquier duda o pregunta estamos a la orden, ¡que tenga ${SLUG_DESPEDIDA[saludoSegunHora()].texto}!`;
}

async function asegurarDespedida() {
  const d = SLUG_DESPEDIDA[saludoSegunHora()];
  const i = Math.floor(Math.random() * VARIANTES_DESPEDIDA.length);
  const slug = `${d.slug}-${i + 1}`;
  const texto = VARIANTES_DESPEDIDA[i](d.texto);
  return asegurarPar(slug, texto, `despedida ${d.texto} v${i + 1}`);
}

/**
 * Devuelve el audio de un saludo como Buffer ogg/opus (WhatsApp),
 * usando caché en disco.
 */
export async function obtenerAudioSaludo(saludo) {
  const { rutaOgg } = await asegurarAudios(saludo);
  return readFileSync(rutaOgg);
}

/**
 * Audio de bienvenida para Instagram: la API de Meta solo acepta audios
 * por URL pública, así que se devuelve la RUTA del m4a cacheado (el
 * servidor web lo expone en /voz/). null si la voz no está disponible.
 */
export async function obtenerM4aBienvenida() {
  if (!vozDisponible()) return null;
  const saludo = saludoSegunHora();
  try {
    const { rutaM4a } = await asegurarAudios(saludo);
    return { ruta: rutaM4a, saludo };
  } catch (err) {
    console.error(`[voz] Error al generar la bienvenida de voz: ${err.message}`);
    return null;
  }
}

/**
 * Audio de bienvenida según la hora del negocio.
 * Devuelve { buffer, saludo } o null si la voz no está disponible o falla
 * (en ese caso el bot saluda por texto como antes).
 */
export async function obtenerAudioBienvenida() {
  if (!vozDisponible()) return null;
  const saludo = saludoSegunHora();
  try {
    const buffer = await obtenerAudioSaludo(saludo);
    return { buffer, saludo };
  } catch (err) {
    console.error(`[voz] Error al generar la bienvenida de voz: ${err.message}`);
    return null;
  }
}

/**
 * Despedida por nota de voz para WhatsApp: devuelve el Buffer ogg/opus
 * de una variante al azar, según la hora del negocio (buen día / buenas
 * tardes / buenas noches). null si la voz no está disponible.
 */
export async function obtenerAudioDespedida() {
  if (!vozDisponible()) return null;
  try {
    const { rutaOgg } = await asegurarDespedida();
    return readFileSync(rutaOgg);
  } catch (err) {
    console.error(`[voz] Error al generar la despedida de voz: ${err.message}`);
    return null;
  }
}

/**
 * Despedida por nota de voz para Instagram: devuelve la RUTA del m4a
 * cacheado (Meta solo acepta audios por URL pública, servida en /voz/).
 */
export async function obtenerM4aDespedida() {
  if (!vozDisponible()) return null;
  try {
    const { rutaM4a } = await asegurarDespedida();
    return { ruta: rutaM4a };
  } catch (err) {
    console.error(`[voz] Error al generar la despedida de voz: ${err.message}`);
    return null;
  }
}
