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
app.use(express.json());

// Servir frontend estático desde server/public/
app.use(express.static(path.join(__dirname, 'public')));

// Rutas explícitas para cada página HTML (clean URLs)
const htmlRoutes = {
  '/': 'index.html',
  '/productos': 'productos.html',
  '/macbook-air-13': 'macbook-air-13.html',
  '/solicitud-servicio': 'solicitud-servicio.html',
  '/admin': 'admin.html',
  '/terminos': 'terminos.html',
  '/politicas': 'politicas.html',
};

for (const [route, file] of Object.entries(htmlRoutes)) {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', file));
  });
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
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
