/* ============================================================
   ElectronicST — Ficha dinámica de producto (producto.html?id=N)
   Lee /api/products/:id y rellena: foto principal (arriba), título,
   subtítulo, precio, descripción y las 2 fotos de la galería de abajo.
   Todo se edita desde el panel (Inventario → producto → Página web).
   ============================================================ */
(function () {
    'use strict';

    var id = Number(new URLSearchParams(location.search).get('id'));
    var root = document.getElementById('pdRoot');
    var errorBox = document.getElementById('pdError');
    if (!root) return;

    function showError() {
        root.hidden = true;
        var g = document.getElementById('pdGallery');
        if (g) g.hidden = true;
        if (errorBox) errorBox.hidden = false;
    }
    if (!Number.isInteger(id) || id < 1) { showError(); return; }

    function money(n) {
        var r = Math.round(Number(n) * 100) / 100;
        if (!Number.isFinite(r)) return '—';
        return '$' + r.toLocaleString('en-US', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
    }
    function setText(elId, txt) {
        var el = document.getElementById(elId);
        if (el) el.textContent = txt || '';
    }

    fetch('/api/products/' + id)
        .then(function (r) { if (!r.ok) throw new Error('nf'); return r.json(); })
        .then(function (d) {
            var p = d.product;
            if (!p) { showError(); return; }

            document.title = p.name + ' — ElectronicST';
            setText('pdEyebrow', p.category || 'Producto');
            setText('pdName', p.name);
            setText('pdSub', p.subtitle || '');
            setText('pdPrice', money(p.price));
            setText('pdDesc', p.description || '');

            // Badge según stock.
            var badge = document.getElementById('pdBadge');
            var stock = Number(p.stock) || 0;
            if (badge) {
                if (stock === 1) { badge.textContent = 'Última unidad'; badge.classList.add('card-badge-hot'); }
                else if (stock <= 3) { badge.textContent = 'Últimas unidades'; badge.classList.add('card-badge-hot'); }
                else badge.textContent = 'Disponible';
            }

            // Chips: valores de las líneas "Clave: Valor" de la descripción.
            var chips = String(p.description || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
                .slice(0, 4)
                .map(function (l) {
                    var i = l.indexOf(':');
                    return i > 0 ? l.slice(i + 1).trim() : l;
                });
            var specs = document.getElementById('pdSpecs');
            if (specs) {
                specs.innerHTML = '';
                chips.forEach(function (c) {
                    var s = document.createElement('span');
                    s.className = 'spec';
                    s.textContent = c;
                    specs.appendChild(s);
                });
            }

            // Foto principal (arriba).
            var img = document.getElementById('pdImg');
            if (img) {
                if (p.image_url) { img.src = p.image_url; img.style.objectFit = ''; }
                else { img.src = 'assets/img/logo-cruise.png'; img.style.objectFit = 'contain'; img.style.padding = '48px'; img.style.opacity = '.55'; }
                img.alt = p.name;
            }

            // Galería de abajo (fotos 2 y 3): solo aparece si hay alguna.
            var has2 = !!p.image2_url;
            var has3 = !!p.image3_url;
            var gallery = document.getElementById('pdGallery');
            if (gallery && (has2 || has3)) {
                gallery.hidden = false;
                setText('pdGalleryEyebrow', p.name);
                setText('pdGalleryTitle', p.subtitle || p.name);
                if (has2) {
                    document.getElementById('pdItem2').hidden = false;
                    var i2 = document.getElementById('pdImg2');
                    i2.src = p.image2_url; i2.alt = p.name + ' — foto 2';
                }
                if (has3) {
                    document.getElementById('pdItem3').hidden = false;
                    var i3 = document.getElementById('pdImg3');
                    i3.src = p.image3_url; i3.alt = p.name + ' — foto 3';
                }
            }

            // Botón de carrito con los datos del producto.
            var btn = document.getElementById('addToCart');
            if (btn) {
                btn.dataset.id = 'inv-' + p.id;
                btn.dataset.name = p.name || '';
                btn.dataset.desc = p.subtitle || chips[0] || '';
                btn.dataset.price = String(Number(p.price) || 0);
                btn.dataset.img = p.image_url || 'assets/img/logo-cruise.png';
            }

            root.hidden = false;
            // El botón se llenó después del primer pase de cart.js: re-enlazar.
            if (window.EST_WIRE_CART) window.EST_WIRE_CART();
        })
        .catch(showError);
})();
