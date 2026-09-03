/* Uso: railway run node server/scripts/aftership-webhook.js
   Registra (o lista) el webhook de AfterShip → /api/track/webhook sin
   exponer la API key en la terminal. */
const key = process.env.AFTERSHIP_API_KEY;
const URL_WEBHOOK = 'https://electronicservicetechnology.com/api/track/webhook';
if (!key) { console.error('Falta AFTERSHIP_API_KEY en el entorno.'); process.exit(1); }

async function call(path, options = {}) {
  const res = await fetch('https://api.aftership.com/v4' + path, {
    ...options,
    headers: { 'aftership-api-key': key, 'Content-Type': 'application/json' },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

(async () => {
  const list = await call('/webhooks');
  console.log('Webhooks actuales:', JSON.stringify(list.data && list.data.data));
  const ya = list.data && list.data.data && list.data.data.webhooks &&
    list.data.data.webhooks.some((w) => w.url === URL_WEBHOOK);
  if (ya) { console.log('Ya estaba registrado. Nada que hacer.'); return; }
  const r = await call('/webhooks', {
    method: 'POST',
    body: JSON.stringify({ webhook: { url: URL_WEBHOOK } }),
  });
  console.log('Registro:', r.status, JSON.stringify(r.data && (r.data.data || r.data.meta)));
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
