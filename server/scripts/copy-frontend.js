const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const publicDir = path.resolve(__dirname, '..', 'public');

const itemsToCopy = [
  'index.html',
  'products.html',
  'macbook-air-13.html',
  'iphone-15-pro.html',
  'cart.html',
  'success.html',
  'book-appointment.html',
  'admin.html',
  'terms.html',
  'privacy.html',
  'assets',
  'qr-cita.png',
  'logo.jpg',
];

function rmrf(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(target)) {
      rmrf(path.join(target, entry));
    }
    fs.rmdirSync(target);
  } else {
    fs.unlinkSync(target);
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

const missing = itemsToCopy.filter(item => !fs.existsSync(path.join(repoRoot, item)));
if (missing.length) {
  console.warn(`Archivos fuente no encontrados en ${repoRoot}. Posiblemente estamos en el contenedor de Railway.`);
  console.warn(`Faltantes: ${missing.join(', ')}`);
  console.log('Se conserva server/public/ tal como está (si existe).');
  process.exit(0);
}

console.log('Limpiando server/public/...');
rmrf(publicDir);

for (const item of itemsToCopy) {
  const src = path.join(repoRoot, item);
  const dest = path.join(publicDir, item);
  copyRecursive(src, dest);
  console.log(`Copiado: ${item}`);
}

console.log('Frontend copiado a server/public/');
