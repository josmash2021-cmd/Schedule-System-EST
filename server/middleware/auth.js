/* Middleware componible para el panel (/api/admin/*).
   verifyToken → loadUser → requireRole(...). Rechaza los tokens legacy del
   /api/auth de citas (no llevan sub/tv) para mantener los dos mundos separados. */
const { verifyAccessToken } = require('../lib/tokens');
const users = require('../models/users');

function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (_) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (payload.sub == null || payload.tv == null) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.tokenPayload = payload;
  next();
}

async function loadUser(req, res, next) {
  try {
    const u = await users.findById(req.tokenPayload.sub);
    // Falla-cerrado: usuario inexistente, inactivo, o token revocado (tv distinto).
    if (!u || !u.active || u.token_version !== req.tokenPayload.tv) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    req.user = u;
    next();
  } catch (err) {
    console.error('loadUser error:', err.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Prohibido' });
    }
    next();
  };
}

module.exports = { verifyToken, loadUser, requireRole };
