/* ============================================================
   ElectronicST — Reseñas (franja del inicio + página /reviews)
   Lee window.EST_RESENAS (assets/resenas-datos.js) y pinta:
   - #resenasFranja: la franja que gira en el inicio. La lista va dos
     veces seguidas para que el giro no salte al volver a empezar; --n
     (número de reseñas) fija la duración para que la velocidad sea la
     misma con 5 o con 50 reseñas.
   - #resenasLista + #resenasResumen: todas las reseñas en /reviews, de
     la más nueva a la más vieja, con el promedio calculado de la lista.
   - [data-google-resenas]: el botón al perfil de Google (oculto si no
     hay googleUrl).
   Cargar SIN defer al final del <body>, después de resenas-datos.js.
   Usa window.EST_LANG (i18n.js) para elegir los textos.
   ============================================================ */
(function () {
    'use strict';
    var datos = window.EST_RESENAS;
    if (!datos || !datos.lista || !datos.lista.length) return;
    var en = window.EST_LANG === 'en';
    var ESTRELLA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 6.05 6.65.82-4.92 4.56 1.3 6.57L12 17.3l-5.88 3.3 1.3-6.57L2.5 9.47l6.65-.82z"/></svg>';

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function iniciales(nombre) {
        return String(nombre).replace(/\./g, '').split(/\s+/).filter(Boolean)
            .slice(0, 2).map(function (p) { return p.charAt(0); }).join('').toUpperCase();
    }
    function estrellasDe(r) {
        var n = Math.round(Number(r.estrellas) || 5);
        return Math.max(1, Math.min(5, n));
    }
    function fechaCorta(f) {
        if (!f) return '';
        var d = new Date(f + 'T12:00:00');
        if (isNaN(d)) return '';
        return d.toLocaleDateString(en ? 'en-US' : 'es-US', { month: 'short', year: 'numeric' });
    }

    // enFranja: la franja del inicio está escondida para lectores de pantalla
    // (aria-hidden), así que su enlace no debe recibir el foco con Tab.
    function tarjeta(r, enFranja) {
        var n = estrellasDe(r);
        var estrellas = '';
        for (var i = 0; i < 5; i++) {
            estrellas += '<span class="res-estrella' + (i < n ? '' : ' res-apagada') + '">' + ESTRELLA + '</span>';
        }
        var texto = (en && r.texto_en) ? r.texto_en : r.texto;
        var fecha = fechaCorta(r.fecha);
        // Foto de perfil del cliente (la de su reseña en Google); sin foto, sus iniciales
        var cara = r.foto
            ? '<img class="res-foto" src="' + esc(r.foto) + '" alt="" width="34" height="34" loading="lazy">'
            : '<span class="res-iniciales" aria-hidden="true">' + esc(iniciales(r.nombre)) + '</span>';
        // Lo que compró: foto del catálogo + nombre, enlaza a su página
        var p = r.producto && datos.productos && datos.productos[r.producto];
        var producto = p
            ? '<a class="res-producto" href="' + esc(p.url) + '"' + (enFranja ? ' tabindex="-1"' : '') + '>' +
                '<img src="' + esc(p.img) + '" alt="" width="46" height="46" loading="lazy">' +
                '<span><small>' + (en ? 'Bought' : 'Compró') + '</small><b>' + esc(p.nombre) + '</b></span>' +
              '</a>'
            : '';
        return '<article class="testimonial-card">' +
            '<div class="testimonial-rating">' +
                '<div class="testimonial-stars" role="img" aria-label="' + n + (en ? ' out of 5 stars' : ' de 5 estrellas') + '">' + estrellas + '</div>' +
                '<span class="testimonial-score">' + n.toFixed(1) + '</span>' +
            '</div>' +
            '<p class="testimonial-text">' + esc(texto) + '</p>' +
            producto +
            '<div class="testimonial-footer">' +
                '<span class="res-quien">' + cara +
                '<span class="testimonial-author">— ' + esc(r.nombre) + '</span></span>' +
                (r.fuente === 'google' || fecha
                    ? '<span class="res-fuente">' + [r.fuente === 'google' ? 'Google' : '', esc(fecha)].filter(Boolean).join(' · ') + '</span>'
                    : '') +
            '</div>' +
        '</article>';
    }

    // Franja del inicio
    var franja = document.getElementById('resenasFranja');
    if (franja) {
        var html = datos.lista.map(function (r) { return tarjeta(r, true); }).join('');
        franja.innerHTML = html + html;
        franja.style.setProperty('--n', datos.lista.length);
    }

    // Página /reviews
    var lista = document.getElementById('resenasLista');
    if (lista) {
        var orden = datos.lista.slice().sort(function (a, b) {
            return String(b.fecha || '').localeCompare(String(a.fecha || ''));
        });
        lista.innerHTML = orden.map(function (r) { return tarjeta(r, false); }).join('');
        var resumen = document.getElementById('resenasResumen');
        if (resumen) {
            var suma = datos.lista.reduce(function (t, r) { return t + estrellasDe(r); }, 0);
            var total = datos.lista.length;
            var todasGoogle = datos.lista.every(function (r) { return r.fuente === 'google'; });
            resumen.innerHTML = '<b>' + (suma / total).toFixed(1) + '</b>' +
                '<span class="res-resumen-estrellas" aria-hidden="true">' + ESTRELLA + ESTRELLA + ESTRELLA + ESTRELLA + ESTRELLA + '</span>' +
                '<span>' + (en
                    ? 'Average of ' + total + (todasGoogle ? ' Google reviews' : ' reviews')
                    : 'Promedio de ' + total + (todasGoogle ? ' reseñas en Google' : ' reseñas')) + '</span>';
        }
    }

    // Botón al perfil de Google
    document.querySelectorAll('[data-google-resenas]').forEach(function (a) {
        if (datos.googleUrl) {
            a.href = datos.googleUrl;
            a.target = '_blank';
            a.rel = 'noopener';
            a.hidden = false;
        } else {
            a.hidden = true;
        }
    });
})();
