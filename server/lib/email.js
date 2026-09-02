/* Correos transaccionales con Resend (https://resend.com) — se llama por HTTP
   con fetch, sin dependencias nuevas. Sin RESEND_API_KEY solo loguea y sigue
   (patrón Twilio: un correo fallido NUNCA tumba un pago o una orden).
   Los correos van en INGLÉS, fondo blanco y logo negro (petición del dueño). */
const { RESEND_API_KEY, EMAIL_FROM, OWNER_EMAIL, SITE_URL } = require('../config');

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

async function sendEmail({ to, subject, html, text, attachments }) {
  if (!RESEND_API_KEY) {
    console.log(`[email] (sin RESEND_API_KEY, no enviado) → ${to}: ${subject}`);
    return false;
  }
  if (!to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM, to: [to], subject, html, text,
        ...(attachments && attachments.length ? { attachments } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[email] Resend HTTP ${res.status} → ${to}:`, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] Error enviando a', to, '-', e.message);
    return false;
  }
}

// Plantilla base: fondo blanco, logo negro (assets/img/logo-black.png servido
// por el sitio público), acento dorado del brazo del logo.
function plantilla(titulo, cuerpoHtml) {
  const logo = `${siteBase()}/assets/img/logo-black.png`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#111111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border:1px solid #e5e5e8;border-radius:12px;padding:32px 28px;">
      <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #e5e5e8;">
        <img src="${logo}" alt="ElectronicST" width="170" style="display:block;margin:0 auto;max-width:170px;height:auto;">
        <div style="font-size:10px;letter-spacing:.2em;color:#8a8a92;text-transform:uppercase;margin-top:10px;">Electronic Service Technology</div>
      </div>
      <h1 style="font-size:18px;color:#111;margin:26px 0 10px;">${titulo}</h1>
      ${cuerpoHtml}
    </div>
    <div style="margin-top:20px;font-size:11px;color:#8a8a92;text-align:center;">
      ElectronicST · 3659 Lorna Rd Suite 157, Hoover, AL 35216 · (205) 573-7840
    </div>
  </div></body></html>`;
}

const itemsHtml = (items) => (items || [])
  .map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #e5e5e8;">${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}</td><td style="padding:6px 0;border-bottom:1px solid #e5e5e8;text-align:right;">${usd(i.price)}</td></tr>`)
  .join('');

const boton = (url, texto) =>
  `<div style="text-align:center;margin:26px 0;"><a href="${url}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;">${texto}</a></div>`;

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
        <table style="width:100%;font-size:14px;color:#3a3a40;border-collapse:collapse;">${itemsHtml(order.items)}</table>
        <p style="font-size:16px;color:#111;"><strong>Total: ${total}</strong></p>
        <p style="font-size:13px;color:#55555c;">Customer: ${order.customer_name || '—'}<br>Email: ${order.email || '—'}<br>Phone: ${order.phone || '—'}<br>Address: ${order.address || '—'}</p>`),
    }));
  }

  if (order.email) {
    const link = trackLink(order);
    tasks.push(sendEmail({
      to: order.email,
      subject: `Thanks for your purchase! Order ${num}`,
      text: `Hi${order.customer_name ? ' ' + order.customer_name : ''},\n\nYour order ${num} is confirmed. Total: ${total}.\nTrack your shipment here: ${link}`,
      html: plantilla(`Thanks for your purchase!`, `
        <p style="font-size:14px;color:#3a3a40;">Hi${order.customer_name ? ' <strong>' + order.customer_name + '</strong>' : ''}, your order <strong style="color:#111;">${num}</strong> is confirmed.</p>
        <table style="width:100%;font-size:14px;color:#3a3a40;border-collapse:collapse;">${itemsHtml(order.items)}</table>
        <p style="font-size:16px;color:#111;"><strong>Total paid: ${total}</strong></p>
        ${boton(link, 'Track my order')}`),
    }));
  }

  await Promise.all(tasks);
}

// El admin guardó el tracking: "tu pedido va en camino".
async function sendTrackingEmail(order) {
  if (!order.email) return;
  const num = orderNumber(order);
  const carrier = order.carrier ? String(order.carrier).toUpperCase() : '';
  await sendEmail({
    to: order.email,
    subject: `Your order ${num} is on its way`,
    text: `Your order ${num} is on its way.\nTracking: ${order.tracking_number}${carrier ? ' (' + carrier + ')' : ''}\nFollow it here: ${trackLink(order)}`,
    html: plantilla(`Your order ${num} is on its way`, `
      <p style="font-size:14px;color:#3a3a40;">Tracking number: <strong style="color:#111;">${order.tracking_number}</strong>${carrier ? ` · ${carrier}` : ''}</p>
      ${boton(trackLink(order), 'View my order')}`),
  });
}

// AfterShip reporta el paquete en tránsito.
async function sendTransitEmail(order) {
  if (!order.email) return;
  const num = orderNumber(order);
  await sendEmail({
    to: order.email,
    subject: `Your order ${num} is in transit`,
    text: `Your order ${num} is in transit to your address.\nFollow it here: ${trackLink(order)}`,
    html: plantilla(`Your order ${num} is in transit`, `
      <p style="font-size:14px;color:#3a3a40;">Your package is on the move toward your address.</p>
      ${boton(trackLink(order), 'Track my order')}`),
  });
}

// AfterShip reporta la entrega.
async function sendDeliveredEmail(order) {
  if (!order.email) return;
  const num = orderNumber(order);
  await sendEmail({
    to: order.email,
    subject: `Your order ${num} was delivered`,
    text: `Your order ${num} was delivered. Thanks for your purchase!`,
    html: plantilla(`Your order ${num} was delivered`, `
      <p style="font-size:14px;color:#3a3a40;">Your package has arrived at your address. Thanks for your purchase!</p>
      ${boton(trackLink(order), 'View my order')}`),
  });
}

// Factura de la orden con el PDF del Bill of Sale adjunto (mismo diseño que
// el del panel, generado con lib/invoicePdf.js).
async function sendInvoiceEmail(order, invoice, pdfBuffer) {
  if (!order.email) return false;
  const num = invoice.invoice_number || orderNumber(order);
  const filename = `Invoice-${num}.pdf`;
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

module.exports = { sendEmail, sendNewOrderEmails, sendTrackingEmail, sendTransitEmail, sendDeliveredEmail, sendInvoiceEmail, orderNumber, trackLink };
