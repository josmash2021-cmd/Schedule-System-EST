const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { PORT, CORS_ORIGIN, ADMIN_PATH, REPAIRS_DIR } = require('./config');
const { initDb } = require('./db');
const slotsRouter = require('./routes/slots');
const appointmentsRouter = require('./routes/appointments');
const authRouter = require('./routes/auth');
const { router: checkoutRouter, webhookHandler } = require('./routes/checkout');
const adminAuthRouter = require('./routes/adminAuth');
const adminUsersRouter = require('./routes/adminUsers');
const adminTimeRouter = require('./routes/adminTime');
const adminTasksRouter = require('./routes/adminTasks');
const adminMonitorRouter = require('./routes/adminMonitor');
const adminRepairsRouter = require('./routes/adminRepairs');

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));

// El webhook de Stripe verifica la firma sobre el body CRUDO, por eso
// se registra con express.raw ANTES del parser JSON global.
app.post('/api/checkout/webhook', express.raw({ type: 'application/json' }), webhookHandler);

app.use(express.json({
  // Guardar el body crudo SOLO del webhook de Instagram: la verificación de
  // firma X-Hub-Signature-256 (HMAC-SHA256) necesita los bytes exactos.
  verify: (req, _res, buf) => {
    if (req.originalUrl?.startsWith('/api/instagram/webhook')) req.rawBody = buf;
  }
}));

// Webhook de Instagram del bot Angel (server/ig-bot/igWebhook.js, módulo ESM).
// Va DESPUÉS del express.json() global y nunca debe tumbar el servidor.
import('./ig-bot/igWebhook.js')
  .then((m) => app.use(m.default || m.router))
  .catch((err) => console.error('[ig] No se pudo montar el webhook de Instagram:', err.message));

// Servir frontend estático desde server/public/
app.use(express.static(path.join(__dirname, 'public')));

// Rutas explícitas para cada página HTML (clean URLs en inglés)
const htmlRoutes = {
  '/': 'index.html',
  '/products': 'products.html',
  '/macbook-air-13': 'macbook-air-13.html',
  '/iphone-15-pro': 'iphone-15-pro.html',
  '/cart': 'cart.html',
  '/success': 'success.html',
  '/book-appointment': 'book-appointment.html',
  '/admin': 'admin.html',
  '/terms': 'terms.html',
  '/privacy': 'privacy.html',
};

for (const [route, file] of Object.entries(htmlRoutes)) {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', file));
  });
}

// Redirecciones permanentes de las rutas antiguas en español
const legacyRedirects = {
  '/productos': '/products',
  '/carrito': '/cart',
  '/solicitud-servicio': '/book-appointment',
  '/terminos': '/terms',
  '/politicas': '/privacy',
};

