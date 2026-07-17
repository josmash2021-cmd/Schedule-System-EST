const { CALLMEBOT_API_KEY, OWNER_PHONE } = require('./config');

function formatUSPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

function escapeMarkdown(text) {
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

async function sendOwnerWhatsAppNotification(cita) {
  if (!CALLMEBOT_API_KEY || !OWNER_PHONE) {
    console.log('CallMeBot not configured. Skipping WhatsApp notification.');
    return;
  }

  const phone = formatUSPhone(OWNER_PHONE);
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
    '📍 ElectronicST - 3659 Lorna Rd Suite 157, Hoover, AL 35216',
  ].join('\n');

  const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(text)}&apikey=${CALLMEBOT_API_KEY}`;

  try {
    const res = await fetch(url);
    const body = await res.text();
    if (!res.ok) {
      console.error('CallMeBot error:', res.status, body);
    } else {
      console.log('WhatsApp notification sent:', body);
    }
  } catch (err) {
    console.error('Failed to send WhatsApp notification:', err.message);
  }
}

module.exports = { sendOwnerWhatsAppNotification };
