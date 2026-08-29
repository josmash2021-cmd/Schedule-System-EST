const { Pool, types } = require('pg');
const { DATABASE_URL, NODE_ENV, ADMIN_PASSWORD, ADMIN_USERNAME } = require('./config');
const { hashPassword } = require('./lib/passwords');

// Interpretar TIMESTAMP (sin zona) SIEMPRE como UTC, sin depender de la TZ del
// proceso Node. Todo el sistema guarda UTC (NOW()); así, aunque alguien ponga
// TZ=America/Chicago en el contenedor, las horas de fichaje no se desvían.
types.setTypeParser(1114, (v) => (v == null ? null : new Date(v.replace(' ', 'T') + 'Z')));

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
    // Origen de la cita: 'web' (página), 'whatsapp' / 'instagram' (bots) o
    // 'mostrador' (creada desde el panel). Las viejas quedan como 'web'.
    await client.query(`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'web';`);

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

    // ----- Fase 4: reparaciones (tickets) + fotos -----
    await client.query(`
      CREATE TABLE IF NOT EXISTS repair_tickets (
        id             SERIAL PRIMARY KEY,
        device_brand   TEXT,
        device_model   TEXT,
        device_serial  TEXT,
        customer_name  TEXT,
        customer_phone TEXT,
        problem        TEXT,
        diagnosis      TEXT,
        quoted_price   NUMERIC(10,2),
        final_price    NUMERIC(10,2),
        status         TEXT NOT NULL DEFAULT 'recibido'
                         CHECK (status IN ('recibido','diagnostico','reparacion','listo','entregado')),
        assigned_to    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
        delivered_at   TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repairs_status ON repair_tickets(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repairs_assigned ON repair_tickets(assigned_to);`);
    // Tipo de equipo (telefono/tablet/laptop) y tipo de servicio
    // (revision/reparacion/mantenimiento). Se validan en la ruta.
    await client.query(`ALTER TABLE repair_tickets ADD COLUMN IF NOT EXISTS device_type TEXT;`);
    await client.query(`ALTER TABLE repair_tickets ADD COLUMN IF NOT EXISTS service_type TEXT;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repairs_device_type ON repair_tickets(device_type);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS repair_photos (
        id          SERIAL PRIMARY KEY,
        ticket_id   INTEGER NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
        filename    TEXT NOT NULL,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repair_photos_ticket ON repair_photos(ticket_id);`);

    // ----- Fase 5: inventario (productos + movimientos de stock) -----
    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id          SERIAL PRIMARY KEY,
        name        TEXT NOT NULL,
        sku         TEXT,
        category    TEXT,
        description TEXT,
        price       NUMERIC(10,2),
        cost        NUMERIC(10,2),
        stock       INTEGER NOT NULL DEFAULT 0,
        min_stock   INTEGER NOT NULL DEFAULT 0,
        image_url   TEXT,
        active      BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inventory_active ON inventory_items(active);`);
    await client.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS image_url TEXT;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id         SERIAL PRIMARY KEY,
        item_id    INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        delta      INTEGER NOT NULL,
        reason     TEXT,
        note       TEXT,
        user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_inv_mov_item ON inventory_movements(item_id);`);

    // ----- Ventas directas (mostrador): cabecera + líneas -----
    // Una venta puede mezclar productos del inventario (item_id, descuenta
    // stock) y conceptos libres (item_id NULL). name/price son una FOTO del
    // momento de la venta: si luego cambia el producto, la venta no se altera.
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id             SERIAL PRIMARY KEY,
        total          NUMERIC(10,2) NOT NULL DEFAULT 0,
        payment_method TEXT,
        note           TEXT,
        created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id      SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        item_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL,
        name    TEXT NOT NULL,
        qty     INTEGER NOT NULL DEFAULT 1,
        price   NUMERIC(10,2) NOT NULL DEFAULT 0
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);`);
    // Foto del costo del producto en el momento de la venta (para la ganancia
    // real de la página de Ventas). NULL en conceptos libres y ventas viejas.
    await client.query(`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2);`);
    // Sincroniza las ventas viejas (cost NULL) con el costo ACTUAL del
    // inventario, para que la Ganancia también las descuente.
    await client.query(`
      UPDATE sale_items si SET cost = ii.cost
      FROM inventory_items ii
      WHERE si.item_id = ii.id AND si.cost IS NULL;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id          SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        category    TEXT,
        amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
        created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);`);

    // ----- Facturas (Bill of Sale) -----
    // Una factura puede nacer de una venta de mostrador (sale_id), de una
    // reparación entregada (repair_id) o de ambos. Los textos se guardan como
    // fueron emitidos; si luego cambia el negocio o el cliente, la factura
    // histórica no se altera.
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id             SERIAL PRIMARY KEY,
        invoice_number TEXT,
        sale_id        INTEGER REFERENCES sales(id) ON DELETE SET NULL,
        repair_id      INTEGER REFERENCES repair_tickets(id) ON DELETE SET NULL,
        seller_name    TEXT NOT NULL DEFAULT 'ElectronicST, LLC',
        seller_address TEXT,
        seller_phone   TEXT,
        seller_email   TEXT,
        buyer_name     TEXT,
        buyer_address  TEXT,
        buyer_phone    TEXT,
        buyer_email    TEXT,
        sale_date      DATE,
        sale_time      TIME,
        payment_method TEXT,
        tax_rate       NUMERIC(5,2) NOT NULL DEFAULT 0,
        subtotal       NUMERIC(10,2) NOT NULL DEFAULT 0,
        tax_total      NUMERIC(10,2) NOT NULL DEFAULT 0,
        total          NUMERIC(10,2) NOT NULL DEFAULT 0,
        items          JSONB NOT NULL DEFAULT '[]'::jsonb,
        warranty_text  TEXT,
        terms_text     TEXT,
        notes          TEXT,
        created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_sale ON invoices(sale_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_repair ON invoices(repair_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);`);

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
