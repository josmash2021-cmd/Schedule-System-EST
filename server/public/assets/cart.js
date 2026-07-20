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
        else items.push({ id: item.id, name: item.name, desc: item.desc, price: item.price, img: item.img, qty: 1 });
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
    function money(n) { return '$' + Number(n).toLocaleString('en-US'); }

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

    /* ---------- Botón "Agregar al carrito" (página de producto) ---------- */
    function wireAddButton() {
        var btn = document.getElementById('addToCart');
        if (!btn) return;
        btn.addEventListener('click', function () {
            addItem({
                id: btn.dataset.id,
                name: btn.dataset.name,
                desc: btn.dataset.desc,
                price: Number(btn.dataset.price),
                img: btn.dataset.img
            });
            var label = btn.querySelector('span');
            var prev = label.textContent;
            label.textContent = 'Agregado al carrito';
            btn.classList.add('added');
            btn.disabled = true;
            setTimeout(function () {
                label.textContent = prev;
                btn.classList.remove('added');
                btn.disabled = false;
            }, 1600);
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

    function renderCartPage() {
        var itemsEl = document.getElementById('cartItems');
        if (!itemsEl) return;
        var emptyEl = document.getElementById('cartEmpty');
        var contentEl = document.getElementById('cartContent');
        var items = getCart();
        var hasItems = items.length > 0;
        emptyEl.classList.toggle('hidden', hasItems);
        contentEl.classList.toggle('hidden', !hasItems);
        if (!hasItems) return;
        itemsEl.innerHTML = items.map(itemHTML).join('');
        var total = cartTotal();
        document.getElementById('cartSubtotal').textContent = money(total);
        document.getElementById('cartTotal').textContent = money(total);
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
    wireAddButton();
    wireCartPage();
    renderCartPage();
})();
