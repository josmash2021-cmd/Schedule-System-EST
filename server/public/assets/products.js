/* ============================================================
   ElectronicST — Catálogo dinámico de productos (products.html)
   Lee /api/products (los productos marcados "mostrar en la web" en el
   panel de gestión) y genera las tarjetas. Filtros, clic a la ficha
   (/producto?id=N) y botones de carrito se enlazan aquí mismo porque
   el contenido no existe cuando site.js/cart.js hacen su primer pase.
   ============================================================ */
(function () {
    'use strict';

    var grid = document.querySelector('.grid-products');
    if (!grid) return;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function money(n) {
        var r = Math.round(Number(n) * 100) / 100;
        if (!Number.isFinite(r)) return '—';
        return '$' + r.toLocaleString('en-US', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
    }

    // Categoría del inventario → filtro del catálogo.
    var CAT_MAP = {
        'laptop apple': 'macos', 'macbook': 'macos',
        'laptops windows': 'windows', 'windows': 'windows', 'pc gaming': 'windows',
        'tablets': 'tablet', 'tablet': 'tablet',
        'teléfonos': 'iphone', 'telefonos': 'iphone', 'iphone': 'iphone'
    };
    function catSlug(cat) {
        return CAT_MAP[String(cat || '').toLowerCase()] || 'otros';
    }

    // Líneas "Clave: Valor" de la descripción → chips cortos (el valor).
    function specChips(desc, max) {
        return String(desc || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
            .slice(0, max || 3)
            .map(function (l) {
                var i = l.indexOf(':');
                return i > 0 ? l.slice(i + 1).trim() : l;
            });
    }

    function badgeFor(stock) {
        var n = Number(stock) || 0;
        if (n === 1) return '<span class="card-badge card-badge-hot">Última unidad</span>';
        if (n <= 3) return '<span class="card-badge card-badge-hot">Últimas unidades</span>';
        return '<span class="card-badge">Disponible</span>';
    }

    function cardHtml(p) {
        var img = p.image_url
            ? '<img draggable="false" src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '" loading="lazy">'
            : '<img draggable="false" src="assets/img/logo-cruise.png" alt="' + esc(p.name) + '" loading="lazy" style="object-fit:contain;padding:48px;opacity:.55;">';
        var chips = specChips(p.description, 3).map(function (s) {
            return '<span class="spec">' + esc(s) + '</span>';
        }).join('');
        var descLine = p.subtitle || specChips(p.description, 1)[0] || '';
        return '' +
            '<article class="card-product" data-cat="' + esc(catSlug(p.category)) + '" data-href="/producto?id=' + p.id + '">' +
                '<div class="card-media">' + badgeFor(p.stock) + img + '</div>' +
                '<div class="card-body">' +
                    '<h3>' + esc(p.name) + '</h3>' +
                    (descLine ? '<p class="card-tag">' + esc(descLine) + '</p>' : '') +
                    (chips ? '<div class="specs">' + chips + '</div>' : '') +
                    '<div class="card-foot">' +
                        '<div class="price"><small>precio</small>' + money(p.price) + '</div>' +
                        '<div class="card-actions">' +
                            '<button type="button" class="btn btn-ghost btn-sm add-cart-card"' +
                                ' data-id="inv-' + p.id + '" data-name="' + esc(p.name) + '"' +
                                ' data-desc="' + esc(descLine) + '" data-price="' + (Number(p.price) || 0) + '"' +
                                ' data-img="' + esc(p.image_url || 'assets/img/logo-cruise.png') + '">' +
                                '<span>Agregar al carrito</span></button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</article>';
    }

    function bindCards() {
        // Tarjeta clicable → ficha del producto (los botones/enlaces no navegan).
        grid.addEventListener('click', function (e) {
            var card = e.target.closest('.card-product[data-href]');
            if (!card || e.target.closest('a, button')) return;
            window.location.href = card.dataset.href;
        });
        // Filtros por categoría (el pill animado lo mueve site.js).
        var btns = document.querySelectorAll('.filters .filter-btn');
        btns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var cat = btn.dataset.filter;
                grid.querySelectorAll('.card-product[data-cat]').forEach(function (card) {
                    card.hidden = !(cat === 'all' || card.dataset.cat === cat);
                });
            });
        });
        // Enlaza los botones "Agregar al carrito" recién creados.
        if (window.EST_WIRE_CART) window.EST_WIRE_CART();
    }

    fetch('/api/products')
        .then(function (r) { return r.json(); })
        .then(function (d) {
            var products = d.products || [];
            if (!products.length) {
                grid.innerHTML = '<p style="color:#8e8e93;padding:40px 0;text-align:center;">Pronto habrá equipos disponibles. Agenda una cita y te conseguimos lo que buscas.</p>';
                return;
            }
            grid.innerHTML = products.map(cardHtml).join('');
            bindCards();
        })
        .catch(function () {
            grid.innerHTML = '<p style="color:#8e8e93;padding:40px 0;text-align:center;">No se pudo cargar el catálogo. Intenta de nuevo en un momento.</p>';
        });
})();