for (const [oldPath, newPath] of Object.entries(legacyRedirects)) {
  app.get(oldPath, (_req, res) => res.redirect(301, newPath));
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Vinculación del bot de WhatsApp: muestra el QR actual como imagen real
// (el de los logs es difícil de escanear y caduca en segundos). La página
// se auto-recarga cada 15s hasta que el bot queda conectado.
// SEGURIDAD: este QR vincula el WhatsApp del negocio — quien lo escanee se
// vuelve el bot. Las dos rutas exigen ?key=QR_ADMIN_KEY (env) en producción.
let waBot = null;

const crypto = require('node:crypto');

function qrAutorizado(req) {
  const esperada = process.env.QR_ADMIN_KEY || '';
  if (!esperada) {
    // Sin clave configurada: solo se permite en desarrollo.
    return process.env.NODE_ENV !== 'production';
  }
  const a = Buffer.from(String(req.query.key || ''));
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.get('/bot-qr', (req, res) => {
  if (!qrAutorizado(req)) return res.status(403).send('No autorizado.');
  const qr = waBot?.obtenerQR?.() || null;
  const keyParam = process.env.QR_ADMIN_KEY ? `?key=${encodeURIComponent(String(req.query.key || ''))}` : '';
  res.type('html').send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vincular WhatsApp — Bot</title>
<style>body{font-family:sans-serif;text-align:center;padding:2rem;background:#111;color:#eee}
img{background:#fff;padding:16px;border-radius:12px;max-width:90vw}</style></head>
<body>
${qr
    ? `<h2>Escanea este QR con WhatsApp</h2><p>Dispositivos vinculados → Vincular dispositivo (se actualiza solo cada 15s)</p><img src="/bot-qr.png${keyParam}" alt="QR de vinculación">`
    : '<h2>✅ Bot conectado (o sin QR pendiente)</h2><p>Si el bot está esperando vinculación, el QR aparecerá aquí en unos segundos.</p>'}
<script>setTimeout(() => location.reload(), 15000)</script>
</body></html>`);
});

app.get('/bot-qr.png', async (req, res) => {
  if (!qrAutorizado(req)) return res.status(403).json({ error: 'No autorizado.' });
  const qr = waBot?.obtenerQR?.() || null;
  if (!qr) return res.status(404).json({ error: 'No hay QR pendiente (bot conectado o aún no generado).' });
  try {
    const QRCode = require('qrcode');
    const png = await QRCode.toBuffer(qr, { scale: 10, margin: 2 });
    res.type('png').send(png);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/slots', slotsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/auth', authRouter);
app.use('/api/checkout', checkoutRouter);

// ===== Panel de back-office (/api/admin/*) =====
// Assets compilados del panel (JS/CSS). Sin índice de directorio.
const ADMIN_DIST = path.join(__dirname, 'admin-dist');
app.use('/api/admin/static', express.static(ADMIN_DIST, { index: false }));

// Entrada del panel tras el slug secreto. Slug incorrecto → next() → 404 por
// defecto, idéntico a cualquier ruta desconocida (sin pistas). El bundle es
// solo obscuridad; la seguridad real es el login (cuentas con hash + roles).
function slugOk(slug) {
  if (!ADMIN_PATH) return false;
  const a = Buffer.from(String(slug || ''));
  const b = Buffer.from(String(ADMIN_PATH));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
app.get('/api/admin/app/:slug', (req, res, next) => {
  if (!slugOk(req.params.slug)) return next();
  res.set('X-Robots-Tag', 'noindex, nofollow');
  const indexFile = path.join(ADMIN_DIST, 'index.html');
  if (!fs.existsSync(indexFile)) {
    return res.status(503).type('text/plain').send('Panel no disponible (build pendiente).');
  }
  return res.sendFile(indexFile);
});

app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/admin/time', adminTimeRouter);
app.use('/api/admin/tasks', adminTasksRouter);
app.use('/api/admin/live', adminMonitorRouter);
// Fotos de reparaciones (nombres UUID no adivinables). Debe ir ANTES del router
// para que /repairs/photo/<archivo> lo sirva el static y no lo capture /repairs/:id.
app.use('/api/admin/repairs/photo', express.static(REPAIRS_DIR, { index: false, fallthrough: true, maxAge: '7d' }));
app.use('/api/admin/repairs', adminRepairsRouter);

// Audios de bienvenida por voz (wa-bot/src/voz.js los cachea en
// DATA_DIR/voz). Instagram los necesita por URL pública para adjuntarlos.
app.use('/voz', express.static(path.join(process.env.DATA_DIR || path.join(__dirname, 'wa-bot', 'data'), 'voz')));

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });

  // Bot de WhatsApp (Angel): corre en el mismo proceso (ver server/wa-bot/).
  // Se puede desactivar con BOT_ENABLED=false. Un fallo del bot no tumba la web.
  if (process.env.BOT_ENABLED !== 'false') {
    import('./wa-bot/index.js')
      .then((m) => { waBot = m; m.iniciarBotSeguro(); })
      .catch((err) => console.error('[bot] No se pudo iniciar:', err.message));
  }
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
