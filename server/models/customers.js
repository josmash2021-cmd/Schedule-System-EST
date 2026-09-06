/* Clientes: base de datos de los compradores, agregada desde las facturas.
   Cada factura lleva buyer_*; aquí se agrupan por email (o por nombre si no
   hay email) para tener una ficha por cliente con sus totales. */
const { pool } = require('../db');

// Una fila por cliente: los datos de contacto salen de su factura más
// reciente que los tenga (FILTER evita que una factura sin email pise uno
// anterior que sí lo tenía).
async function listAll() {
  const r = await pool.query(`
    SELECT
      (ARRAY_AGG(buyer_name ORDER BY created_at DESC))[1] AS name,
      (ARRAY_AGG(buyer_email ORDER BY created_at DESC)
        FILTER (WHERE buyer_email IS NOT NULL AND TRIM(buyer_email) <> ''))[1] AS email,
      (ARRAY_AGG(buyer_phone ORDER BY created_at DESC)
        FILTER (WHERE buyer_phone IS NOT NULL AND TRIM(buyer_phone) <> ''))[1] AS phone,
      (ARRAY_AGG(buyer_address ORDER BY created_at DESC)
        FILTER (WHERE buyer_address IS NOT NULL AND TRIM(buyer_address) <> ''))[1] AS address,
      COUNT(*)::int AS facturas,
      COALESCE(SUM(total), 0)::float AS total,
      MAX(created_at) AS ultima
    FROM invoices
    WHERE buyer_name IS NOT NULL AND TRIM(buyer_name) <> ''
    GROUP BY COALESCE(NULLIF(LOWER(TRIM(buyer_email)), ''), 'n:' || LOWER(TRIM(buyer_name)))
    ORDER BY ultima DESC
  `);
  return r.rows;
}

module.exports = { listAll };
