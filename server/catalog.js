/* ============================================================
   ElectronicST — Catálogo de precios CONFIABLE (server-side)
   El carrito vive en el navegador (localStorage) y por eso NO se
   puede confiar en los precios que envía el cliente. Este catálogo
   es la única fuente de verdad: el checkout de Stripe se arma con
   estos precios, validando cada id recibido.

   Los ids coinciden con los que genera assets/cart.js:
       data-id + '-' + slug(condición)
   Mantén este archivo sincronizado con las páginas de producto.
   ============================================================ */

// Precios en dólares (unidad). Stripe usa centavos (se multiplica x100).
const CATALOG = {
  'iphone-15-pro-muybueno': {
    name: 'iPhone 15 Pro',
    desc: '256 GB · Batería 90% · Desbloqueado',
    cond: 'Muy bueno',
    condEn: 'Very good',
    price: 550,
    img: 'assets/img/iphone-15-pro.jpg',
  },
  'macbook-air-13-bueno': {
    name: 'MacBook Air 13"',
    desc: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    cond: 'Bueno',
    condEn: 'Good',
    price: 150,
    img: 'assets/img/macbook-air-13.jpg',
  },
  'macbook-air-13-muybueno': {
    name: 'MacBook Air 13"',
    desc: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    cond: 'Muy bueno',
    condEn: 'Very good',
    price: 200,
    img: 'assets/img/macbook-air-13.jpg',
  },
  'macbook-air-13-excelente': {
    name: 'MacBook Air 13"',
    desc: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    cond: 'Excelente',
    condEn: 'Excellent',
    price: 250,
    img: 'assets/img/macbook-air-13.jpg',
  },
  'macbook-neo-2026-openbox': {
    name: 'MacBook Neo 2026',
    desc: '256 GB · 8 GB RAM · Open box',
    cond: 'Open box',
    condEn: 'Open box',
    price: 500,
    img: 'assets/img/macbook-neo-pink.jpg',
  },
  'victus-gaming-excelente': {
    name: 'Victus Gaming 15.6" Ryzen 5',
    desc: '16 GB DDR5 · RTX 3050 6 GB · 512 GB SSD',
    cond: 'Excelente',
    condEn: 'Excellent',
    price: 440,
    img: 'assets/img/victus-gaming.jpg',
  },
  'alienware-16-aurora-nuevo': {
    name: 'Alienware 16 Aurora (2025)',
    desc: 'Intel i7 · 16 GB DDR5 · RTX 5050 8 GB · 1 TB SSD',
    cond: 'Nuevo',
    condEn: 'Brand new',
    price: 1400,
    img: 'assets/img/alienware-16-aurora.jpg',
    freeShip: true,
  },
};

function getItem(id) {
  // hasOwnProperty: evita que ids como "__proto__"/"constructor" devuelvan
  // propiedades heredadas del prototipo y pasen la validación del checkout.
  return Object.prototype.hasOwnProperty.call(CATALOG, id) ? CATALOG[id] : null;
}

module.exports = { CATALOG, getItem };
