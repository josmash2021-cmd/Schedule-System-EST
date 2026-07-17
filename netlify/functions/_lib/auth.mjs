import { json } from './http.mjs';

// Verifica el header "Authorization: Bearer <ADMIN_TOKEN>".
// ADMIN_TOKEN se configura como variable de entorno en Netlify.
export function requireAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return json(
      { error: 'Panel no configurado: falta la variable de entorno ADMIN_TOKEN' },
      500
    );
  }
  const header = req.headers.get('Authorization') || '';
  const provided = header.replace(/^Bearer\s+/i, '').trim();
  if (provided !== expected) {
    return json({ error: 'No autorizado' }, 401);
  }
  return null; // null = autorizado
}
