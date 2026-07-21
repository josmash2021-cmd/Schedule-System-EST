/* ============================================================
   ElectronicST — i18n (inglés por defecto, español automático)
   - Si el navegador/dispositivo está en español: se muestra el
     contenido original en español (el HTML ya está en español).
   - En cualquier otro idioma: se cambia todo a inglés usando los
     atributos data-en / data-en-placeholder / data-en-alt /
     data-en-aria de cada elemento.
   - Expone window.EST_LANG ('es' | 'en') para los scripts que
     generan texto dinámico (carrito, citas).
   Se carga SIN defer en el <head> para que EST_LANG exista antes
   de que corra cualquier otro script.
   ============================================================ */
(function () {
    'use strict';
    var lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    var isEs = lang.indexOf('es') === 0;
    window.EST_LANG = isEs ? 'es' : 'en';
    document.documentElement.lang = window.EST_LANG;
    if (isEs) return;

    function swap() {
        // Texto visible
        document.querySelectorAll('[data-en]').forEach(function (el) {
            if (el.tagName === 'META') { el.setAttribute('content', el.getAttribute('data-en')); return; }
            if (el.tagName === 'TITLE') { el.textContent = el.getAttribute('data-en'); return; }
            if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button')) {
                el.value = el.getAttribute('data-en'); return;
            }
            el.textContent = el.getAttribute('data-en');
        });
        // Atributos
        document.querySelectorAll('[data-en-placeholder]').forEach(function (el) {
            el.setAttribute('placeholder', el.getAttribute('data-en-placeholder'));
        });
        document.querySelectorAll('[data-en-alt]').forEach(function (el) {
            el.setAttribute('alt', el.getAttribute('data-en-alt'));
        });
        document.querySelectorAll('[data-en-aria]').forEach(function (el) {
            el.setAttribute('aria-label', el.getAttribute('data-en-aria'));
        });
        document.querySelectorAll('[data-en-value]').forEach(function (el) {
            el.setAttribute('value', el.getAttribute('data-en-value'));
        });
        // Elementos con HTML mezclado (iconos, <br>): reemplazo completo
        document.querySelectorAll('[data-en-html]').forEach(function (el) {
            el.innerHTML = el.getAttribute('data-en-html');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', swap);
    } else {
        swap();
    }
})();
