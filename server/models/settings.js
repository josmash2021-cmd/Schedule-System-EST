/* Ajustes del negocio guardados en shop_settings (clave → JSON).
   'dropoffs': dónde deja el dueño los paquetes de cada paquetería. Se lee en
   cada consulta del seguimiento público, así que va en memoria (se refresca
   al guardar y, por si acaso, cada 5 min). */
const { pool } = require('../db');

const CARRIERS = ['usps', 'ups', 'fedex', 'dhl'];
const TTL_MS = 5 * 60 * 1000;
let cache = null;
let cacheAt = 0;

function limpiar(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 200);
}

// { usps: { name, address }, ups: {...}, fedex: {...}, dhl: {...} }
function normalizar(raw) {
  const out = {};
  CARRIERS.forEach((c) => {
    const x = (raw && raw[c]) || {};
    out[c] = { name: limpiar(x.name), address: limpiar(x.address) };
  });
  return out;
}

async function getDropoffs() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  const r = await pool.query("SELECT value FROM shop_settings WHERE key = 'dropoffs'");
  cache = normalizar(r.rows[0] && r.rows[0].value);
  cacheAt = Date.now();
  return cache;
}

async function setDropoffs(raw) {
  const value = normalizar(raw);
  await pool.query(
    `INSERT INTO shop_settings (key, value, updated_at) VALUES ('dropoffs', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(value)]
  );
  cache = value;
  cacheAt = Date.now();
  return value;
}

module.exports = { CARRIERS, getDropoffs, setDropoffs };
