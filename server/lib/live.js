/* Estado en vivo del monitoreo (en memoria). Presencia = trabajadores con la
   app abierta (heartbeat); actividad = feed reciente de fichajes/tareas.
   Es efímero: se reinicia con el proceso (aceptable para "quién trabaja ahora"). */

const PRESENCE_TTL_MS = 90 * 1000; // sin heartbeat en 90s → fuera de línea
const MAX_ACTIVITY = 40;

const presence = new Map(); // userId -> { userId, username, screen, lastSeen }
const activityLog = [];     // eventos recientes (más nuevo primero)

function recordPresence(userId, username, screen) {
  presence.set(userId, { userId, username, screen: screen || '', lastSeen: Date.now() });
}

function onlineList() {
  const now = Date.now();
  const out = [];
  for (const p of presence.values()) {
    if (now - p.lastSeen < PRESENCE_TTL_MS) {
      out.push({ userId: p.userId, username: p.username, screen: p.screen, secondsAgo: Math.round((now - p.lastSeen) / 1000) });
    }
  }
  return out.sort((a, b) => a.username.localeCompare(b.username));
}

// Registra un evento de actividad. `at` se sella al momento (no en el cliente).
function activity(evt) {
  const e = {
    type: evt.type,
    username: evt.username || '—',
    text: evt.text || '',
    at: new Date().toISOString(),
  };
  activityLog.unshift(e);
  if (activityLog.length > MAX_ACTIVITY) activityLog.length = MAX_ACTIVITY;
}

function recentActivity(limit = 30) {
  return activityLog.slice(0, limit);
}

// Limpieza periódica de presencia caduca (evita fugas de memoria).
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of presence) if (now - p.lastSeen > PRESENCE_TTL_MS) presence.delete(id);
}, 30 * 1000).unref();

module.exports = { recordPresence, onlineList, activity, recentActivity };
