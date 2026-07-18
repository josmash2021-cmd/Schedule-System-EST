/* ============================================================
   ElectronicST — Interacciones de la tienda (index/productos)
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- Nav: fondo al hacer scroll ---------- */
    var nav = document.querySelector('.nav');
    if (nav) {
        var onScrollNav = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
        window.addEventListener('scroll', onScrollNav, { passive: true });
        onScrollNav();
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
    var revealEls = document.querySelectorAll('.reveal, .reveal-scale');
    if (revealEls.length && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in');
                    io.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });
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

    /* ---------- Parallax + desvanecimiento del hero ---------- */
    var parallaxEls = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
    var heroContent = document.querySelector('.hero-content');
    if (!reduceMotion && (parallaxEls.length || heroContent)) {
        var ticking = false;
        var update = function () {
            ticking = false;
            var y = window.scrollY;
            parallaxEls.forEach(function (el) {
                var speed = parseFloat(el.dataset.parallax) || 0.3;
                el.style.transform = 'translate3d(0,' + (y * speed) + 'px,0)';
            });
            if (heroContent) {
                var fade = Math.max(0, 1 - y / (window.innerHeight * 0.55));
                heroContent.style.opacity = fade.toFixed(3);
                heroContent.style.transform = 'translate3d(0,' + (y * 0.18) + 'px,0)';
            }
        };
        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; requestAnimationFrame(update); }
        }, { passive: true });
        update();
    }

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
