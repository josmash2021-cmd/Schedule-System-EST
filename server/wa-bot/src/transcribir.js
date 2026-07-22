// Transcripción de notas de voz a texto (Whisper vía API compatible con
// OpenAI; por defecto Groq, que tiene nivel gratuito). Config en .env:
// TRANSCRIBE_API_KEY, TRANSCRIBE_BASE_URL, TRANSCRIBE_MODEL.
import OpenAI, { toFile } from 'openai';
import config from './config.js';

let cliente = null;
if (config.transcribe.apiKey) {
  cliente = new OpenAI({
    apiKey: config.transcribe.apiKey,
    baseURL: config.transcribe.baseURL
  });
} else {
  console.warn('[transcribir] TRANSCRIBE_API_KEY no configurada. Las notas de voz no se podrán transcribir.');
}

export function transcripcionDisponible() {
  return cliente !== null;
}

/**
 * Transcribe un buffer de audio a texto en español.
 * @param {Buffer} buffer - Audio descargado de WhatsApp (ogg/opus normalmente).
 * @param {string} mimetype - Mimetype reportado por WhatsApp.
 * @returns {Promise<string>} Texto transcrito (puede venir vacío).
 */
export async function transcribirAudio(buffer, mimetype = '') {
  if (!cliente) {
    throw new Error('Transcripción no configurada (falta TRANSCRIBE_API_KEY)');
  }
  const ext = mimetype.includes('mpeg') ? 'mp3'
    : mimetype.includes('mp4') ? 'm4a'
    : mimetype.includes('webm') ? 'webm'
    : mimetype.includes('wav') ? 'wav'
    : 'ogg';
  const archivo = await toFile(buffer, `nota-voz.${ext}`);
  const r = await cliente.audio.transcriptions.create({
    model: config.transcribe.model,
    file: archivo,
    language: 'es',
    temperature: 0,
    // Contexto de dominio: Whisper acierta mucho más el vocabulario del
    // negocio y evita transcripciones incoherentes que luego confunden a la IA.
    prompt: 'Conversación en español con la tienda ElectronicST de reparación de celulares y computadoras en Alabama. Temas frecuentes: pantalla, batería, iPhone, laptop, tablet, PC, precio, reparación, mantenimiento, cita, diagnóstico.'
  });
  return (r.text || '').trim();
}
