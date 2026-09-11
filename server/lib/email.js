/* Correos transaccionales por Gmail SMTP (nodemailer): el remitente es la
   cuenta real electronicservicetechnology@gmail.com, así Gmail muestra su
   foto de perfil (el logo de EST) en la bandeja del cliente.
   Sin GMAIL_USER/GMAIL_APP_PASSWORD solo loguea y sigue (patrón Twilio: un
   correo fallido NUNCA tumba un pago o una orden).
   Los correos van en INGLÉS, fondo blanco y logo negro (petición del dueño). */
const { EMAIL_FROM, OWNER_EMAIL, SITE_URL, GMAIL_USER, GMAIL_APP_PASSWORD } = require('../config');
const invoices = require('../models/invoices');
const { buildInvoicePdf } = require('./invoicePdf');

const usd = (n) => `$${Number(n || 0).toFixed(2)}`;

// Número de orden público: derivado del id, sin columna extra.
function orderNumber(order) {
  return `EST-${1000 + Number(order.id)}`;
}

function siteBase() {
  return (SITE_URL || 'https://electronicservicetechnology.com').replace(/\/+$/, '');
}

function trackLink(order) {
  return `${siteBase()}/track?t=${order.track_token}`;
}

// Transporter compartido (pool): abrir una conexión SMTP + login por correo
// hace que Google rechace logins seguidos (535 BadCredentials); el pool
// reutiliza una sola conexión autenticada para todos los envíos.
let transporter;
function getTransporter() {
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 1,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text, attachments }) {
  if (!to) return false;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.log(`[email] (sin GMAIL_USER/GMAIL_APP_PASSWORD, no enviado) → ${to}: ${subject}`);
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: EMAIL_FROM.includes('@gmail.com') ? EMAIL_FROM : `ElectronicST <${GMAIL_USER}>`,
      to, subject, html, text,
      ...(attachments && attachments.length
        ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, encoding: 'base64' })) }
        : {}),
    });
    return true;
  } catch (e) {
    console.error('[email] Error Gmail SMTP a', to, '-', e.message);
    return false;
  }
}

// Dorado del brazo del logo, acento de toda la plantilla.
const DORADO = '#c8a24b';

