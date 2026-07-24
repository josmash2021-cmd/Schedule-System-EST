/* Rate-limit en memoria (mismo patrón que server/routes/auth.js).
   Cuenta SOLO los intentos fallidos: `tooMany` mira sin incrementar, `fail`
   incrementa, `reset` limpia al tener éxito. Se limpia solo por ventana. */

function createLimiter({ windowMs, max }) {
  const hits = new Map();

  function record(key) {
    const now = Date.now();
    let r = hits.get(key);
    if (!r || r.resetAt < now) {
      r = { count: 0, resetAt: now + windowMs };
      hits.set(key, r);
    }
    return r;
  }

  setInterval(() => {
    const now = Date.now();
    for (const [k, r] of hits.entries()) if (r.resetAt < now) hits.delete(k);
  }, 60_000).unref();

  return {
    // ¿ya superó el límite? (no incrementa)
    tooMany(key) {
      const r = record(key);
      return { limited: r.count >= max, resetAt: r.resetAt };
    },
    // registra un intento fallido y devuelve cuántos quedan
    fail(key) {
      const r = record(key);
      r.count += 1;
      return { count: r.count, remaining: Math.max(0, max - r.count), resetAt: r.resetAt };
    },
    reset(key) { hits.delete(key); },
    max,
    windowMs,
  };
}

// IP del cliente: el ÚLTIMO X-Forwarded-For lo pone el proxy (Railway) y no lo
// controla el cliente; el primero se puede falsear para rotar "IPs".
function getClientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

module.exports = { createLimiter, getClientIp };
