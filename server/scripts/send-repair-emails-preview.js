/* Envía de PRUEBA los dos correos de reparación (pieza llegó + listo para
   recoger) a josmash2021@gmail.com, con un ticket de muestra (sin tocar la
   base; el link de seguimiento NO abrirá una reparación real).
   Uso: railway run node server/scripts/send-repair-emails-preview.js */
const email = require('../lib/email');

const PREVIEW_TO = 'josmash2021@gmail.com';

const ticket = {
  id: 83, // REP-1083
  device_brand: 'Apple',
  device_model: 'iPhone 13 Pro',
  customer_name: 'Josue',
  customer_email: PREVIEW_TO,
  track_token: 'preview',
  final_price: 249,
  amount_paid: 130,
};

(async () => {
  const ok1 = await email.sendPartArrivedEmail(ticket);
  console.log('correo "pieza llegó":', ok1 ? 'ENVIADO' : 'NO enviado');
  const ok2 = await email.sendRepairReadyEmail(ticket);
  console.log('correo "listo para recoger":', ok2 ? 'ENVIADO' : 'NO enviado');
  process.exit(ok1 && ok2 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
