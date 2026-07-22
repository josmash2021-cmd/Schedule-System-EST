// Nota de voz de bienvenida: texto a voz con ElevenLabs.
// Solo se usa para el saludo inicial de cada conversación ("Hola, buenos
// días/tardes/noches, mi nombre es Ángel..."). El resto de las respuestas
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
const SLUGS = {
  'buenos días': 'buenos-dias',
  'buenas tardes': 'buenas-tardes',
  'buenas noches': 'buenas-noches'
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
 * Convierte texto a voz con ElevenLabs y lo pasa a ogg/opus (el formato
 * que WhatsApp necesita para mostrarlo como nota de voz).
 */
async function generarOgg(texto, rutaOgg) {
  const stream = await cliente.textToSpeech.convert(VOZ_ID, {
    modelId: MODELO,
    text: texto,
    outputFormat: 'mp3_44100_128'
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const mp3 = Buffer.concat(chunks);

  mkdirSync(CACHE_DIR, { recursive: true });
  const tmpMp3 = rutaOgg.replace(/\.ogg$/, '.tmp.mp3');
  writeFileSync(tmpMp3, mp3);
  try {
    await execFileAsync(ffmpegPath, [
      '-y', '-i', tmpMp3,
      '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000',
      rutaOgg
    ]);
  } finally {
    try { unlinkSync(tmpMp3); } catch { /* best-effort */ }
  }
}

/**
 * Devuelve el audio de un saludo ("buenos días" | "buenas tardes" |
 * "buenas noches") como Buffer ogg/opus, usando caché en disco.
 */
export async function obtenerAudioSaludo(saludo) {
  const slug = SLUGS[saludo];
  if (!slug) throw new Error(`Saludo desconocido: ${saludo}`);
  const rutaOgg = path.join(CACHE_DIR, `${slug}.ogg`);

  if (existsSync(rutaOgg)) {
    return readFileSync(rutaOgg);
  }
  console.log(`[voz] Generando audio de bienvenida (${saludo}) con ElevenLabs...`);
  await generarOgg(`Hola, ${saludo}. Mi nombre es Ángel, ¿cómo te puedo ayudar?`, rutaOgg);
  return readFileSync(rutaOgg);
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
