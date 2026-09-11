/* ============================================================================
   ROBOT DE RASTREO USPS (local, en el PC del dueño)
   ----------------------------------------------------------------------------
   Por qué existe: AfterShip quedó sin acceso API (403, pide plan Pro) y la API
   oficial de USPS requiere llaves del portal COP (aún sin obtener). Mientras
   tanto, este robot abre Chrome REAL en esta PC, consulta tools.usps.com por
   cada número de rastreo USPS pendiente y aplica el resultado con la MISMA
   lógica del servidor (tracking.applyUpdate / applyRepairUpdate): actualiza
   ship_tag + expected_delivery, manda los correos de tránsito/entrega y marca
   'entregado' solo.

   - Corre 2 veces al día (9:00 y 16:00) vía Programador de tareas de Windows.
   - Requiere ../../.env con: DATABASE_URL (pública de Railway), GMAIL_USER,
     GMAIL_APP_PASSWORD (correos). Nada de esto se sube a git.
   - Perfil de Chrome persistente en ./.usps-profile (cookies → menos bloqueo).
   - Log en ./usps-scraper.log.
   ========================================================================== */
const path = require('path');
const fs = require('fs');
// 1) Entorno ANTES de config/db (dotenv nunca pisa vars ya definidas).
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const puppeteer = require(path.resolve(__dirname, '../../node_modules/puppeteer-core'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = path.resolve(__dirname, '.usps-profile');
const LOG = path.resolve(__dirname, 'usps-scraper.log');
const REAL_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function log(msg) {
  const line = `[${new Date().toLocaleString('es-US', { timeZone: 'America/Chicago' })}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch (_) {}
}

// ------------------------- Parseo de la página USPS -------------------------
// Texto USPS → tag interno (mismo vocabulario que lib/tracking.js).
function tagFromStatus(status, detail) {
  const s = `${status || ''} ${detail || ''}`.toLowerCase();
  if (/delivered/.test(s) && !/out for delivery|preparing/.test(s)) return 'Delivered';
  if (/out for delivery/.test(s)) return 'OutForDelivery';
  if (/label created|pre-?shipment/.test(s)) return null; // aún no se mueve
  return 'InTransit';
}

const MESES = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

// Bloque "Expected Delivery by": MONDAY / 14 / September 2026 → 'YYYY-MM-DD'.
function parseEta(eta) {
  if (!eta || !eta.date || !eta.monthYear) return null;
  const m = eta.monthYear.replace(/,/g, '').trim().split(/\s+/);
  const month = MESES[(m[0] || '').toLowerCase()];
  const year = m.find((p) => /^\d{4}$/.test(p));
  const day = eta.date.trim().padStart(2, '0');
  if (!month || !year || !/^\d{2}$/.test(day)) return null;
  return `${year}-${month}-${day}`;
}

async function scrapeOne(page, number) {
  await page.goto(`https://tools.usps.com/tracking/?qtc_tLabels1=${encodeURIComponent(number)}`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const t = await page.evaluate(() => document.body.innerText || '');
    if (/expected delivery by|out for delivery|delivered|in transit|in possession/i.test(t)) { ready = true; break; }
  }
  if (!ready) return null;
  const data = await page.evaluate(() => {
    const txt = (sel, root) => {
      const el = (root || document).querySelector(sel);
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    };
    const cur = document.querySelector('.tb-step.current-step');
    const eta = document.querySelector('.expected_delivery');
    return {
      status: txt('.tb-status', cur),
      detail: txt('.tb-status-detail', cur),
      date: txt('.tb-date', cur),
      eta: eta ? {
        date: txt('strong.date', eta),
        monthYear: txt('.month_year', eta),
        time: txt('strong.time', eta),
      } : null,
    };
  });
  if (!data || !data.status) return null;
  return { tag: tagFromStatus(data.status, data.detail), expectedDelivery: parseEta(data.eta), raw: data };
}

// --------------------------------- Main -------------------------------------
(async () => {
  const t0 = Date.now();
  log('=== corrida robot USPS ===');
  const { pool } = require('../db');
  const tracking = require('../lib/tracking');

  // Órdenes web/FB con USPS pendientes de entrega.
  const { rows: ordenes } = await pool.query(
    `SELECT * FROM online_orders
     WHERE lower(COALESCE(carrier, '')) = 'usps'
       AND tracking_number IS NOT NULL AND tracking_number <> ''
       AND ship_status <> 'entregado'
     ORDER BY id`
  );
  // Repuestos de reparaciones en camino al taller (mismo sistema).
  const { rows: repuestos } = await pool.query(
    `SELECT * FROM repair_tickets
     WHERE tracking_number IS NOT NULL AND tracking_number <> ''
       AND status <> 'entregado'
     ORDER BY id`
  );
  log(`órdenes USPS activas: ${ordenes.length} · repuestos: ${repuestos.length}`);
  if (!ordenes.length && !repuestos.length) { await pool.end(); return; }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: PROFILE,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1366,900'],
    ignoreDefaultArgs: ['--enable-automation'],
  });
  try {
    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.setUserAgent(REAL_UA);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    for (const o of ordenes) {
      try {
        const r = await scrapeOne(page, o.tracking_number);
        if (!r || (!r.tag && !r.expectedDelivery)) {
          log(`orden #${o.id} (${o.tracking_number}): USPS sin dato legible`);
          continue;
        }
        log(`orden #${o.id}: tag=${r.tag || '-'} eta=${r.expectedDelivery || '-'} (${r.raw.status}${r.raw.detail ? ' / ' + r.raw.detail : ''})`);
        await tracking.applyUpdate(o, r);
      } catch (e) {
        log(`orden #${o.id} ERROR: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 4000)); // ritmo humano entre paquetes
    }
    for (const t of repuestos) {
      try {
        const r = await scrapeOne(page, t.tracking_number);
        if (!r || (!r.tag && !r.expectedDelivery)) {
          log(`repuesto ticket #${t.id} (${t.tracking_number}): USPS sin dato legible`);
          continue;
        }
        log(`repuesto #${t.id}: tag=${r.tag || '-'} eta=${r.expectedDelivery || '-'}`);
        await tracking.applyRepairUpdate(t, r);
      } catch (e) {
        log(`repuesto #${t.id} ERROR: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 4000));
    }
  } finally {
    await browser.close();
    await pool.end();
  }
  log(`=== fin (${Math.round((Date.now() - t0) / 1000)} s) ===`);
})().catch((e) => { log(`FATAL: ${e.message}`); process.exit(1); });
