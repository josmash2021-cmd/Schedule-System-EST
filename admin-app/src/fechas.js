/* Fechas fáciles de leer, en hora del negocio (America/Chicago):
   "hoy 10:30", "ayer 18:05", "mañana", "vie 25 jul", "25 jul 2025".
   Acepta Date, ISO con hora o 'YYYY-MM-DD' (fecha sola, sin desfase). */
const TZ = 'America/Chicago';
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function partes(date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return { key: `${p.year}-${p.month}-${p.day}`, hora: `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}` };
}

// Clave YYYY-MM-DD de hoy (± n días) en Chicago.
export function hoyKey(n = 0) {
  const k = partes(new Date()).key;
  if (!n) return k;
  const [y, m, d] = k.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' de una fecha (Date/ISO) en Chicago; una fecha sola se respeta tal cual.
export function diaKey(v) {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : partes(d).key;
}

// "vie 25 jul" (agrega el año si no es el actual).
export function diaCorto(v) {
  const k = diaKey(v);
  if (!k) return '—';
  const [y, m, d] = k.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const anio = y !== Number(hoyKey().slice(0, 4)) ? ` ${y}` : '';
  return `${DIAS[dow]} ${d} ${MESES[m - 1]}${anio}`;
}

// "hoy 10:30" · "ayer 18:05" · "mañana" · "vie 25 jul" (+ hora si conHora y la hay).
export function fechaCorta(v, { conHora = true } = {}) {
  if (!v) return '—';
  const soloFecha = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const d = v instanceof Date ? v : new Date(soloFecha ? v + 'T12:00:00Z' : v);
  if (Number.isNaN(d.getTime())) return '—';
  const { key, hora } = soloFecha ? { key: v, hora: null } : partes(d);
  const h = conHora && hora ? ` ${hora}` : '';
  if (key === hoyKey()) return `hoy${h}`;
  if (key === hoyKey(-1)) return `ayer${h}`;
  if (key === hoyKey(1)) return `mañana${h}`;
  return diaCorto(key) + h;
}

// "hace 5 min" · "hace 3 h" · "hace 2 días" · "nunca".
export function hace(v) {
  const t = v ? new Date(v).getTime() : NaN;
  if (!Number.isFinite(t)) return 'nunca';
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dd = Math.floor(h / 24);
  return dd === 1 ? 'hace 1 día' : `hace ${dd} días`;
}

// Días completos entre una fecha y hoy (para "3 días en el taller").
export function diasDesde(v) {
  const k = diaKey(v);
  if (!k) return 0;
  const a = Date.UTC(...k.split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)));
  const b = Date.UTC(...hoyKey().split('-').map(Number).map((n, i) => (i === 1 ? n - 1 : n)));
  return Math.max(0, Math.round((b - a) / 86400000));
}

// Iniciales para el circulito del avatar.
export const iniciales = (s) => String(s || '?').trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
