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
// invId: id del producto en el inventario del panel (inventory_items.id).
// Sirve para que las ventas web descuenten stock y lleven su COSTO real en
// la contabilidad (ganancia = venta − costo). Sin invId (p. ej. Alienware),
// la venta no toca inventario y su costo cuenta 0.
const CATALOG = {
  'iphone-15-pro-muybueno': {
    name: 'iPhone 15 Pro',
    desc: '256 GB · Batería 90% · Desbloqueado',
    descEn: '256 GB · 90% battery · Unlocked',
    cond: 'Muy bueno',
    condEn: 'Very good',
    price: 550,
    img: 'assets/img/iphone-15-pro.jpg',
    invId: 9,
  },
  'macbook-air-13-bueno': {
    name: 'MacBook Air 13"',
    desc: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    descEn: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    cond: 'Bueno',
    condEn: 'Good',
    price: 150,
    img: 'assets/img/macbook-air-13.jpg',
    invId: 22,
  },
  'macbook-air-13-muybueno': {
    name: 'MacBook Air 13"',
    desc: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    descEn: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    cond: 'Muy bueno',
    condEn: 'Very good',
    price: 200,
    img: 'assets/img/macbook-air-13.jpg',
    invId: 22,
  },
  'macbook-air-13-excelente': {
    name: 'MacBook Air 13"',
    desc: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    descEn: 'Intel i5 · 8 GB RAM · 256 GB SSD',
    cond: 'Excelente',
    condEn: 'Excellent',
    price: 250,
    img: 'assets/img/macbook-air-13.jpg',
    invId: 22,
  },
  'macbook-neo-2026-openbox': {
    name: 'MacBook Neo 2026',
    desc: '256 GB · 8 GB RAM · Open box',
    descEn: '256 GB · 8 GB RAM · Open box',
    cond: 'Open box',
    condEn: 'Open box',
    price: 500,
    img: 'assets/img/macbook-neo-pink.jpg',
    invId: 19,
  },
  'victus-gaming-excelente': {
    name: 'Victus Gaming 15.6" Ryzen 5',
    desc: '16 GB DDR5 · RTX 3050 6 GB · 512 GB SSD',
    descEn: '16 GB DDR5 · RTX 3050 6 GB · 512 GB SSD',
    cond: 'Excelente',
    condEn: 'Excellent',
    price: 450,
    img: 'assets/img/victus-gaming.jpg',
    invId: 34,
  },
  'alienware-16-aurora-nuevo': {
    name: 'Alienware 16 Aurora (2025)',
    desc: 'Intel i7 · 16 GB DDR5 · RTX 5050 8 GB · 1 TB SSD',
    descEn: 'Intel i7 · 16 GB DDR5 · RTX 5050 8 GB · 1 TB SSD',
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

// Enriquece las líneas de Stripe (p. ej. "iPhone 15 Pro (Very good)") con la
// FOTO y la DESCRIPCIÓN del catálogo, emparejando por los ids del metadata de
// la sesión. Sirve para que el correo de confirmación muestre cada producto
// con imagen. Las líneas de Impuestos/Envío no emparejan y quedan tal cual.
// La descripción se guarda en INGLÉS (los correos van en inglés).
function enrichLineItems(lines, metaItems, locale) {
  const prods = (metaItems || [])
    .map((m) => getItem(String(m && m.id || '')))
    .filter(Boolean);
  return (lines || []).map((l) => {
    const name = String(l.name || '');
    for (const p of prods) {
      const cond = locale === 'en' ? (p.condEn || p.cond) : p.cond;
      const label = cond ? `${p.name} (${cond})` : p.name;
      if (name === label || name === p.name || name.startsWith(p.name + ' (')) {
        return { ...l, img: p.img || null, desc: p.descEn || p.desc || null };
      }
    }
    return l;
  });
}

module.exports = { CATALOG, getItem, enrichLineItems };
