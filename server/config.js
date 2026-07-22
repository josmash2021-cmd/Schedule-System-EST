require('dotenv').config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (NODE_ENV === 'production' ? undefined : 'admin123');
let JWT_SECRET = process.env.JWT_SECRET;

if (NODE_ENV === 'production' && !JWT_SECRET) {
  console.error('FATAL: JWT_SECRET debe estar configurado en producción.');
  process.exit(1);
}

if (!JWT_SECRET) {
  JWT_SECRET = 'dev-jwt-secret-change-me';
  console.warn('WARN: Usando JWT_SECRET de desarrollo inseguro. Configura JWT_SECRET en producción.');
}

// Sin contraseña de admin explícita no hay producción: un default conocido
// deja el panel (datos de clientes, borrado masivo) abierto a cualquiera.
if (NODE_ENV === 'production' && (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin123')) {
  console.error('FATAL: ADMIN_PASSWORD debe estar configurada en producción (sin valores por defecto).');
  process.exit(1);
}

if (NODE_ENV !== 'production' && !ADMIN_PASSWORD) {
  console.warn('WARN: ADMIN_PASSWORD no configurada; usando "admin123" solo en desarrollo.');
}

const CORS_ORIGIN = process.env.CORS_ORIGIN || (NODE_ENV === 'production' ? 'https://electronicservicetechnology.com' : '*');
const CALLMEBOT_API_KEY = process.env.CALLMEBOT_API_KEY;
const OWNER_PHONE = process.env.OWNER_PHONE;

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_SMS_FROM = process.env.TWILIO_SMS_FROM;

module.exports = {
  PORT,
  NODE_ENV,
  DATABASE_URL,
  ADMIN_PASSWORD,
  JWT_SECRET,
  CORS_ORIGIN,
  CALLMEBOT_API_KEY,
  OWNER_PHONE,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_SMS_FROM,
};
