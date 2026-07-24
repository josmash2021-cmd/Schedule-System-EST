/* Registro de auditoría de acciones del panel. Nunca debe romper el flujo
   principal: si el insert falla, se loguea y se sigue. */
const { pool } = require('../db');

async function logAction(actorUserId, action, { targetType = null, targetId = null, metadata = null, ip = null } = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, metadata, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorUserId || null, action, targetType, targetId != null ? String(targetId) : null, metadata ? JSON.stringify(metadata) : null, ip]
    );
  } catch (err) {
    console.error('audit_log insert failed:', err.message);
  }
}

module.exports = { logAction };
