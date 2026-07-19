/* ============================================================
   ElectronicST — Transiciones de página + micro-interacciones
   Se carga en TODAS las páginas: fade al entrar/salir,
   prefetch al pasar el cursor y efecto ripple en botones.
   ============================================================ */
(function () {
    'use strict';

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* 1. Estilos inyectados (funcionan en cualquier página) */
    var css = [
        '@view-transition { navigation: auto; }',
        'html.pt body { opacity: 0; transform: translateY(10px); transition: opacity .32s ease, transform .32s ease; }',
        'html.pt body.pt-in { opacity: 1; transform: none; }',
        'html.pt body.pt-out { opacity: 0; transform: translateY(-6px); transition-duration: .18s; }',
        '.btn { position: relative; overflow: hidden; }',
        '.ripple { position: absolute; border-radius: 50%; background: currentColor; opacity: .22;',
        '  transform: scale(0); animation: pt-ripple .55s ease-out forwards; pointer-events: none; }',
        '@keyframes pt-ripple { to { transform: scale(2.5); opacity: 0; } }'
    ];
    if (reduceMotion) {
        css.push('html.pt body { transition: opacity .12s ease; transform: none !important; }');
    }
    var style = document.createElement('style');
    style.id = 'pt-styles';
    style.textContent = css.join('\n');
    document.head.appendChild(style);

    /* 2. Entrada de la página */
    document.documentElement.classList.add('pt');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            if (document.body) document.body.classList.add('pt-in');
        });
    });
    /* Restaurar al volver con atrás/adelante (bfcache) */
    window.addEventListener('pageshow', function (e) {
        if (e.persisted && document.body) {
            document.body.classList.remove('pt-out');
            document.body.classList.add('pt-in');
        }
    });

    /* 3. Detección de enlaces internos navegables */
    function isInternal(a) {
        if (!a || a.target || a.hasAttribute('download')) return false;
        var href = a.getAttribute('href');
        if (!href || href.charAt(0) === '#' || /^(mailto|tel|javascript):/i.test(href)) return false;
        var url;
        try { url = new URL(href, location.href); } catch (e) { return false; }
        if (url.origin !== location.origin) return false;
        if (url.pathname === location.pathname && url.hash) return false; /* ancla en la misma página */
        return true;
    }

    /* 4. Salida con fade antes de navegar */
    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        var a = e.target.closest ? e.target.closest('a[href]') : null;
        if (!isInternal(a)) return;
        var href = a.href;
        if (href === location.href) return;
        e.preventDefault();
        document.body.classList.remove('pt-in');
        document.body.classList.add('pt-out');
        setTimeout(function () { location.href = href; }, reduceMotion ? 60 : 190);
    });

    /* 5. Prefetch al pasar el cursor: la siguiente página carga al instante */
    var prefetched = {};
    document.addEventListener('pointerover', function (e) {
        var a = e.target.closest ? e.target.closest('a[href]') : null;
        if (!isInternal(a) || prefetched[a.href]) return;
        prefetched[a.href] = true;
        var l = document.createElement('link');
        l.rel = 'prefetch';
        l.href = a.href;
        document.head.appendChild(l);
    });

    /* 6. Ripple al hacer clic en cualquier .btn */
    document.addEventListener('pointerdown', function (e) {
        var b = e.target.closest ? e.target.closest('.btn') : null;
        if (!b) return;
        var rect = b.getBoundingClientRect();
        var d = Math.max(rect.width, rect.height);
        var s = document.createElement('span');
        s.className = 'ripple';
        s.style.width = s.style.height = d + 'px';
        s.style.left = (e.clientX - rect.left - d / 2) + 'px';
        s.style.top = (e.clientY - rect.top - d / 2) + 'px';
        b.appendChild(s);
        setTimeout(function () { s.remove(); }, 600);
    });
})();
