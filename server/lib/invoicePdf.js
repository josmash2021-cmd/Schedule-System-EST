/* Generador del PDF del Bill of Sale con pdfkit: replica el diseño del
   documento del panel (InvoiceDoc): header con logo, cajas Seller/Buyer,
   Sale Information, tabla de artículos, totales, garantía y firmas.
   Letter (612×792 pt), monocromo, fuentes Helvetica de serie. */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Versión oscura del logo (letras negras): la normal es blanca y no se ve
// sobre el fondo blanco del documento.
const LOGO = path.resolve(__dirname, '..', 'public', 'assets', 'img', 'logo-dark.png');

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// pg devuelve sale_date (tipo DATE) como Date y sale_time como "HH:MM:SS";
// en el PDF van formateados (DD/MM/YYYY y HH:MM), nunca el crudo de la DB.
function fmtDate(v) {
  if (!v) return '—';
  if (v instanceof Date) {
    const iso = v.toISOString().slice(0, 10); // YYYY-MM-DD
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function fmtTime(v) {
  if (!v) return '—';
  const s = String(v);
  const m = s.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : s;
}

// Dimensiones de un PNG leyendo su cabecera IHDR (sin dependencias).
function pngSize(file) {
  try {
    const buf = fs.readFileSync(file);
    if (buf.length > 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
  } catch (_) { /* sin logo */ }
  return null;
}

function caja(doc, x, y, w, h) {
  doc.roundedRect(x, y, w, h, 6).lineWidth(0.8).strokeColor('#bbbbbb').stroke();
}

function tituloCaja(doc, text, x, y, w) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#55555c')
    .text(text, x + 14, y + 12, { width: w - 28, characterSpacing: 1.2 });
  doc.moveTo(x + 14, y + 24).lineTo(x + w - 14, y + 24)
    .lineWidth(0.5).strokeColor('#dddddd').stroke();
}

// invoice: fila de `invoices` (campos texto + items JSONB).
// Devuelve un Buffer con el PDF listo para descargar o adjuntar por correo.
function buildInvoicePdf(inv) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = 612;
    const M = 48;         // margen lateral
    const CW = PW - M * 2; // ancho de contenido
    let y = M;

    // ---------- Header ----------
    const logoH = 54;
    let brandX = M;
    if (fs.existsSync(LOGO)) {
      try {
        doc.image(LOGO, M, y, { height: logoH });
        const dims = pngSize(LOGO);
        const logoW = dims ? (logoH * dims.w / dims.h) : logoH;
        brandX = M + logoW + 14;
      } catch (_) { /* si el logo falla, solo texto */ }
    }
    doc.font('Helvetica-Bold').fontSize(17).fillColor('#111')
      .text(inv.seller_name || 'ElectronicST, LLC', brandX, y + 8, { width: 250 });
    doc.font('Helvetica').fontSize(8).fillColor('#55555c')
      .text('S A L E S   &   R E P A I R   S E R V I C E', brandX, y + 30, { characterSpacing: 1 });

    doc.font('Helvetica-Bold').fontSize(21).fillColor('#111')
      .text('RECEIPT', M, y + 10, { width: CW, align: 'right' });
    if (inv.invoice_number) {
      doc.font('Helvetica').fontSize(9).fillColor('#55555c')
        .text(inv.invoice_number, M, y + 36, { width: CW, align: 'right' });
    }
    y += logoH + 14;
    doc.moveTo(M, y).lineTo(PW - M, y).lineWidth(1.6).strokeColor('#111111').stroke();
    y += 18;

    // ---------- Seller / Buyer ----------
    const colGap = 14;
    const colW = (CW - colGap) / 2;
    const boxH = 96;
    caja(doc, M, y, colW, boxH);
    tituloCaja(doc, 'SELLER INFORMATION', M, y, colW);
    doc.font('Helvetica').fontSize(10).fillColor('#111');
    let sy = y + 32;
    for (const line of [inv.seller_name, inv.seller_address, inv.seller_phone, inv.seller_email]) {
      if (line) { doc.text(String(line), M + 14, sy, { width: colW - 28 }); sy += 14; }
    }

    const bx = M + colW + colGap;
    caja(doc, bx, y, colW, boxH);
    tituloCaja(doc, 'BUYER INFORMATION', bx, y, colW);
    let by = y + 32;
    const buyerLines = [inv.buyer_name, inv.buyer_address, inv.buyer_phone, inv.buyer_email];
    if (!buyerLines.some(Boolean)) {
      doc.font('Helvetica').fontSize(10).fillColor('#55555c').text('—', bx + 14, by);
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#111');
      for (const line of buyerLines) {
        if (line) { doc.text(String(line), bx + 14, by, { width: colW - 28 }); by += 14; }
      }
    }
    y += boxH + 14;

    // ---------- Sale information ----------
    const saleH = 74;
    caja(doc, M, y, CW, saleH);
    tituloCaja(doc, 'SALE INFORMATION', M, y, CW);
    const rowY = y + 34;
    const halfW = CW / 2;
    const saleRows = [
      ['Date:', fmtDate(inv.sale_date), 'Time:', fmtTime(inv.sale_time)],
      ['Payment Method:', inv.payment_method || '—', 'Tax Rate:', `${Number(inv.tax_rate || 0)}%`],
    ];
    saleRows.forEach((r, i) => {
      const ry = rowY + i * 16;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111').text(r[0], M + 14, ry, { continued: true });
      doc.font('Helvetica').text(' ' + r[1]);
      doc.font('Helvetica-Bold').text(r[2], M + 14 + halfW, ry, { continued: true });
      doc.font('Helvetica').text(' ' + r[3]);
    });
    y += saleH + 14;

    // ---------- Items ----------
    const items = (inv.items || []).filter((i) => i && (i.description || i.name));
    const tableTop = y;
    const headH = 24;
    const rowH = 20;
    const subtotal = Number(inv.subtotal) || items.reduce((a, i) => a + (Number(i.qty) || 1) * (Number(i.price) || 0), 0);
    const taxTotal = Number(inv.tax_total) || 0;
    const total = Number(inv.total) || (subtotal + taxTotal);
    const totalsH = 3 * 18 + 14;
    const boxH2 = 34 + headH + items.length * rowH + totalsH + 16;

    caja(doc, M, y, CW, boxH2);
    tituloCaja(doc, 'ITEM DESCRIPTION', M, y, CW);

    // Encabezados de tabla
    const tY = y + 32;
    const cQty = M + CW - 260, cPrice = M + CW - 190, cAmt = M + CW - 100;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#55555c');
    doc.text('DESCRIPTION', M + 14, tY, { characterSpacing: 1 });
    doc.text('QTY', cQty, tY, { width: 50, align: 'center', characterSpacing: 1 });
    doc.text('PRICE', cPrice, tY, { width: 80, align: 'right', characterSpacing: 1 });
    doc.text('AMOUNT', cAmt, tY, { width: 86, align: 'right', characterSpacing: 1 });
    doc.moveTo(M + 14, tY + 12).lineTo(PW - M - 14, tY + 12).lineWidth(0.7).strokeColor('#999999').stroke();

    // Filas
    let ry = tY + headH;
    doc.font('Helvetica').fontSize(10).fillColor('#111');
    for (const i of items) {
      const qty = Number(i.qty) || 1;
      const price = Number(i.price) || 0;
      doc.text(String(i.description || i.name), M + 14, ry, { width: cQty - M - 30 });
      doc.text(String(qty), cQty, ry, { width: 50, align: 'center' });
      doc.text(money(price), cPrice, ry, { width: 80, align: 'right' });
      doc.text(money(qty * price), cAmt, ry, { width: 86, align: 'right' });
      doc.moveTo(M + 14, ry + 14).lineTo(PW - M - 14, ry + 14).lineWidth(0.4).strokeColor('#e2e2e6').stroke();
      ry += rowH;
    }

    // Totales
    ry += 8;
    const totX = cPrice - 20;
    doc.font('Helvetica').fontSize(10).fillColor('#111');
    doc.text('Subtotal', totX, ry, { width: 100, align: 'right' });
    doc.text(money(subtotal), cAmt, ry, { width: 86, align: 'right' }); ry += 18;
    doc.text(`Tax (${Number(inv.tax_rate || 0)}%)`, totX, ry, { width: 100, align: 'right' });
    doc.text(money(taxTotal), cAmt, ry, { width: 86, align: 'right' }); ry += 18;
    doc.moveTo(totX, ry).lineTo(PW - M - 14, ry).lineWidth(1.2).strokeColor('#111111').stroke();
    ry += 6;
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111');
    doc.text('Total', totX, ry, { width: 100, align: 'right' });
    doc.text(money(total), cAmt, ry, { width: 86, align: 'right' });
    y += boxH2 + 14;

    // ---------- Warranty / Terms / Notes ----------
    const extras = [
      ['WARRANTY', inv.warranty_text],
      ['TERMS', inv.terms_text],
      ['NOTES', inv.notes],
    ].filter(([, v]) => v);
    for (const [t, v] of extras) {
      const h = 46 + Math.ceil(String(v).length / 95) * 12;
      caja(doc, M, y, CW, h);
      tituloCaja(doc, t, M, y, CW);
      doc.font('Helvetica').fontSize(9.5).fillColor('#333338')
        .text(String(v), M + 14, y + 32, { width: CW - 28 });
      y += h + 12;
    }

    // ---------- Firmas ----------
    y = Math.max(y + 26, 640);
    const sigW = 200;
    const sigY = y + 30;
    doc.moveTo(M + 30, sigY).lineTo(M + 30 + sigW, sigY).lineWidth(0.8).strokeColor('#111').stroke();
    doc.moveTo(PW - M - 30 - sigW, sigY).lineTo(PW - M - 30, sigY).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor('#55555c');
    doc.text('Firma del vendedor', M + 30, sigY + 6, { width: sigW, align: 'center' });
    doc.text('Firma del comprador', PW - M - 30 - sigW, sigY + 6, { width: sigW, align: 'center' });

    // ---------- Footer ----------
    doc.font('Helvetica').fontSize(8.5).fillColor('#8a8a92')
      .text(`Gracias por su compra — ${inv.seller_name || 'ElectronicST, LLC'}`, M, 736, { width: CW, align: 'center' });

    doc.end();
  });
}

module.exports = { buildInvoicePdf };
