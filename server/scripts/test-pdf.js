/* Prueba el generador de PDF con una factura real (diagnóstico vía ssh).
   Uso: node /app/scripts/test-pdf.js [id]  (sin id: la última factura) */
const { pool } = require('../db');
(async () => {
  const id = Number(process.argv[2]) || null;
  const r = id
    ? await pool.query('SELECT * FROM invoices WHERE id = $1', [id])
    : await pool.query('SELECT * FROM invoices ORDER BY id DESC LIMIT 1');
  const inv = r.rows[0];
  if (!inv) { console.log('Sin facturas.'); await pool.end(); return; }
  console.log('Factura:', inv.id, inv.invoice_number, '| items tipo:', typeof inv.items);
  const { buildInvoicePdf } = require('../lib/invoicePdf');
  const pdf = await buildInvoicePdf(inv);
  console.log('PDF OK,', pdf.length, 'bytes');
  await pool.end();
})().catch(async (e) => { console.error('FALLO:', e.stack || e.message); try { await pool.end(); } catch (_) {} process.exit(1); });
