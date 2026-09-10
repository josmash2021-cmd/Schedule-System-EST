/* Envía de PRUEBA los correos nuevos/actualizados a josmash2021@gmail.com:
   1) "reparación lista" (ahora con botón Book pickup appointment) y
   2) confirmación de cita al dueño. Ticket/cita de muestra (sin tocar la
   base; los links NO abren nada real).
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

const cita = {
  nombre: 'Josue Mash',
  telefono: '(205) 555-0182',
  correo: 'cliente@correo.com',
  servicio: 'Pickup: recogida de equipo reparado · REP-1083',
  fecha: new Date().toISOString().slice(0, 10),
  hora: '14:30',
  origen: 'web',
};

(async () => {
  const ok1 = await email.sendRepairReadyEmail(ticket);
  console.log('correo "listo para recoger" (con botón de cita):', ok1 ? 'ENVIADO' : 'NO enviado');
  const ok2 = await email.sendNewAppointmentOwnerEmail(cita);
  console.log('correo "nueva cita" al dueño:', ok2 ? 'ENVIADO' : 'NO enviado');
  process.exit(ok1 && ok2 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
