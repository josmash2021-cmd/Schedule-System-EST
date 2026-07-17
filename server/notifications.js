const { CALLMEBOT_API_KEY, OWNER_PHONE } = require('./config');

const STORE_ADDRESS = '3659 Lorna Rd Suite 157, Hoover, AL 35216';
const STORE_PHONE = '(205) 573-7840';

function formatUSPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
}

async function sendCallMeBot(phone, text) {
  if (!CALLMEBOT_API_KEY) {
    console.log('CallMeBot API key not configured. Skipping WhatsApp message.');
    return;
  }
  const to = formatUSPhone(phone);
  if (!to || to.length < 11) {
    console.log('Invalid phone number for WhatsApp:', phone);
    return;
  }

  const url = `https://api.callmebot.com/whatsapp.php?phone=${to}&text=${encodeURIComponent(text)}&apikey=${CALLMEBOT_API_KEY}`;

  try {
    const res = await fetch(url);
    const body = await res.text();
    if (!res.ok) {
      console.error('CallMeBot error:', res.status, body);
    } else {
      console.log('WhatsApp message sent to', to, ':', body);
    }
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

  await sendCallMeBot(OWNER_PHONE, text);
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

  await sendCallMeBot(cita.telefono, text);
}

function formatHora(hhmm) {
  if (!hhmm) return '-';
  let [h, m] = String(hhmm).split(':').map(Number);
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

module.exports = { sendOwnerWhatsAppNotification, sendClientWhatsAppConfirmation };
