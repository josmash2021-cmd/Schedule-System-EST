/* ============================================================
   ElectronicST — Carrito de compras (localStorage, sin backend)
   - Store: items {id, name, desc, price, img, qty}
   - Inyecta el enlace Carrito + contador en el nav (páginas con .nav-links)
   - Botón "Agregar al carrito" (#addToCart) en la página de producto
   - Render completo en carrito.html (#cartItems / #cartEmpty / #cartContent)
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'est_cart';

    /* ---------- Store ---------- */
    function getCart() {
        try {
            var data = JSON.parse(localStorage.getItem(KEY));
            return Array.isArray(data) ? data : [];
        } catch (e) { return []; }
    }
    function saveCart(items) {
        localStorage.setItem(KEY, JSON.stringify(items));
        updateBadge(true);
    }
    function cartCount() {
        return getCart().reduce(function (n, i) { return n + i.qty; }, 0);
    }
    function cartTotal() {
        return getCart().reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    }
    function addItem(item) {
        var items = getCart();
        var found = null;
        items.forEach(function (i) { if (i.id === item.id) found = i; });
        if (found) found.qty += 1;
        else items.push({ id: item.id, name: item.name, desc: item.desc, cond: item.cond || '', price: item.price, img: item.img, qty: 1 });
        saveCart(items);
    }
    function setQty(id, qty) {
        var items = [];
        getCart().forEach(function (i) {
            if (i.id === id) i.qty = qty;
            if (i.qty > 0) items.push(i);
        });
        saveCart(items);
    }
    function removeItem(id) {
        saveCart(getCart().filter(function (i) { return i.id !== id; }));
    }
    function money(n) {
        var r = Math.round(n * 100) / 100;
        return '$' + r.toLocaleString('en-US', {
            minimumFractionDigits: r % 1 ? 2 : 0,
            maximumFractionDigits: 2
        });
    }
    var TAX_RATE = 0.10;

    /* ---------- Enlace Carrito + contador en el nav ---------- */
    var countEl = null;
    function updateBadge(bump) {
        if (!countEl) return;
        var n = cartCount();
        countEl.textContent = n;
        countEl.classList.toggle('hidden', n === 0);
        if (bump && n > 0) {
            countEl.classList.add('bump');
            setTimeout(function () { countEl.classList.remove('bump'); }, 280);
        }
    }
    function injectCartLink() {
        var links = document.querySelector('.nav-links');
        if (!links || links.querySelector('.nav-cart')) return;
        var a = document.createElement('a');
        a.href = '/carrito';
        a.className = 'nav-cart';
        a.setAttribute('aria-label', 'Carrito');
        a.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' +
            '<span class="nav-cart-label">Carrito</span>' +
            '<span class="nav-cart-count hidden">0</span>';
        var cta = links.querySelector('.nav-cta');
        links.insertBefore(a, cta || null);
        countEl = a.querySelector('.nav-cart-count');
        updateBadge(false);
    }

    /* ---------- Botón "Agregar al carrito": animación coreografiada ----------
       1) El botón se transforma en una bolsa dorada.
       2) El producto aparece y cae dentro de la bolsa (rebote al recibir).
       3) La bolsa vuela en arco hasta el icono del carrito en el nav.
       4) El icono recibe el golpe y sube el contador (ahí se guarda el item). */
    function restoreBtn(btn, label, rect) {
        // Regreso fluido SIN flash: la bolsa se retira mientras el botón
        // está oculto, y el botón se expande de vuelta desde opacidad 0
        var bag = btn.querySelector('.atc-bag');
        if (bag) bag.remove();
        btn.style.visibility = 'visible';
        btn.style.opacity = '0';
        label.animate([{ opacity: '0' }, { opacity: '1' }], { duration: 240, delay: 200, easing: 'ease-out', fill: 'forwards' });
        var back = btn.animate([
            { width: '60px', height: '60px', borderRadius: '50%', opacity: '0' },
            { width: rect.width + 'px', height: rect.height + 'px', borderRadius: '999px', opacity: '1' }
        ], { duration: 440, delay: 90, easing: 'cubic-bezier(.3,1.25,.4,1)', fill: 'forwards' });
        back.onfinish = function () {
            btn.getAnimations().forEach(function (a) { a.cancel(); });
            label.getAnimations().forEach(function (a) { a.cancel(); });
            btn.style.cssText = '';
            label.style.cssText = '';
            if (bag) bag.remove();
            btn.disabled = false;
        };
    }

    function flyToCart(btn, finish) {
        var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) { finish(); return; }
        var cartIcon = document.querySelector('.nav-cart');
        var iconRect = cartIcon ? cartIcon.getBoundingClientRect() : null;
        var canFly = !!(iconRect && iconRect.width > 0 && iconRect.height > 0);

        var rect = btn.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var parent = btn.parentElement;
        var prect = parent.getBoundingClientRect();
        parent.style.position = 'relative';
        btn.style.cssText += ';position:absolute;left:' + (rect.left - prect.left) + 'px;top:' + (rect.top - prect.top) + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;margin:0;padding:0;z-index:70;display:flex;align-items:center;justify-content:center;';
        btn.disabled = true;
        var label = btn.querySelector('span');
        label.style.transition = 'opacity .15s';
        label.style.opacity = '0';

        // 1) Morph: botón → círculo, y la bolsa SE DIBUJA trazo a trazo
        btn.insertAdjacentHTML('beforeend', '<svg class="atc-bag" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>');
        var bag = btn.querySelector('.atc-bag');
        btn.animate([
            { width: rect.width + 'px', height: rect.height + 'px', borderRadius: '999px' },
            { width: '60px', height: '60px', borderRadius: '50%' }
        ], { duration: 440, delay: 120, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
        // La bolsa se "arma" dibujándose: cuerpo → línea media → asa
        var drawTimes = [[400, 500], [900, 150], [1050, 230]];
        bag.querySelectorAll('path').forEach(function (p, i) {
            var len = p.getTotalLength();
            p.style.strokeDasharray = len + ' ' + len;
            p.style.strokeDashoffset = len;
            var t = drawTimes[i] || [1050, 230];
            p.animate([
                { strokeDashoffset: len },
                { strokeDashoffset: 0 }
            ], { duration: t[1], delay: t[0], easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
        });
        bag.style.opacity = '1';

        // 2) El producto cae dentro de la bolsa
        var size = 104;
        var img = document.createElement('img');
        img.src = btn.dataset.img;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.style.cssText = 'position:fixed;left:' + (cx - size / 2) + 'px;top:' + (cy - 186) + 'px;width:' + size + 'px;height:' + size + 'px;object-fit:cover;border-radius:18px;z-index:80;opacity:0;pointer-events:none;box-shadow:0 18px 44px rgba(0,0,0,.55);';
        document.body.appendChild(img);
        img.animate([
            { opacity: 0, transform: 'translateY(-14px) scale(1.06)' },
            { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { duration: 240, delay: 1280, easing: 'ease-out', fill: 'forwards' });
        img.animate([
            { transform: 'translateY(0) scale(1)', opacity: 1 },
            { transform: 'translateY(126px) scale(.1)', opacity: .9 }
        ], { duration: 360, delay: 1520, easing: 'cubic-bezier(.55,0,.85,.36)', fill: 'forwards' });
        // rebote de la bolsa al recibir el producto
        btn.animate([
            { transform: 'scale(1,1)' },
            { transform: 'scale(1.08,.82)' },
            { transform: 'scale(.96,1.06)' },
            { transform: 'scale(1,1)' }
        ], { duration: 240, delay: 1740, easing: 'ease-out' });

        // 3) Vuelo de la bolsa al icono del carrito
        setTimeout(function () {
            img.remove();
            if (!canFly) {
                // Icono no visible (menú móvil cerrado): salida local elegante
                btn.animate([{ opacity: '1' }, { opacity: '0' }], { duration: 280, easing: 'ease-in', fill: 'forwards' }).onfinish = function () {
                    finish();
                    restoreBtn(btn, label, rect);
                };
                return;
            }
            var clone = document.createElement('div');
            clone.setAttribute('aria-hidden', 'true');
            clone.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>';
            clone.style.cssText = 'position:fixed;left:' + (cx - 30) + 'px;top:' + (cy - 30) + 'px;width:60px;height:60px;border-radius:50%;background:rgba(16,14,9,.96);border:1px solid rgba(212,175,55,.55);display:flex;align-items:center;justify-content:center;z-index:90;color:#d4af37;box-shadow:0 14px 34px rgba(0,0,0,.55);pointer-events:none;';
            clone.firstChild.style.cssText = 'width:26px;height:26px;';
            document.body.appendChild(clone);
            btn.style.visibility = 'hidden';

            var tx = iconRect.left + iconRect.width / 2 - cx;
            var ty = iconRect.top + iconRect.height / 2 - cy;
            clone.animate([
                { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
                { transform: 'translate(' + tx * .5 + 'px,' + (ty * .5 - 72) + 'px) scale(.72)', opacity: 1, offset: .55 },
                { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.22)', opacity: .85, offset: 1 }
            ], { duration: 720, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' }).onfinish = function () {
                clone.remove();
                // 4) Golpe en el icono + contador
                cartIcon.animate([
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.3)' },
                    { transform: 'scale(1)' }
                ], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
                finish();
                restoreBtn(btn, label, rect);
            };
        }, 1900);
    }

    /* ---------- Selector de condición (página de producto) ---------- */
    function wireConditionPicker() {
        var picker = document.querySelector('.condition-options');
        if (!picker) return;
        var btn = document.getElementById('addToCart');
        var amount = document.getElementById('priceAmount');
        var note = document.getElementById('priceNote');
        picker.addEventListener('click', function (e) {
            var opt = e.target.closest('.condition-option');
            if (!opt) return;
            picker.querySelectorAll('.condition-option').forEach(function (o) {
                o.classList.toggle('active', o === opt);
                o.setAttribute('aria-checked', o === opt ? 'true' : 'false');
            });
            if (amount) amount.textContent = '$' + opt.dataset.price;
            if (note) note.textContent = 'en condición: ' + opt.dataset.cond;
            if (btn) {
                btn.dataset.price = opt.dataset.price;
                btn.dataset.cond = opt.dataset.cond;
            }
        });
    }

    function wireAddButton() {
        var btn = document.getElementById('addToCart');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var slug = (btn.dataset.cond || '').toLowerCase().replace(/\s+/g, '');
            var item = {
                id: btn.dataset.id + (slug ? '-' + slug : ''),
                name: btn.dataset.name,
                desc: btn.dataset.desc,
                cond: btn.dataset.cond || '',
                price: Number(btn.dataset.price),
                img: btn.dataset.img
            };
            flyToCart(btn, function () { addItem(item); });
        });
    }

    /* ---------- Página del carrito ---------- */
    function itemHTML(item) {
        return '' +
            '<article class="cart-item" data-id="' + item.id + '">' +
            '<div class="cart-item-media"><img draggable="false" src="' + item.img + '" alt="' + item.name + '"></div>' +
            '<div class="cart-item-info">' +
            '<h3>' + item.name + '</h3>' +
            '<p>' + item.desc + '</p>' +
            (item.cond ? '<div class="cart-item-cond">Condición: ' + item.cond + '</div>' : '') +
            '<span class="cart-item-price">' + money(item.price) + ' c/u</span>' +
            '</div>' +
            '<div class="cart-item-actions">' +
            '<div class="qty">' +
            '<button type="button" data-act="dec" aria-label="Quitar uno">−</button>' +
            '<span>' + item.qty + '</span>' +
            '<button type="button" data-act="inc" aria-label="Agregar uno">+</button>' +
            '</div>' +
            '<strong class="cart-item-total">' + money(item.price * item.qty) + '</strong>' +
            '<button type="button" class="cart-item-remove" data-act="del" aria-label="Quitar del carrito">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
            '</button>' +
            '</div>' +
            '</article>';
    }

    var firstRender = true;
    function renderCartPage() {
        var itemsEl = document.getElementById('cartItems');
        if (!itemsEl) return;
        var emptyEl = document.getElementById('cartEmpty');
        var contentEl = document.getElementById('cartContent');
        var items = getCart();
        var hasItems = items.length > 0;
        emptyEl.classList.toggle('hidden', hasItems);
        contentEl.classList.toggle('hidden', !hasItems);
        // Entrada animada solo en la PRIMERA carga de la página
        if (firstRender) {
            firstRender = false;
            if (hasItems) {
                contentEl.classList.add('cart-enter');
            } else {
                emptyEl.classList.add('cart-enter');
            }
        }
        if (!hasItems) return;
        itemsEl.innerHTML = items.map(itemHTML).join('');
        if (contentEl.classList.contains('cart-enter')) {
            Array.prototype.forEach.call(itemsEl.children, function (el, i) {
                el.classList.add('cart-enter');
                el.style.animationDelay = (i * 90) + 'ms';
            });
        }
        var subtotal = cartTotal();
        var tax = Math.round(subtotal * TAX_RATE * 100) / 100;
        document.getElementById('cartSubtotal').textContent = money(subtotal);
        document.getElementById('cartTax').textContent = money(tax);
        document.getElementById('cartTotal').textContent = money(subtotal + tax);
    }

    function wireCartPage() {
        var itemsEl = document.getElementById('cartItems');
        if (!itemsEl) return;
        itemsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-act]');
            if (!btn) return;
            var id = btn.closest('.cart-item').dataset.id;
            var item = getCart().filter(function (i) { return i.id === id; })[0];
            if (!item) return;
            if (btn.dataset.act === 'inc') setQty(id, item.qty + 1);
            else if (btn.dataset.act === 'dec') setQty(id, item.qty - 1);
            else if (btn.dataset.act === 'del') removeItem(id);
            renderCartPage();
        });
    }

    /* ---------- Init ---------- */
    injectCartLink();
    wireConditionPicker();
    wireAddButton();
    wireCartPage();
    renderCartPage();
})();