// Plantilla base: tarjeta blanca con encabezado negro (logo con fondo negro
// HORNEADO en la imagen — assets/img/logo-email.png — porque el modo oscuro
// de Gmail invierte los colores del correo y un logo transparente sobre div
// negro "desaparece"; el contenido de las imágenes NO se invierte).
// El encabezado usa <table bgcolor> por compatibilidad con clientes de correo.
function plantilla(titulo, cuerpoHtml, preheader) {
  const logo = `${siteBase()}/assets/img/logo-email.png`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111111;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ''}
  <div style="max-width:560px;margin:0 auto;padding:36px 16px;">
    <div style="background:#ffffff;border:1px solid #e8e8ec;border-radius:16px;overflow:hidden;box-shadow:0 6px 28px rgba(0,0,0,.07);">
      <div style="padding:14px 14px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#0b0b0c" style="background:#0b0b0c;border-radius:14px;overflow:hidden;border-bottom:3px solid ${DORADO};">
          <tr><td align="center" style="padding:26px 24px 22px;border-radius:14px;">
            <img src="${logo}" alt="ElectronicST" width="200" style="display:block;margin:0 auto;width:200px;max-width:70%;height:auto;">
            <div style="font-size:10px;letter-spacing:.28em;color:${DORADO};text-transform:uppercase;margin-top:12px;">Electronic Service Technology</div>
          </td></tr>
        </table>
      </div>
      <div style="padding:34px 30px 30px;">
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;color:#111;margin:0 0 16px;">${titulo}</h1>
        ${cuerpoHtml}
      </div>
    </div>
    <div style="margin-top:26px;text-align:center;font-size:11px;line-height:1.8;color:#9a9aa2;">
      <span style="color:#6a6a72;font-weight:700;letter-spacing:.06em;">ELECTRONICST</span><br>
      3659 Lorna Rd Suite 157, Hoover, AL 35216<br>
      (385) 461-2042 · <a href="${siteBase()}" style="color:#9a9aa2;text-decoration:underline;">electronicservicetechnology.com</a>
    </div>
  </div></body></html>`;
}

// Separa las líneas de productos de las de cargos (tax/envío), que Stripe
// guarda como líneas más del pedido. Los nombres dependen del idioma de la
// sesión de checkout ('Impuestos'/'Tax', 'Envío'/'Shipping').
function splitItems(items) {
  const products = [];
  const extras = { tax: 0, ship: 0 };
  for (const i of items || []) {
    const n = String(i.name || '').trim().toLowerCase();
    if (n === 'impuestos' || n === 'tax') extras.tax += Number(i.price) || 0;
    else if (n === 'envío' || n === 'envio' || n === 'shipping') extras.ship += Number(i.price) || 0;
    else products.push(i);
  }
  return { products, extras };
}

// Fila de producto con foto (servida por el sitio público), nombre,
// descripción y precio. Sin foto (órdenes manuales FB) solo el texto.
const filaProducto = (i) => {
  const foto = i.img
    ? `<img src="${siteBase()}/${String(i.img).replace(/^\/+/, '')}" alt="" width="60" style="display:block;width:60px;height:60px;object-fit:cover;border-radius:10px;border:1px solid #ececf0;">`
    : '';
  return `<tr>
    <td style="padding:12px 14px 12px 0;border-bottom:1px solid #f0f0f3;width:64px;vertical-align:top;">${foto}</td>
    <td style="padding:12px 0;border-bottom:1px solid #f0f0f3;vertical-align:top;">
      <div style="font-size:14px;color:#111;font-weight:700;">${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}</div>
      ${i.desc ? `<div style="font-size:12px;color:#9a9aa2;margin-top:4px;line-height:1.5;">${i.desc}</div>` : ''}
    </td>
    <td style="padding:12px 0;border-bottom:1px solid #f0f0f3;text-align:right;vertical-align:top;font-size:14px;color:#3a3a40;white-space:nowrap;">${usd(i.price)}</td>
  </tr>`;
};

// Resumen del pedido: tabla de productos + bloque de totales en caja gris
// (Subtotal / Tax / Shipping / Total). Tax y Shipping solo si existen.
function resumenPedido(order) {
  const { products, extras } = splitItems(order.items);
  const subtotal = products.reduce((a, i) => a + (Number(i.price) || 0), 0);
  const cargo = (label, val) =>
    `<tr><td style="padding:5px 0;font-size:13px;color:#6a6a72;">${label}</td><td style="padding:5px 0;text-align:right;font-size:13px;color:#6a6a72;">${usd(val)}</td></tr>`;
  let totales = cargo('Subtotal', subtotal);
  if (extras.tax > 0) totales += cargo('Tax', extras.tax);
  if (extras.ship > 0) totales += cargo('Shipping', extras.ship);
  totales += `<tr><td style="padding:12px 0 2px;font-size:16px;color:#111;border-top:2px solid #0b0b0c;"><strong>Total paid</strong></td><td style="padding:12px 0 2px;text-align:right;font-size:16px;color:#111;border-top:2px solid #0b0b0c;"><strong>${usd(order.total)}</strong></td></tr>`;
  return `
    <table style="width:100%;border-collapse:collapse;">${products.map(filaProducto).join('')}</table>
    <div style="background:#fafafa;border:1px solid #f0f0f3;border-radius:12px;padding:14px 18px;margin-top:16px;">
      <table style="width:100%;border-collapse:collapse;">${totales}</table>
    </div>`;
}

const boton = (url, texto) =>
  `<div style="text-align:center;margin:30px 0 6px;"><a href="${url}" style="display:inline-block;background:#0b0b0c;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:.03em;padding:14px 36px;border-radius:999px;border-bottom:3px solid ${DORADO};">${texto}</a></div>`;

// Caja destacada (p. ej. número de tracking) con etiqueta en dorado.
const cajaDato = (etiqueta, valor, detalle) =>
  `<div style="background:#fafafa;border:1px solid #ececf0;border-left:3px solid ${DORADO};border-radius:10px;padding:16px 20px;margin:18px 0;">
    <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${DORADO};font-weight:700;">${etiqueta}</div>
    <div style="font-size:17px;font-weight:700;color:#111;margin-top:5px;">${valor}</div>
    ${detalle ? `<div style="font-size:12px;color:#9a9aa2;margin-top:3px;">${detalle}</div>` : ''}
  </div>`;

// --- Correos de pedido ---

// Orden nueva: correo al dueño + confirmación al cliente con su link de
// seguimiento. Ambos se mandan en paralelo; un fallo no afecta al otro.
async function sendNewOrderEmails(order) {
  const num = orderNumber(order);
  const total = usd(order.total);
  const tasks = [];

  if (OWNER_EMAIL) {
    tasks.push(sendEmail({
      to: OWNER_EMAIL,
      subject: `New order ${num} — ${total}`,
      text: `New order ${num}\nCustomer: ${order.customer_name || order.email || '—'}\nTotal: ${total}\nAddress: ${order.address || '—'}`,
      html: plantilla(`New order ${num}`, `
        ${resumenPedido(order)}
        ${cajaDato('Customer', order.customer_name || '—', `Email: ${order.email || '—'} · Phone: ${order.phone || '—'}<br>Address: ${order.address || '—'}`)}`,
        `New order ${num} — ${total}`),
    }));
  }

  if (order.email) {
    const link = trackLink(order);
    // Recibo PDF adjunto: la factura ya se creó sola al registrar la orden
    // (autoInvoice); si no está, se crea al vuelo. Un fallo del PDF NUNCA
    // impide mandar la confirmación.
    let attachments;
    let notaRecibo = '';
    try {
      const inv = await invoices.createFromOrder(order);
      const pdf = await buildInvoicePdf(inv);
      attachments = [{ filename: `Receipt-${inv.invoice_number || num}.pdf`, content: pdf.toString('base64') }];
      notaRecibo = `<p style="font-size:13px;color:#55555c;">Your receipt is attached as a PDF.</p>`;
    } catch (e) {
      console.error('[email] No se pudo adjuntar el recibo PDF:', e.message);
    }
    tasks.push(sendEmail({
      to: order.email,
      subject: `Thanks for your purchase! Order ${num}`,
      text: `Hi${order.customer_name ? ' ' + order.customer_name : ''},\n\nYour order ${num} is confirmed. Total: ${total}.\nYour receipt is attached as a PDF.\nTrack your shipment here: ${link}`,
      html: plantilla(`Thanks for your purchase!`, `
        <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:0 0 20px;">Hi${order.customer_name ? ' <strong>' + order.customer_name + '</strong>' : ''}, your order <strong style="color:#111;">${num}</strong> is confirmed.</p>
        ${resumenPedido(order)}
        ${notaRecibo}
        ${boton(link, 'Track my package')}`,
        `Your order ${num} is confirmed — track your package`),
      attachments,
    }));
  }

  await Promise.all(tasks);
}

// Repuesto en camino hacia el taller: correo con el número de rastreo y el
// link de track.html (el token del ticket abre la vista de reparación).
async function sendRepairTrackingEmail(ticket) {
  if (!ticket.customer_email) return false;
  const num = `REP-${1000 + Number(ticket.id)}`;
  const link = `${siteBase()}/track?t=${ticket.track_token}`;
  const device = [ticket.device_brand, ticket.device_model].filter(Boolean).join(' ') || 'device';
  const carrier = ticket.carrier ? String(ticket.carrier).toUpperCase() : '';
  return sendEmail({
    to: ticket.customer_email,
    subject: `The part for your repair ${num} is on its way`,
    text: `Hi${ticket.customer_name ? ' ' + ticket.customer_name : ''},\n\nThe replacement part your ${device} needs is on its way to us.\nTracking: ${ticket.tracking_number}${carrier ? ' (' + carrier + ')' : ''}\nYou can track the package and the status of your repair here: ${link}`,
    html: plantilla(`The part for your repair ${num} is on its way`, `
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:0;">Hi${ticket.customer_name ? ' <strong>' + ticket.customer_name + '</strong>' : ''}, the replacement part your <strong style="color:#111;">${device}</strong> needs is on its way to us.</p>
      ${cajaDato('Tracking number', ticket.tracking_number, carrier ? `Carrier: ${carrier}` : '')}
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:18px 0 0;">You can track the package and the status of your repair with the button below.</p>
      ${boton(link, 'Track my repair')}`,
      `The part for your repair ${num} is on its way — track it here`),
  });
}

// El admin guardó el tracking: "tu pedido va en camino".
async function sendTrackingEmail(order) {
  if (!order.email) return false;
  const num = orderNumber(order);
  const carrier = order.carrier ? String(order.carrier).toUpperCase() : '';
  return sendEmail({
    to: order.email,
    subject: `Your order ${num} is on its way`,
    text: `Your order ${num} is on its way.\nTracking: ${order.tracking_number}${carrier ? ' (' + carrier + ')' : ''}\nFollow it here: ${trackLink(order)}`,
    html: plantilla(`Your order ${num} is on its way`, `
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:0;">Good news — your package has shipped.</p>
      ${cajaDato('Tracking number', order.tracking_number, carrier ? `Carrier: ${carrier}` : '')}
      ${boton(trackLink(order), 'View my order')}`,
      `Your order ${num} is on its way — track it here`),
  });
}

// AfterShip/USPS reporta el paquete en tránsito.
async function sendTransitEmail(order) {
  if (!order.email) return false;
  const num = orderNumber(order);
  return sendEmail({
    to: order.email,
    subject: `Your order ${num} is in transit`,
    text: `Your order ${num} is in transit to your address.\nFollow it here: ${trackLink(order)}`,
    html: plantilla(`Your order ${num} is in transit`, `
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:0;">Your package is on the move toward your address.</p>
      ${boton(trackLink(order), 'Track my order')}`,
      `Your order ${num} is in transit`),
  });
}

// AfterShip/USPS reporta la entrega.
async function sendDeliveredEmail(order) {
  if (!order.email) return false;
  const num = orderNumber(order);
  return sendEmail({
    to: order.email,
    subject: `Your order ${num} was delivered`,
    text: `Your order ${num} was delivered. Thanks for your purchase!`,
    html: plantilla(`Your order ${num} was delivered`, `
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:0;">Your package has arrived at your address. Thanks for your purchase!</p>
      ${boton(trackLink(order), 'View my order')}`,
      `Your order ${num} was delivered`),
  });
}

// Factura de la orden con el PDF del Bill of Sale adjunto (mismo diseño que
// el del panel, generado con lib/invoicePdf.js).
async function sendInvoiceEmail(order, invoice, pdfBuffer) {
  if (!order.email) return false;
  const num = invoice.invoice_number || orderNumber(order);
  const filename = `Receipt-${num}.pdf`;
  return sendEmail({
    to: order.email,
    subject: `Your invoice ${num} — ElectronicST`,
    text: `Your invoice ${num} is attached as a PDF. Total: ${usd(invoice.total)}.\nTrack your order here: ${trackLink(order)}`,
    html: plantilla(`Your invoice ${num}`, `
      <p style="font-size:14px;color:#3a3a40;">Your invoice is attached as a PDF. Total: <strong style="color:#111;">${usd(invoice.total)}</strong>.</p>
      ${boton(trackLink(order), 'View my order')}`),
    attachments: [{ filename, content: pdfBuffer.toString('base64') }],
  });
}

// Factura de la REPARACIÓN con el PDF adjunto (reenvio desde el panel).
async function sendRepairInvoiceEmail(ticket, invoice, pdfBuffer) {
  const to = ticket.customer_email || invoice.buyer_email;
  if (!to) return false;
  const num = invoice.invoice_number || `REP-${1000 + Number(ticket.id)}`;
  const filename = `Receipt-${num}.pdf`;
  const link = `${siteBase()}/track?t=${ticket.track_token}`;
  return sendEmail({
    to,
    subject: `Your invoice ${num} — ElectronicST`,
    text: `Your invoice ${num} is attached as a PDF. Total: ${usd(invoice.total)}.\nTrack your repair here: ${link}`,
    html: plantilla(`Your invoice ${num}`, `
      <p style="font-size:14px;color:#3a3a40;">Your invoice is attached as a PDF. Total: <strong style="color:#111;">${usd(invoice.total)}</strong>.</p>
      ${boton(link, 'Track my repair')}`),
    attachments: [{ filename, content: pdfBuffer.toString('base64') }],
  });
}

// La pieza del repuesto LLEGÓ al taller (ship_tag Delivered del job/webhook).
// Avisa al cliente que ya empezamos a trabajar su equipo. Se manda una sola
// vez (flag email_part_arrived en repair_tickets).
async function sendPartArrivedEmail(ticket) {
  if (!ticket.customer_email) return false;
  const num = `REP-${1000 + Number(ticket.id)}`;
  const link = `${siteBase()}/track?t=${ticket.track_token}`;
  const device = [ticket.device_brand, ticket.device_model].filter(Boolean).join(' ') || 'device';
  return sendEmail({
    to: ticket.customer_email,
    subject: `The part for your repair ${num} has arrived`,
    text: `Hi${ticket.customer_name ? ' ' + ticket.customer_name : ''},\n\nGreat news: the replacement part your ${device} needed has arrived at our shop. Our technicians will start working on your device right away, and we'll let you know as soon as it's ready for pickup.\n\nFollow your repair here: ${link}`,
    html: plantilla(`The part for your repair ${num} has arrived`, `
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:0;">Hi${ticket.customer_name ? ' <strong>' + ticket.customer_name + '</strong>' : ''}, great news: the replacement part your <strong style="color:#111;">${device}</strong> needed has arrived at our shop.</p>
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:16px 0 0;">Our technicians will start working on your device right away, and we'll let you know as soon as it's ready for pickup.</p>
      ${cajaDato('Your repair', device, `Repair ${num}`)}
      ${boton(link, 'Track my repair')}`,
      `The part for your ${device} is here — we start working on it now`),
  });
}

// La reparación quedó LISTA para recoger (status 'listo' en el panel).
// La recogida es CON CITA: el botón principal abre la página de citas en
// modo recogida (?pickup=repair&rep=REP-1xxx, formulario pre-marcado) y
// debajo queda un enlace discreto al seguimiento. Incluye saldo pendiente
// si lo hay y la dirección/horario del taller. Una sola vez (flag
// email_ready).
async function sendRepairReadyEmail(ticket) {
  if (!ticket.customer_email) return false;
  const num = `REP-${1000 + Number(ticket.id)}`;
  const link = `${siteBase()}/track?t=${ticket.track_token}`;
  const bookLink = `${siteBase()}/book-appointment?pickup=repair&rep=${num}`;
  const device = [ticket.device_brand, ticket.device_model].filter(Boolean).join(' ') || 'device';
  const total = ticket.final_price != null ? Number(ticket.final_price) : (ticket.quoted_price != null ? Number(ticket.quoted_price) : 0);
  const paid = Number(ticket.amount_paid) || 0;
  const remaining = Math.max(total - paid, 0);
  const cajaSaldo = remaining > 0
    ? cajaDato('Balance due at pickup', usd(remaining), `Total: ${usd(total)} · Already paid: ${usd(paid)}`)
    : '';
  return sendEmail({
    to: ticket.customer_email,
    subject: `Your repair ${num} is ready for pickup`,
    text: `Hi${ticket.customer_name ? ' ' + ticket.customer_name : ''},\n\nYour ${device} is ready! Pickups are BY APPOINTMENT only — please book your pickup time here: ${bookLink}\n\nShop: 3659 Lorna Rd Suite 157, Hoover, AL 35216 (Mon–Sat 10:00 AM–3:00 PM).${remaining > 0 ? `\nBalance due at pickup: ${usd(remaining)}` : ''}\n\nTrack your repair: ${link}`,
    html: plantilla(`Your repair ${num} is ready for pickup`, `
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:0;">Hi${ticket.customer_name ? ' <strong>' + ticket.customer_name + '</strong>' : ''}, your <strong style="color:#111;">${device}</strong> is ready! Pickups are <strong>by appointment only</strong> — please book your pickup time and we'll have it waiting for you.</p>
      ${cajaDato('Pick up at', '3659 Lorna Rd Suite 157, Hoover, AL 35216', 'Mon–Sat 10:00 AM – 3:00 PM · (385) 461-2042 · By appointment only')}
      ${cajaSaldo}
      ${boton(bookLink, 'Book pickup appointment')}
      <p style="text-align:center;font-size:12px;margin:14px 0 0;"><a href="${link}" style="color:#6a6a72;text-decoration:underline;">View my repair</a></p>`,
      `Your ${device} is ready — book your pickup appointment`),
  });
}

// Cita NUEVA creada en el sitio (cualquier servicio): confirmación por
// correo al dueño (OWNER_EMAIL). Complementa el WhatsApp (que sigue yendo).
async function sendNewAppointmentOwnerEmail(a) {
  if (!OWNER_EMAIL) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(a.fecha || ''));
  const fechaLarga = m
    ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : String(a.fecha || '—');
  let horaLinda = String(a.hora || '—');
  const hm = /^(\d{2}):(\d{2})/.exec(horaLinda);
  if (hm) {
    let hh = Number(hm[1]); const ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12;
    horaLinda = `${hh}:${hm[2]} ${ap}`;
  }
  return sendEmail({
    to: OWNER_EMAIL,
    subject: `New appointment — ${fechaLarga} · ${horaLinda}`,
    text: `New appointment\nCustomer: ${a.nombre || '—'}\nPhone: ${a.telefono || '—'}\nEmail: ${a.correo || '—'}\nService: ${a.servicio || '—'}\nWhen: ${fechaLarga} · ${horaLinda}\nSource: ${a.origen || 'web'}`,
    html: plantilla(`New appointment`, `
      <p style="font-size:14px;line-height:1.6;color:#3a3a40;margin:0 0 6px;">A customer just booked an appointment on the website.</p>
      ${cajaDato('When', `${fechaLarga} · ${horaLinda}`, `Source: ${a.origen || 'web'}`)}
      ${cajaDato('Customer', a.nombre || '—', `Phone: ${a.telefono || '—'}${a.correo ? ' · Email: ' + a.correo : ''}`)}
      ${cajaDato('Service', a.servicio || '—')}`,
      `New appointment — ${fechaLarga} · ${horaLinda}`),
  });
}

module.exports = { sendEmail, sendNewOrderEmails, sendTrackingEmail, sendTransitEmail, sendDeliveredEmail, sendInvoiceEmail, sendRepairTrackingEmail, sendRepairInvoiceEmail, sendPartArrivedEmail, sendRepairReadyEmail, sendNewAppointmentOwnerEmail, orderNumber, trackLink };
