/* ============================================================
   ElectronicST — Sincronización de stock con el panel
   Consulta /api/stock y marca como "Vendido" (badge + botón
   deshabilitado) cualquier tarjeta o ficha cuyo producto tenga
   stock 0 en el inventario del panel.
   Enlace: el atributo data-inv de la página = SKU del producto
   en el panel (también intenta por nombre). Si no hay coincidencia,
   la página no se toca.
   ============================================================ */
(function () {
    'use strict';

    var LANG = window.EST_LANG || (document.documentElement.lang || 'es');
    var SOLD = LANG === 'en' ? 'Sold' : 'Vendido';
    var SOLD_NOTE = LANG === 'en' ? 'sold' : 'vendido';

    function markSold(el) {
        // Badge: "Disponible"/"Última unidad" → "Vendido" (sin el rojo pulsante)
        var badge = el.querySelector('.card-badge');
        if (badge) {
            badge.textContent = SOLD;
            badge.classList.remove('card-badge-hot');
        }
        // Botón de carrito deshabilitado
        var btn = el.querySelector('.add-cart-card, #addToCart');
        if (btn) {
            btn.disabled = true;
            btn.classList.remove('add-cart-card');
            if (btn.id === 'addToCart') btn.removeAttribute('id');
            var span = btn.querySelector('span');
            if (span) span.textContent = SOLD; else btn.textContent = SOLD;
        }
        // Nota bajo el precio (página de detalle)
        var note = el.querySelector('#priceNote');
        if (note) note.textContent = SOLD_NOTE;
    }

    fetch('/api/stock')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            var map = {};
            (d.items || []).forEach(function (i) {
                if (i.sku) map[String(i.sku).trim().toLowerCase()] = i;
                if (i.name) map[String(i.name).trim().toLowerCase()] = i;
            });
            document.querySelectorAll('[data-inv]').forEach(function (el) {
                var item = map[String(el.dataset.inv || '').trim().toLowerCase()];
                if (item && Number(item.stock) <= 0) markSold(el);
            });
        })
        .catch(function () { /* sin conexión: la página queda como está */ });
})();
