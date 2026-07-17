const twilio = require('twilio');
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_SMS_FROM,
  OWNER_PHONE,
} = require('./config');

const STORE_ADDRESS = '3659 Lorna Rd Suite 157, Hoover, AL 35216';
const STORE_PHONE = '(205) 573-7840';

const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return null;
}

async function sendSMS(to, body) {
  if (!twilioClient || !TWILIO_SMS_FROM) {
    console.log('Twilio SMS not configured. Skipping SMS.');
    return;
  }
  const toNumber = toE164(to);
  if (!toNumber) {
    console.log('Invalid phone number for SMS:', to);
    return;
  }

  try {
    const message = await twilioClient.messages.create({
      from: TWILIO_SMS_FROM,
      to: toNumber,
      body,
    });
    console.log('SMS sent. SID:', message.sid);
  } catch (err) {
    console.error('Failed to send SMS:', err.message);
  }
}

async function sendOwnerSMSNotification(cita) {
  if (!OWNER_PHONE) return;

  const text = [
    'Nueva cita registrada',
    '',
    `Cliente: ${cita.nombre || '-'}`,
    `Telefono: ${cita.telefono || '-'}`,
    `Fecha: ${cita.fecha || '-'}`,
    `Hora: ${cita.hora || '-'}`,
    `Servicio: ${cita.servicio || '-'}`,
    cita.correo ? `Correo: ${cita.correo}` : '',
    '',
    `ElectronicST - ${STORE_ADDRESS}`,
  ].join('\n');

  await sendSMS(OWNER_PHONE, text);
}

async function sendClientSMSConfirmation(cita) {
  if (!cita.telefono) return;

  const text = [
    `Hola ${cita.nombre || 'Cliente'},`,
    '',
    'Tu cita con ElectronicST ha sido registrada.',
    '',
    `Fecha: ${cita.fecha || '-'}`,
    `Hora: ${cita.hora ? formatHora(cita.hora) : '-'}`,
    `Servicio: ${cita.servicio || '-'}`,
    '',
    `Direccion: ${STORE_ADDRESS}`,
    `Tienda: ${STORE_PHONE}`,
    '',
    'Un agente te contactara pronto para confirmar tu cita.',
    '',
    'Gracias por preferirnos.',
  ].join('\n');

  await sendSMS(cita.telefono, text);
}

function formatHora(hhmm) {
  if (!hhmm) return '-';
  let [h, m] = String(hhmm).split(':').map(Number);
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

module.exports = { sendOwnerSMSNotification, sendClientSMSConfirmation };
