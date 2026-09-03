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
    // Fecha real de compra de la mercancía (si difiere del registro).
    await client.query(`ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS purchased_at DATE;`);

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

    // Backfill (idempotente): productos dados de alta ANTES de que el alta
    // registrara su movimiento de entrada. Sin esto, las "Compras de
    // inventario" por mes no contaban esas unidades. Aproximación:
    // delta = stock actual + unidades vendidas de ese producto; la fecha del
    // movimiento es la del alta del producto (cuenta en su mes).
    // (Va aquí porque necesita que sale_items ya exista.)
    await client.query(`
      INSERT INTO inventory_movements (item_id, delta, reason, note, user_id, created_at)
      SELECT i.id,
             i.stock + COALESCE((SELECT SUM(si.qty) FROM sale_items si WHERE si.item_id = i.id), 0),
             'entrada', 'Stock inicial (registrado retroactivamente)', NULL, i.created_at
      FROM inventory_items i
      WHERE NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m.item_id = i.id AND m.delta > 0)
        AND (i.stock + COALESCE((SELECT SUM(si.qty) FROM sale_items si WHERE si.item_id = i.id), 0)) > 0;
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

    // ----- Órdenes online (Stripe Checkout) -----
    // Cada pago web completado se guarda aquí desde el webhook de checkout.
    // stripe_session_id es UNIQUE: dedupe persistente (Stripe reintenta los
    // webhooks; el Set en memoria del handler no basta tras un reinicio).
    // Los textos del cliente (nombre, dirección) son una foto del momento del
    // pago, igual que las facturas.
    await client.query(`
      CREATE TABLE IF NOT EXISTS online_orders (
        id                SERIAL PRIMARY KEY,
        stripe_session_id TEXT UNIQUE NOT NULL,
        customer_name     TEXT,
        email             TEXT,
        phone             TEXT,
        address           TEXT,
        items             JSONB NOT NULL DEFAULT '[]'::jsonb,
        total             NUMERIC(10,2) NOT NULL DEFAULT 0,
        currency          TEXT NOT NULL DEFAULT 'usd',
        created_at        TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_online_orders_created ON online_orders(created_at);`);
    // Órdenes manuales (FB Marketplace) y estados de envío (2026-09-01):
    // stripe_session_id pasa a nullable (varias manuales con NULL no chocan
    // con el UNIQUE). origen: 'website' (Stripe, automática) | 'fb_marketplace'.
    // ship_status: pendiente → enviado (auto al poner tracking) → entregado
    // (auto vía AfterShip si hay AFTERSHIP_API_KEY, o manual).
    await client.query(`ALTER TABLE online_orders ALTER COLUMN stripe_session_id DROP NOT NULL;`);
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'website';`);
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS ship_status TEXT NOT NULL DEFAULT 'pendiente';`);
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;`);
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS carrier TEXT;`);
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS tracking_id TEXT;`);
    // Link secreto de seguimiento para el cliente (página pública track.html).
    // El token ES la credencial: quien lo tiene ve el pedido. 48 hex chars.
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS track_token TEXT;`);
    await client.query(`UPDATE online_orders SET track_token = md5(random()::text || ':' || id::text) || md5(random()::text) WHERE track_token IS NULL;`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_online_orders_track ON online_orders(track_token);`);
    // Flags de correos ya enviados al cliente (no reenviar).
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS email_shipped BOOLEAN NOT NULL DEFAULT false;`);
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS email_transit BOOLEAN NOT NULL DEFAULT false;`);
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS email_delivered BOOLEAN NOT NULL DEFAULT false;`);
    // Tag fino de AfterShip (InTransit, OutForDelivery, Delivered…) para la
    // barra de progreso de 4 pasos del panel y de la página del cliente.
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS ship_tag TEXT;`);
    // Fecha estimada de entrega que reporta AfterShip (alimenta el texto
    // "Llega el …" de track.html).
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS expected_delivery DATE;`);
    // Costo de lo vendido online (catálogo ligado al inventario por invId):
    // sin esto la ganancia mensual salía inflada porque las ventas web
    // contaban costo 0.
    await client.query(`ALTER TABLE online_orders ADD COLUMN IF NOT EXISTS costo NUMERIC(10,2) NOT NULL DEFAULT 0;`);

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
    // Factura automática por orden de envío (website/FB): se crea sola con
    // los datos del cliente al registrarse la orden.
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES online_orders(id) ON DELETE SET NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);`);
    // Envío de la orden (flat $16 web): va en su columna, no como línea de
    // artículo, para que los totales del recibo cuadren.
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping_total NUMERIC(10,2) NOT NULL DEFAULT 0;`);

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
