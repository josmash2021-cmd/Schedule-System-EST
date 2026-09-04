/* Una vez: pone SKU = slug de la página web a los productos ligados al sitio,
   para que stock-sync.js los marque "Vendido" cuando stock llega a 0.
   Uso: node /app/scripts/fix-skus.js */
const { pool } = require('../db');
const MAP = [
  [9, 'iphone-15-pro'],
  [22, 'macbook-air-13'],
  [38, 'macbook-neo-2026'],
  [34, 'victus-gaming'],
  [23, 'ipad-air-1'],
  [24, 'ipad-10-2022'],
  [25, 'hp-15-i5-13'],
];
(async () => {
  for (const [id, sku] of MAP) {
    const r = await pool.query('UPDATE inventory_items SET sku = $2 WHERE id = $1 RETURNING id, name, sku, stock', [id, sku]);
    console.log(r.rows[0] || ('id ' + id + ' no existe'));
  }
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
