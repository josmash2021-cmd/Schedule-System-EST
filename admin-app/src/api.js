// Cliente HTTP del panel. El token va en sessionStorage (muere al cerrar la
// pestaña). Un 401 limpia el token y avisa para volver al login.
const TOKEN_KEY = 'est_office_token';

export function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
export function setToken(t) {
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  else sessionStorage.removeItem(TOKEN_KEY);
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(url, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (auth && token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* respuesta sin cuerpo */ }
  if (res.status === 401 && auth) {
    setToken(null);
    if (onUnauthorized) onUnauthorized();
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Error ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// API del panel (/api/admin/*)
export function api(pathname, opts) { return request('/api/admin' + pathname, opts); }

// API raíz (/api/*): la usa el panel de Citas, que reutiliza /api/appointments
// con el mismo token admin (el requireAuth legacy acepta role:'admin').
export function apiRoot(pathname, opts) { return request(pathname, opts); }
