const { Pool } = require('pg');
const { DATABASE_URL, NODE_ENV, ADMIN_PASSWORD, ADMIN_USERNAME } = require('./config');
const { hashPassword } = require('./lib/passwords');

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

    // ===== Back-office: usuarios, auditoría y perfiles de trabajador =====
    // Aislado en try/catch: si algo falla aquí, NO debe tumbar el servidor
    // (citas, bots y checkout siguen). El panel quedará inactivo hasta corregirlo.
    try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                   SERIAL PRIMARY KEY,
        username             TEXT NOT NULL,
        email                TEXT,
        password_hash        TEXT NOT NULL,
        role                 TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('admin','worker')),
        active               BOOLEAN NOT NULL DEFAULT true,
        token_version        INTEGER NOT NULL DEFAULT 0,
        totp_secret          TEXT,
        totp_enabled         BOOLEAN NOT NULL DEFAULT false,
        must_change_password BOOLEAN NOT NULL DEFAULT false,
        last_login           TIMESTAMP,
        created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    // Unicidad case-insensitive de usuario y (opcional) email.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email)) WHERE email IS NOT NULL;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id            BIGSERIAL PRIMARY KEY,
        actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action        TEXT NOT NULL,
        target_type   TEXT,
        target_id     TEXT,
        metadata      JSONB,
        ip            TEXT,
        created_at    TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS worker_profiles (
        user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        full_name   TEXT,
        phone       TEXT,
        hourly_rate NUMERIC(10,2),
        hired_at    DATE,
        notes       TEXT,
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // ----- Fase 2: fichaje de horas y tareas -----
    await client.query(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        clock_in   TIMESTAMP NOT NULL DEFAULT NOW(),
        clock_out  TIMESTAMP,
        note       TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_time_user ON time_entries(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_time_clockin ON time_entries(clock_in);`);
    // Un solo turno abierto por trabajador (no puede fichar entrada dos veces).
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_time_open ON time_entries(user_id) WHERE clock_out IS NULL;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id           SERIAL PRIMARY KEY,
        title        TEXT NOT NULL,
        description  TEXT,
        assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
        due_date     DATE,
        created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`);

    // Sembrar el primer admin desde ADMIN_PASSWORD (idempotente): solo si aún
    // no existe ningún admin. Nace con must_change_password para forzar rotación.
    if (ADMIN_PASSWORD) {
      const exists = await client.query(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`);
      if (exists.rowCount === 0) {
        const hash = await hashPassword(ADMIN_PASSWORD);
        await client.query(
          `INSERT INTO users (username, password_hash, role, must_change_password)
           VALUES ($1, $2, 'admin', true)
           ON CONFLICT DO NOTHING`,
          [ADMIN_USERNAME, hash]
        );
        console.log(`Seed: usuario admin inicial "${ADMIN_USERNAME}" creado.`);
      }
    }
    } catch (err) {
      console.error('WARN: no se pudieron inicializar las tablas del panel de back-office (el resto del sitio sigue operativo):', err.message);
    }

    console.log('Database initialized.');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDb };
