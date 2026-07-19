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

    /* ---------- Navegación: píldora deslizante + menú móvil ---------- */
    var burger = document.querySelector('.burger');
    var links = document.querySelector('.nav-links');
    if (burger && links) {
        /* Píldora que sigue al enlace bajo el cursor y descansa en el activo
           (solo escritorio; en móvil la oculta el CSS) */
        var navPill = document.createElement('span');
        navPill.className = 'nav-pill';
        navPill.setAttribute('aria-hidden', 'true');
        links.appendChild(navPill);

        var navAnchors = Array.prototype.slice.call(links.querySelectorAll('a:not(.nav-cta)'));
        var activeLink = links.querySelector('a.active') || navAnchors[0];
        if (activeLink) activeLink.setAttribute('aria-current', 'page');

        var moveNavPill = function (el, instant) {
            if (!el) { navPill.style.opacity = '0'; return; }
            if (instant) navPill.style.transition = 'none';
            navPill.style.left = el.offsetLeft + 'px';
            navPill.style.width = el.offsetWidth + 'px';
            navPill.style.opacity = '1';
            if (instant) { void navPill.offsetWidth; navPill.style.transition = ''; }
        };
        moveNavPill(activeLink, true);
        window.addEventListener('load', function () { moveNavPill(activeLink, true); });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () { moveNavPill(activeLink, true); });
        }
        navAnchors.forEach(function (a) {
            a.addEventListener('mouseenter', function () { moveNavPill(a); });
        });
        links.addEventListener('mouseleave', function () { moveNavPill(activeLink); });

        /* Contacto visible solo dentro del menú móvil */
        var navMeta = document.createElement('div');
        navMeta.className = 'nav-meta';
        navMeta.innerHTML = '<a href="tel:+12055737840">(205) 573-7840</a><br><a href="#" class="map-link">3659 Lorna Rd Suite 157, Hoover, AL 35216</a>';
        links.appendChild(navMeta);

        /* Entrada escalonada de los enlaces al abrir el menú móvil */
        Array.prototype.slice.call(links.querySelectorAll('a')).forEach(function (a, i) {
            a.style.setProperty('--d', (80 + i * 70) + 'ms');
        });

        var setMenu = function (open) {
            links.classList.toggle('open', open);
            burger.classList.toggle('open', open);
            burger.setAttribute('aria-expanded', open ? 'true' : 'false');
            document.body.style.overflow = open ? 'hidden' : '';
        };
        burger.addEventListener('click', function () { setMenu(!links.classList.contains('open')); });
        links.addEventListener('click', function (e) {
            if (e.target.closest('a')) setMenu(false);
        });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
        window.addEventListener('resize', function () {
            if (window.innerWidth > 720) setMenu(false);
            moveNavPill(activeLink, true);
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

    /* ---------- Enlaces de dirección: Apple Maps en iOS, Google Maps en el resto ---------- */
    var STORE_ADDRESS = '3659 Lorna Rd Suite 157, Hoover, AL 35216';
    document.addEventListener('click', function (e) {
        var link = e.target.closest('.map-link');
        if (!link) return;
        e.preventDefault();
        var query = encodeURIComponent(STORE_ADDRESS);
        var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        window.open(isIOS ? 'http://maps.apple.com/?q=' + query : 'https://maps.google.com/?q=' + query, '_blank', 'noopener');
    });
})();
