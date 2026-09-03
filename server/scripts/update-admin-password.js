/* Cambia la contraseña de un usuario del panel (por defecto admin).
   Uso:
     DATABASE_URL="..." node server/scripts/update-admin-password.js "NuevaContraseña" [usuario]
   - La contraseña NO va al repo: se pasa por argumento y se hashea aquí.
   - La base de datos NO se sube a Git: se usa DATABASE_URL local o de Railway. */
const { pool } = require('../db');
const { hashPassword, validatePasswordPolicy } = require('../lib/passwords');

async function main() {
  const [, , plain, usernameArg] = process.argv;
  const username = usernameArg || 'admin';

  if (!plain) {
    console.error('Uso: node server/scripts/update-admin-password.js "NuevaContraseña" [usuario]');
    process.exit(1);
  }

  const err = validatePasswordPolicy(plain);
  if (err) {
    console.error(err);
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL en el entorno.');
    process.exit(1);
  }

  try {
    const hash = await hashPassword(plain);
    const r = await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = false, updated_at = NOW() WHERE username = $2 RETURNING id, username',
      [hash, username]
    );
    if (!r.rowCount) {
      console.error(`No existe el usuario "${username}".`);
      process.exit(1);
    }
    console.log(`Contraseña actualizada para ${r.rows[0].username} (id ${r.rows[0].id}).`);
    process.exit(0);
  } catch (e) {
    console.error('Error actualizando la contraseña:', e.message);
    process.exit(1);
  }
}

main();
