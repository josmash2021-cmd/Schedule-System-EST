/* Correos transaccionales con Resend (https://resend.com) — se llama por HTTP
   con fetch, sin dependencias nuevas. Sin RESEND_API_KEY solo loguea y sigue
   (patrón Twilio: un correo fallido NUNCA tumba un pago o una orden).
   Los correos son en español y monocromos, acordes al sitio. */
const { RESEND_API_KEY, EMAIL_FROM, OWNER_EMAIL, SITE_URL } = require('../config');

const usd = (n) => `$${Number(n || 0).toFixed(2)}`;

// Número de orden público: derivado del id, sin columna extra.
function orderNumber(order) {
  return `EST-${1000 + Number(order.id)}`;
}

function trackLink(order) {
  const base = (SITE_URL || 'https://electronicservicetechnology.com').replace(/\/+$/, '');
  return `${base}/track?t=${order.track_token}`;
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

// Plantilla base monocroma (negro/dorado como el sitio).
function plantilla(titulo, cuerpoHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0c0c0f;font-family:Arial,Helvetica,sans-serif;color:#f5f5f7;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #2a2a30;">
      <div style="font-size:20px;font-weight:700;letter-spacing:.06em;color:#fff;">Electronic<span style="color:#d4af37;">ST</span></div>
      <div style="font-size:10px;letter-spacing:.2em;color:#8a8a92;text-transform:uppercase;margin-top:4px;">Electronic Service Technology</div>
    </div>
    <h1 style="font-size:18px;color:#fff;margin:26px 0 10px;">${titulo}</h1>
    ${cuerpoHtml}
    <div style="margin-top:30px;padding-top:16px;border-top:1px solid #2a2a30;font-size:11px;color:#8a8a92;text-align:center;">
      ElectronicST · 3659 Lorna Rd Suite 157, Hoover, AL 35216 · (205) 573-7840
    </div>
  </div></body></html>`;
}

const itemsHtml = (items) => (items || [])
  .map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #2a2a30;">${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}</td><td style="padding:6px 0;border-bottom:1px solid #2a2a30;text-align:right;">${usd(i.price)}</td></tr>`)
  .join('');

const boton = (url, texto) =>
  `<div style="text-align:center;margin:26px 0;"><a href="${url}" style="display:inline-block;background:#d4af37;color:#000;text-decoration:none;font-weight:700;padding:12px 28px;border-radius:8px;">${texto}</a></div>`;

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
      subject: `Nuevo pedido ${num} — ${total}`,
      text: `Nuevo pedido ${num}\nCliente: ${order.customer_name || order.email || '—'}\nTotal: ${total}\nDirección: ${order.address || '—'}`,
      html: plantilla(`Nuevo pedido ${num}`, `
        <table style="width:100%;font-size:14px;color:#d5d5da;border-collapse:collapse;">${itemsHtml(order.items)}</table>
        <p style="font-size:16px;color:#fff;"><strong>Total: ${total}</strong></p>
        <p style="font-size:13px;color:#b9b9c0;">Cliente: ${order.customer_name || '—'}<br>Correo: ${order.email || '—'}<br>Teléfono: ${order.phone || '—'}<br>Dirección: ${order.address || '—'}</p>`),
    }));
  }

  if (order.email) {
    const link = trackLink(order);
    tasks.push(sendEmail({
      to: order.email,
      subject: `¡Gracias por tu compra! Pedido ${num}`,
      text: `Hola${order.customer_name ? ' ' + order.customer_name : ''},\n\nTu pedido ${num} fue confirmado. Total: ${total}.\nSigue tu envío aquí: ${link}`,
      html: plantilla(`¡Gracias por tu compra!`, `
        <p style="font-size:14px;color:#d5d5da;">Hola${order.customer_name ? ' <strong>' + order.customer_name + '</strong>' : ''}, tu pedido <strong style="color:#fff;">${num}</strong> está confirmado.</p>
        <table style="width:100%;font-size:14px;color:#d5d5da;border-collapse:collapse;">${itemsHtml(order.items)}</table>
        <p style="font-size:16px;color:#fff;"><strong>Total pagado: ${total}</strong></p>
        ${boton(link, 'Rastrear mi pedido')}`),
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
    subject: `Tu pedido ${num} va en camino`,
    text: `Tu pedido ${num} va en camino.\nTracking: ${order.tracking_number}${carrier ? ' (' + carrier + ')' : ''}\nSíguelo aquí: ${trackLink(order)}`,
    html: plantilla(`Tu pedido ${num} va en camino`, `
      <p style="font-size:14px;color:#d5d5da;">Número de tracking: <strong style="color:#fff;">${order.tracking_number}</strong>${carrier ? ` · ${carrier}` : ''}</p>
      ${boton(trackLink(order), 'Ver mi pedido')}`),
  });
}

// AfterShip reporta el paquete en tránsito.
async function sendTransitEmail(order) {
  if (!order.email) return;
  const num = orderNumber(order);
  await sendEmail({
    to: order.email,
    subject: `Tu pedido ${num} está en tránsito`,
    text: `Tu pedido ${num} está en tránsito hacia tu dirección.\nSíguelo aquí: ${trackLink(order)}`,
    html: plantilla(`Tu pedido ${num} está en tránsito`, `
      <p style="font-size:14px;color:#d5d5da;">El paquete ya está en movimiento hacia tu dirección.</p>
      ${boton(trackLink(order), 'Rastrear mi pedido')}`),
  });
}

// AfterShip reporta la entrega.
async function sendDeliveredEmail(order) {
  if (!order.email) return;
  const num = orderNumber(order);
  await sendEmail({
    to: order.email,
    subject: `Tu pedido ${num} fue entregado`,
    text: `Tu pedido ${num} fue entregado. ¡Gracias por tu compra!`,
    html: plantilla(`Tu pedido ${num} fue entregado`, `
      <p style="font-size:14px;color:#d5d5da;">El paquete llegó a tu dirección. ¡Gracias por tu compra!</p>
      ${boton(trackLink(order), 'Ver mi pedido')}`),
  });
}

// Factura de la orden con el PDF del Bill of Sale adjunto (mismo diseño que
// el del panel, generado con lib/invoicePdf.js).
async function sendInvoiceEmail(order, invoice, pdfBuffer) {
  if (!order.email) return false;
  const num = invoice.invoice_number || orderNumber(order);
  const filename = `Factura-${num}.pdf`;
  return sendEmail({
    to: order.email,
    subject: `Tu factura ${num} — ElectronicST`,
    text: `Adjuntamos tu factura ${num} en PDF. Total: ${usd(invoice.total)}.\nSigue tu pedido aquí: ${trackLink(order)}`,
    html: plantilla(`Tu factura ${num}`, `
      <p style="font-size:14px;color:#d5d5da;">Adjuntamos tu factura en PDF. Total: <strong style="color:#fff;">${usd(invoice.total)}</strong>.</p>
      ${boton(trackLink(order), 'Ver mi pedido')}`),
    attachments: [{ filename, content: pdfBuffer.toString('base64') }],
  });
}

module.exports = { sendEmail, sendNewOrderEmails, sendTrackingEmail, sendTransitEmail, sendDeliveredEmail, sendInvoiceEmail, orderNumber, trackLink };
