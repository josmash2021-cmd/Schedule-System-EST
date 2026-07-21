// Carga de configuración del bot de Instagram: variables de entorno y
// archivos JSON del negocio. Independiente del bot de WhatsApp (wa-bot).
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function cargarJson(rutaRelativa, valorPorDefecto) {
  const ruta = path.join(ROOT, rutaRelativa);
  if (!existsSync(ruta)) {
    console.warn(`[config] No se encontró ${rutaRelativa}, se usará un valor por defecto.`);
    return valorPorDefecto;
  }
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch (err) {
    console.error(`[config] Error al leer ${rutaRelativa}: ${err.message}`);
    return valorPorDefecto;
  }
}

const negocio = cargarJson('config/negocio.json', {
  nombre: 'Mi Negocio',
  direccion: '',
  telefono: '',
  horarios: {},
  garantias: '',
  serviciosReparacion: []
});

const catalogo = cargarJson('config/catalogo.json', []);

const fotos = cargarJson('config/fotos.json', {});

// BUSINESS_NAME de .env tiene prioridad sobre el nombre del JSON.
if (process.env.BUSINESS_NAME) {
  negocio.nombre = process.env.BUSINESS_NAME;
}

// Rutas de persistencia propias del bot de Instagram. DATA_DIR_IG (o
// DATA_DIR) permite apuntarlas a un volumen persistente (ej. en Railway)
// para que las conversaciones sobrevivan a los redespliegues.
const dataDir = process.env.DATA_DIR_IG || process.env.DATA_DIR || path.join(ROOT, 'data');

export const config = {
  root: ROOT,
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  },
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
  // Números que reciben los avisos (citas, solicitudes de supervisor).
  // NOTIFY_NUMBERS en .env, separados por coma; si falta, se usa OWNER_NUMBER.
  // En este bot los avisos salen por CallMeBot HTTP (ver src/notificar.js),
  // no por el socket de WhatsApp.
  notifyNumbers: (process.env.NOTIFY_NUMBERS || process.env.OWNER_NUMBER || '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean),
  dataDir,
  authDir: process.env.AUTH_DIR_IG || process.env.AUTH_DIR || path.join(dataDir, 'auth_info'),
  citasPath: path.join(dataDir, 'citas.json'),
  websiteApiUrl: (process.env.WEBSITE_API_URL || 'https://electronicservicetechnology.com').replace(/\/+$/, ''),
  // Transcripción de notas de voz (Whisper vía Groq u otro compatible).
  transcribe: {
    apiKey: process.env.TRANSCRIBE_API_KEY || '',
    baseURL: process.env.TRANSCRIBE_BASE_URL || 'https://api.groq.com/openai/v1',
    model: process.env.TRANSCRIBE_MODEL || 'whisper-large-v3'
  },
  // Instagram Messaging (API oficial de Meta). Ver src/instagram.js.
  instagram: {
    accessToken: process.env.IG_ACCESS_TOKEN || '',
    igUserId: process.env.IG_USER_ID || '',
    verifyToken: process.env.IG_VERIFY_TOKEN || '',
    appSecret: process.env.IG_APP_SECRET || '',
    graphVersion: process.env.GRAPH_API_VERSION || 'v21.0'
  },
  negocio,
  catalogo,
  fotos
};

export default config;

/** true si hay token de Instagram configurado (los envíos reales dependen de él). */
export function igConfigurado() {
  return Boolean(config.instagram.accessToken);
}
