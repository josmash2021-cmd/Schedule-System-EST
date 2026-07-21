const express = require('express');
const cors = require('cors');
const path = require('path');
const { PORT, CORS_ORIGIN } = require('./config');
const { initDb } = require('./db');
const slotsRouter = require('./routes/slots');
const appointmentsRouter = require('./routes/appointments');
const authRouter = require('./routes/auth');

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
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

app.use('/api/slots', slotsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/auth', authRouter);

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
      .then((m) => m.iniciarBotSeguro())
      .catch((err) => console.error('[bot] No se pudo iniciar:', err.message));
  }
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
