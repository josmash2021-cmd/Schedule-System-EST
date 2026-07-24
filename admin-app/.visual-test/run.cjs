// Arnés de pruebas visuales del panel (temporal, no forma parte del build).
// Sirve server/admin-dist en /x/static/, simula la API y captura
// pantallas de todas las vistas con Chrome real vía puppeteer-core.
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require(path.resolve(__dirname, '../../node_modules/puppeteer-core'));

const DIST = path.resolve(__dirname, '../../server/admin-dist');
const SHOTS = path.resolve(__dirname, 'shots');
const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = '/x/static/';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const iso = (minAgo) => new Date(Date.now() - minAgo * 60000).toISOString();

const USERS = [
  { id: 1, username: 'admin', email: 'admin@est.com', role: 'admin', active: true, last_login: iso(30) },
  { id: 2, username: 'juan.perez', email: null, role: 'worker', active: true, last_login: iso(200), must_change_password: true },
  { id: 3, username: 'maria.lopez', email: 'maria@est.com', role: 'worker', active: true, last_login: null },
  { id: 4, username: 'luis.gomez', email: null, role: 'worker', active: false, last_login: iso(4000) },
];
const TASKS = [
  { id: 1, title: 'Revisar inventario de iPhones', description: 'Contar pantallas y baterías', assigned_to: 2, assignee_username: 'juan.perez', status: 'pending', due_date: '2026-07-25' },
  { id: 2, title: 'Llamar a proveedor de repuestos', description: null, assigned_to: 3, assignee_username: 'maria.lopez', status: 'in_progress', due_date: null },
  { id: 3, title: 'Limpiar vitrina principal', description: 'Quitar polvo y reordenar accesorios', assigned_to: null, assignee_username: null, status: 'done', due_date: '2026-07-20' },
];
const CITAS = [
  { id: 1, fecha: '2026-07-24', hora: '10:30:00', nombre: 'Carlos Ruiz', telefono: '555-123-4567', servicio: 'Cambio de pantalla iPhone 13', estado: 'pendiente' },
  { id: 2, fecha: '2026-07-24', hora: '12:00:00', nombre: 'Ana Torres', telefono: null, servicio: 'Batería MacBook Air', estado: 'confirmada' },
  { id: 3, fecha: '2026-07-24', hora: '15:15:00', nombre: 'Pedro Sosa', telefono: '555-987-6543', servicio: 'Diagnóstico general', estado: 'atendida' },
];
const TICKETS = [
  { id: 1, device_brand: 'Apple', device_model: 'iPhone 13', device_serial: 'F2LX9A', customer_name: 'Carlos Ruiz', customer_phone: '555-123-4567', status: 'reparacion', assignee_username: 'juan.perez', quoted_price: 120, final_price: null, photo_count: 2 },
  { id: 2, device_brand: 'Samsung', device_model: 'Galaxy S22', device_serial: null, customer_name: 'Ana Torres', customer_phone: null, status: 'recibido', assignee_username: null, quoted_price: null, final_price: null, photo_count: 0 },
  { id: 3, device_brand: 'Apple', device_model: 'MacBook Air 13', device_serial: 'C02XYZ', customer_name: 'Pedro Sosa', customer_phone: '555-987-6543', status: 'listo', assignee_username: 'maria.lopez', quoted_price: 250, final_price: 230, photo_count: 1 },
];
const ITEMS = [
  { id: 1, name: 'Pantalla iPhone 13', sku: 'PNT-IP13', category: 'Pantallas', price: 89.99, stock: 12, min_stock: 3 },
  { id: 2, name: 'Batería MacBook Air', sku: 'BAT-MBA', category: 'Baterías', price: 59.5, stock: 2, min_stock: 4 },
  { id: 3, name: 'Cable USB-C 1m', sku: null, category: 'Accesorios', price: 9.99, stock: 40, min_stock: 10 },
];

