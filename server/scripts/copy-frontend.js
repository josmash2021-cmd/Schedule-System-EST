const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const publicDir = path.resolve(__dirname, '..', 'public');

const itemsToCopy = [
  'index.html',
  'productos.html',
  'solicitud-servicio.html',
  'admin.html',
  'terminos.html',
  'politicas.html',
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

console.log('Limpiando server/public/...');
rmrf(publicDir);

for (const item of itemsToCopy) {
  const src = path.join(repoRoot, item);
  const dest = path.join(publicDir, item);
  if (!fs.existsSync(src)) {
    console.warn(`No encontrado: ${src}`);
    continue;
  }
  copyRecursive(src, dest);
  console.log(`Copiado: ${item}`);
}

console.log('Frontend copiado a server/public/');
