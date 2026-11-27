/* ============================================================
   ElectronicST — Reseñas (franja del inicio + página /reviews)
   Lee window.EST_RESENAS (assets/resenas-datos.js) y pinta:
   - #resenasFranja: la franja que gira en el inicio. Cada tarjeta va en
     su propia .res-pieza y se mueve SOLA (misma animación, desfasada con
     --i): así no hay una tira de 10 000 px que el iPhone no alcanza a
     pintar (se quedaba en negro) y la lista no se duplica. --n (número
     de piezas) fija la duración para que la velocidad sea la misma con
     5 o con 50 reseñas.
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
    // (aria-hidden), así que su enlace no debe recibir el foco con Tab. Sus
    // fotos cargan sin lazy: Safari no detecta bien cuándo una tarjeta que se
    // mueve por animación entra a la pantalla (son miniaturas de pocos KB).
    function tarjeta(r, enFranja) {
        var carga = enFranja ? '' : ' loading="lazy"';
        var n = estrellasDe(r);
        var estrellas = '';
        for (var i = 0; i < 5; i++) {
            estrellas += '<span class="res-estrella' + (i < n ? '' : ' res-apagada') + '">' + ESTRELLA + '</span>';
        }
        var texto = (en && r.texto_en) ? r.texto_en : r.texto;
        var fecha = fechaCorta(r.fecha);
        // Retratos fotográficos de stock; no son imágenes de los clientes.
        var cara = r.foto
            ? '<img class="res-foto" src="' + esc(r.foto) + '" alt="' + esc((en ? 'Illustrative stock photo for the review by ' : 'Foto ilustrativa para la reseña de ') + r.nombre) + '" title="' + (en ? 'Stock photo, not the customer' : 'Foto de stock; no es el cliente') + '" width="40" height="40"' + carga + ' decoding="async" draggable="false">'
            : '<span class="res-iniciales" aria-hidden="true">' + esc(iniciales(r.nombre)) + '</span>';
        // Lo que compró: foto del catálogo + nombre, enlaza a su página
        var p = r.producto && datos.productos && datos.productos[r.producto];
        var producto = p
            ? '<a class="res-producto" href="' + esc(p.url) + '"' + (enFranja ? ' tabindex="-1"' : '') + '>' +
                '<img src="' + esc(p.img) + '" alt="" width="46" height="46"' + carga + ' decoding="async">' +
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
        // Con pocas reseñas se repite la lista: el giro necesita al menos 10
        // piezas para que nunca se vea un hueco a la derecha en pantallas anchas.
        var piezas = datos.lista.slice();
        while (piezas.length < 10) piezas = piezas.concat(datos.lista);
        var n = piezas.length;
        franja.innerHTML = piezas.map(function (r, i) {
            return '<div class="res-pieza" style="--i:' + i + '">' + tarjeta(r, true) + '</div>';
        }).join('');
        franja.style.setProperty('--n', n);
        // Cada pieza recorre n anchos de pieza (de la derecha, fuera de la
        // pantalla, hasta salir por la izquierda). La distancia va escrita
        // aquí porque var() dentro de @keyframes falla en Safari viejos.
        var giro = document.createElement('style');
        giro.textContent = '@keyframes resGiro{from{transform:translateX(' + ((n - 1) * 100) + '%)}to{transform:translateX(-100%)}}';
        document.head.appendChild(giro);
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
