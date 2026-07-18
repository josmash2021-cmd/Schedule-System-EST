/* ============================================================
   ElectronicST — Interacciones de la tienda (index/productos)
   ============================================================ */
(function () {
    'use strict';

    /* ---------- Nav: sombra al hacer scroll ---------- */
    var nav = document.querySelector('.nav');
    if (nav) {
        var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    /* ---------- Menú móvil ---------- */
    var burger = document.querySelector('.burger');
    var links = document.querySelector('.nav-links');
    if (burger && links) {
        burger.addEventListener('click', function () {
            var open = links.classList.toggle('open');
            burger.classList.toggle('open', open);
            burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        links.addEventListener('click', function (e) {
            if (e.target.closest('a')) {
                links.classList.remove('open');
                burger.classList.remove('open');
                burger.setAttribute('aria-expanded', 'false');
            }
        });
    }

    /* ---------- Reveal al hacer scroll ---------- */
    var revealEls = document.querySelectorAll('.reveal');
    if (revealEls.length && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealEls.forEach(function (el) { io.observe(el); });
    } else {
        revealEls.forEach(function (el) { el.classList.add('in'); });
    }

    /* ---------- Entrada escalonada de tarjetas ---------- */
    document.querySelectorAll('.grid-products').forEach(function (grid) {
        grid.querySelectorAll('.card-product').forEach(function (card, i) {
            card.style.animationDelay = (i * 70) + 'ms';
        });
    });

    /* ---------- Filtros del catálogo ---------- */
    var filterWrap = document.querySelector('.filters');
    if (filterWrap) {
        var pill = filterWrap.querySelector('.filter-pill');
        var btns = Array.prototype.slice.call(filterWrap.querySelectorAll('.filter-btn'));
        var cards = Array.prototype.slice.call(document.querySelectorAll('.card-product[data-cat]'));

        var movePill = function (btn) {
            if (!btn) return;
            pill.style.width = btn.offsetWidth + 'px';
            pill.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
        };

        movePill(filterWrap.querySelector('.filter-btn.active'));
        window.addEventListener('resize', function () {
            movePill(filterWrap.querySelector('.filter-btn.active'));
        });

        btns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                btns.forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                movePill(btn);

                var cat = btn.dataset.filter;
                var shown = 0;
                cards.forEach(function (card) {
                    var match = cat === 'all' || card.dataset.cat === cat;
                    if (match) {
                        card.hidden = false;
                        card.style.transitionDelay = (shown++ * 45) + 'ms';
                        requestAnimationFrame(function () {
                            requestAnimationFrame(function () { card.classList.remove('hide'); });
                        });
                    } else {
                        card.style.transitionDelay = '0ms';
                        card.classList.add('hide');
                        setTimeout(function () {
                            if (card.classList.contains('hide')) card.hidden = true;
                        }, 260);
                    }
                });
            });
        });
    }
})();
