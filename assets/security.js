/* ============================================================
   ElectronicST — Bloqueo de zoom y copia de imágenes
   Se carga en todas las páginas del sitio.
   ============================================================ */
(function () {
    'use strict';

    // Prevenir zoom con teclado (Ctrl + +/-)
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && ['+', '-', '=', '_'].includes(e.key)) e.preventDefault();
    }, { passive: false });

    // Prevenir zoom con rueda del mouse (Ctrl + scroll)
    document.addEventListener('wheel', function (e) {
        if (e.ctrlKey) e.preventDefault();
    }, { passive: false });

    // Prevenir gesto de pellizco en iOS
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
    document.addEventListener('gestureend', function (e) { e.preventDefault(); });

    // Prevenir touchmove con 2 dedos (pellizco)
    document.addEventListener('touchmove', function (e) {
        if (e.touches && e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    // Prevenir menú contextual en imágenes (clic derecho)
    document.addEventListener('contextmenu', function (e) {
        if (e.target.tagName === 'IMG') e.preventDefault();
    });

    // Prevenir arrastre de imágenes
    document.addEventListener('dragstart', function (e) {
        if (e.target.tagName === 'IMG') e.preventDefault();
    });
})();
