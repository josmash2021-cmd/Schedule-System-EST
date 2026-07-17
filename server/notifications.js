const twilio = require('twilio');
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_FROM,
  OWNER_PHONE,
} = require('./config');

const STORE_ADDRESS = '3659 Lorna Rd Suite 157, Hoover, AL 35216';
const STORE_PHONE = '(205) 573-7840';

const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

function toWhatsAppNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `whatsapp:+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `whatsapp:+${digits}`;
  if (digits.length > 0) return `whatsapp:+${digits}`;
  return null;
}

async function sendWhatsApp(to, body) {
  if (!twilioClient || !TWILIO_WHATSAPP_FROM) {
    console.log('Twilio not configured. Skipping WhatsApp message.');
    return;
  }
  const toNumber = toWhatsAppNumber(to);
  if (!toNumber) {
    console.log('Invalid phone number for WhatsApp:', to);
    return;
  }

  try {
    const message = await twilioClient.messages.create({
      from: TWILIO_WHATSAPP_FROM,
      to: toNumber,
      body,
    });
    console.log('WhatsApp message sent. SID:', message.sid);
  } catch (err) {
    console.error('Failed to send WhatsApp message:', err.message);
  }
}

async function sendOwnerWhatsAppNotification(cita) {
  if (!OWNER_PHONE) return;

  const text = [
    '*Nueva cita registrada*',
    '',
    `👤 Cliente: ${cita.nombre || '-'}`,
    `📞 Teléfono: ${cita.telefono || '-'}`,
    `📅 Fecha: ${cita.fecha || '-'}`,
    `⏰ Hora: ${cita.hora || '-'}`,
    `🔧 Servicio: ${cita.servicio || '-'}`,
    cita.correo ? `✉️ Correo: ${cita.correo}` : '',
    '',
    `📍 ElectronicST - ${STORE_ADDRESS}`,
  ].join('\n');

  await sendWhatsApp(OWNER_PHONE, text);
}

async function sendClientWhatsAppConfirmation(cita) {
  if (!cita.telefono) return;

  const text = [
    `Hola ${cita.nombre || 'Cliente'},`,
    '',
    'Tu cita con *ElectronicST* ha sido registrada.',
    '',
    `📅 Fecha: ${cita.fecha || '-'}`,
    `⏰ Hora: ${cita.hora ? formatHora(cita.hora) : '-'}`,
    `🔧 Servicio: ${cita.servicio || '-'}`,
    '',
    `📍 Dirección:`,
    STORE_ADDRESS,
    '',
    `📞 Tienda: ${STORE_PHONE}`,
    '',
    'Un agente te contactará pronto para confirmar tu cita.',
    '',
    'Gracias por preferirnos.',
  ].join('\n');

  await sendWhatsApp(cita.telefono, text);
}

function formatHora(hhmm) {
  if (!hhmm) return '-';
  let [h, m] = String(hhmm).split(':').map(Number);
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

module.exports = { sendOwnerWhatsAppNotification, sendClientWhatsAppConfirmation };
