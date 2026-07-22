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
const VOZ_ID = process.env.ELEVENLABS_VOICE_ID || '9Godp7dNohUvXk6qp0gS';
const MODELO = 'eleven_v3';

// Zona horaria del negocio (Hoover, Alabama) — la misma que usa src/ai.js.
const ZONA_NEGOCIO = 'America/Chicago';

// Los 3 audios posibles se generan UNA sola vez y se guardan en disco:
// así no se gastan créditos de ElevenLabs en cada cliente nuevo.
const CACHE_DIR = path.join(config.dataDir, 'voz');
// Versión de la frase de bienvenida: forma parte del nombre de archivo
// cacheado, así que al cambiarla los audios viejos se ignoran y se
// regeneran solos (local y en el volumen de Railway).
const SLUGS = {
  'buenos días': 'buenos-dias-v3',
  'buenas tardes': 'buenas-tardes-v3',
  'buenas noches': 'buenas-noches-v3'
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
 * Garantiza que existan los audios cacheados de un saludo
 * ("buenos días" | "buenas tardes" | "buenas noches").
 */
async function asegurarAudios(saludo) {
  const slug = SLUGS[saludo];
  if (!slug) throw new Error(`Saludo desconocido: ${saludo}`);
  const rutaOgg = path.join(CACHE_DIR, `${slug}.ogg`);
  const rutaM4a = path.join(CACHE_DIR, `${slug}.m4a`);
  if (!existsSync(rutaOgg) || !existsSync(rutaM4a)) {
    console.log(`[voz] Generando audio de bienvenida (${saludo}) con ElevenLabs...`);
    await generarAudios(`Hola, ${saludo}. Mi nombre es Ángela, ¿en qué te puedo ayudar?`, slug);
  }
  return { rutaOgg, rutaM4a };
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
