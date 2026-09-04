/* Crea/verifica el dominio en Resend vía API y muestra los registros DNS
   necesarios. Uso: railway run --service "Schedule-System-EST" node server/scripts/resend-domain.js */
const key = process.env.RESEND_API_KEY;
if (!key) { console.error('Falta RESEND_API_KEY.'); process.exit(1); }
const DOMAIN = 'electronicservicetechnology.com';

async function call(path, options = {}) {
  const res = await fetch('https://api.resend.com' + path, {
    ...options,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

(async () => {
  const list = await call('/domains');
  let dom = (list.data.data || []).find((d) => d.name === DOMAIN);
  if (!dom) {
    const c = await call('/domains', { method: 'POST', body: JSON.stringify({ name: DOMAIN }) });
    console.log('Creado:', c.status, c.data.id || JSON.stringify(c.data));
    dom = c.data;
  } else {
    console.log('Ya existía:', dom.id, '| estado:', dom.status);
  }
  if (!dom.id) return;
  const d = await call('/domains/' + dom.id);
  console.log('Estado:', d.data.status);
  console.log('Registros DNS:');
  for (const r of d.data.records || []) {
    console.log(`- [${r.record}] ${r.type}  nombre: ${r.name}  valor: ${r.value}  (prioridad: ${r.priority ?? '—'})`);
  }
  // Intentar verificar por si ya están los DNS puestos.
  const v = await call(`/domains/${dom.id}/verify`, { method: 'POST' });
  console.log('Verify:', v.status, JSON.stringify(v.data));
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
