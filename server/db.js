const { Pool } = require('pg');
const { DATABASE_URL, NODE_ENV } = require('./config');

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL no está definida.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

async function initDb() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        telefono TEXT,
        correo TEXT,
        direccion TEXT,
        servicio TEXT NOT NULL,
        fecha DATE NOT NULL,
        hora TIME NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (fecha, hora)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_appointments_fecha ON appointments(fecha);
    `);
    // Migración: el UNIQUE (fecha, hora) absoluto impedía re-reservar un
    // slot cuya cita fue CANCELADA (slots.js la muestra libre pero el
    // INSERT chocaba con la fila cancelada → 409 permanente). Se reemplaza
    // por un índice único PARCIAL que solo aplica a citas no canceladas.
    await client.query(`
      ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_fecha_hora_key;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS appointments_fecha_hora_activa
      ON appointments(fecha, hora) WHERE estado <> 'cancelada';
    `);
    console.log('Database initialized.');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