function mockFor(url, method, authHeader) {
  const p = new URL(url).pathname;
  const isWorker = (authHeader || '').includes('worker-token');
  if (p === '/x/s/auth/me') return { user: isWorker
    ? { id: 2, username: 'juan.perez', role: 'worker', active: true }
    : { id: 1, username: 'admin', role: 'admin', active: true } };
  if (p === '/x/s/users') return { users: USERS };
  if (p === '/api/appointments') return { citas: CITAS };
  if (p === '/x/s/tasks' || p === '/x/s/tasks/mine') return { tasks: TASKS };
  if (p === '/x/s/live/monitor') return {
    working: [{ id: 1, user_id: 2, username: 'juan.perez', clock_in: iso(95) }],
    online: [{ userId: 2, username: 'juan.perez', screen: 'tareas' }],
    activity: [
      { type: 'clock_in', username: 'juan.perez', text: 'fichó entrada', at: iso(95) },
      { type: 'task', username: 'maria.lopez', text: 'completó «Limpiar vitrina»', at: iso(40) },
      { type: 'clock_out', username: 'maria.lopez', text: 'fichó salida', at: iso(15) },
    ],
  };
  if (p === '/x/s/time') return { recent: [
    { id: 1, username: 'juan.perez', clock_in: iso(95), clock_out: null },
    { id: 2, username: 'maria.lopez', clock_in: iso(600), clock_out: iso(120) },
  ] };
  if (p === '/x/s/time/mine') return { open: { clock_in: iso(95) }, entries: [] };
  if (p === '/x/s/repairs') return { tickets: TICKETS };
  if (/^\/api\/admin\/repairs\/\d+$/.test(p)) return { ticket: { ...TICKETS[0], photos: [] } };
  if (p === '/x/s/inventory') return { items: ITEMS };
  if (/^\/api\/admin\/inventory\/\d+$/.test(p)) return { item: ITEMS[0], movements: [
    { id: 1, delta: 5, reason: 'entrada', note: 'Compra proveedor', username: 'admin', created_at: iso(300) },
    { id: 2, delta: -2, reason: 'venta', note: null, username: 'juan.perez', created_at: iso(100) },
  ] };
  return { ok: true };
}

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = new URL(req.url, ORIGIN).pathname;
      if (p.startsWith(BASE)) p = p.slice(BASE.length);
      if (p === '' || p === '/') p = 'index.html';
      const file = path.join(DIST, p);
      fs.readFile(file, (err, buf) => {
        if (err) { fs.readFile(path.join(DIST, 'index.html'), (e2, b2) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(b2); }); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(PORT, '127.0.0.1', () => resolve(srv));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-device-scale-factor=1', '--hide-scrollbars'],
  });

  const failures = [];
  async function newPage(viewport, token) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if ((u.startsWith(ORIGIN + '/api/') || u.startsWith(ORIGIN + '/x/s')) && !u.startsWith(ORIGIN + BASE)) {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFor(u, req.method(), req.headers().authorization)) });
      } else req.continue();
    });
    const errors = [];
    page.on('dialog', (d) => d.accept().catch(() => {}));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => { if (!r.url().startsWith(ORIGIN + '/api/') && !r.url().startsWith(ORIGIN + '/x/s')) errors.push('reqfail: ' + r.url()); });
    if (token) await page.evaluateOnNewDocument((t) => sessionStorage.setItem('est_office_token', t), token);
    return { page, errors };
  }

  async function shot(page, name, errors, ms = 1100) {
    await sleep(ms);
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
    if (errors.length) failures.push(`${name}: ${errors.join(' | ')}`);
    errors.length = 0;
    console.log('✓', name);
  }

  // 1) Login (sin token)
  {
    const { page, errors } = await newPage({ width: 1600, height: 900 }, null);
    await page.goto(ORIGIN + BASE, { waitUntil: 'networkidle0' });
    await shot(page, '01-login', errors, 1400);
    await page.close();
  }

  // 2) Panel admin, todas las rutas
  const routes = [
    ['#/', '10-dashboard'], ['#/trabajadores', '11-trabajadores'], ['#/tareas', '12-tareas'],
    ['#/equipo', '13-equipo'], ['#/reparaciones', '14-reparaciones'], ['#/inventario', '15-inventario'],
    ['#/citas', '16-citas'], ['#/ajustes', '17-ajustes'],
  ];
  {
    const { page, errors } = await newPage({ width: 1600, height: 900 }, 'admin-token');
    await page.goto(ORIGIN + BASE + routes[0][0], { waitUntil: 'networkidle0' });
    await shot(page, routes[0][1], errors, 1500);
    for (const [hash, name] of routes.slice(1)) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await shot(page, name, errors, 1300);
    }

    const clickBtn = (txt) => page.evaluate((t) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t));
      if (b) { b.click(); return true; } return false;
    }, txt);

    await page.evaluate(() => { location.hash = '#/tareas'; });
    await sleep(900);
    if (await clickBtn('Nueva tarea')) await shot(page, '20-modal-tarea', errors, 700);
    await page.keyboard.press('Escape');
    await sleep(400);

    await page.evaluate(() => { location.hash = '#/reparaciones'; });
    await sleep(900);
    await page.evaluate(() => { const tr = document.querySelector('table.data tbody tr'); if (tr) tr.click(); });
    await shot(page, '22-modal-reparacion', errors, 1100);
    await page.keyboard.press('Escape');
    await sleep(400);

    // Citas: editar (página completa) y eliminar una cita individual
    await page.evaluate(() => { location.hash = '#/citas'; });
    await sleep(1100);
    if (await clickBtn('Editar')) await shot(page, '24-editar-cita-pagina', errors, 900);
    // Guardar sin cambios: debe volver a la lista sin error
    await clickBtn('Guardar cambios');
    await sleep(900);
    const backAtList = await page.evaluate(() => !!document.querySelector('table.data'));
    if (!backAtList) failures.push('citas-editar: no volvió a la lista tras guardar');
    else console.log('✓ edición de cita guardada y regreso a la lista');
    const rowsBefore = await page.evaluate(() => document.querySelectorAll('table.data tbody tr').length);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('table.data tbody tr:first-child button')].find((x) => x.textContent.includes('Eliminar'));
      if (b) b.click();
    });
    await sleep(700);
    const rowsAfter = await page.evaluate(() => document.querySelectorAll('table.data tbody tr').length);
    if (rowsAfter !== rowsBefore - 1) failures.push(`citas-eliminar: filas ${rowsBefore} -> ${rowsAfter}`);
    else console.log('✓ cita eliminada correctamente (fila removida)');
    await shot(page, '25-citas-tras-eliminar', errors, 400);
    await page.close();
  }

  // 3) Responsive: menú hamburguesa
  {
    const { page, errors } = await newPage({ width: 768, height: 900 }, 'admin-token');
    await page.goto(ORIGIN + BASE + '#/', { waitUntil: 'networkidle0' });
    await shot(page, '30-movil-dashboard', errors, 1300);
    await page.evaluate(() => { document.querySelector('.burger')?.click(); });
    await shot(page, '31-movil-menu', errors, 700);
    await page.close();
  }

  // 4) App de trabajador (móvil)
  {
    const { page, errors } = await newPage({ width: 390, height: 844 }, 'worker-token');
    await page.goto(ORIGIN + BASE, { waitUntil: 'networkidle0' });
    await shot(page, '40-worker-reloj', errors, 1500);
    await page.evaluate(() => { const t = [...document.querySelectorAll('.wtab')].find((x) => x.textContent.match(/tarea/i)); if (t) t.click(); });
    await shot(page, '41-worker-tareas', errors, 1000);
    await page.close();
  }

  await browser.close();
  srv.close();

  console.log('\nCapturas en:', SHOTS);
  if (failures.length) {
    console.log('\nERRORES DETECTADOS:');
    failures.forEach((f) => console.log(' -', f));
    process.exit(1);
  }
  console.log('\nSin errores de consola ni de red en ninguna vista.');
})().catch((e) => { console.error(e); process.exit(1); });
