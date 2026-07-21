/* ============================================================
   ElectronicST — Chat flotante 24/7 (atención al cliente)
   Botón circular fijo abajo a la derecha con panel de contacto:
   WhatsApp, llamada y reserva de cita. Sin dependencias.
   ============================================================ */
(function () {
    'use strict';
    if (document.querySelector('.chat-widget')) return;

    var PHONE = '12055737840';

    // Saludo según la hora local del cliente
    var h = new Date().getHours();
    var saludo = h < 12 ? 'buenos días' : (h < 19 ? 'buenas tardes' : 'buenas noches');
    var mensaje = encodeURIComponent('Hola, ' + saludo + ', me gustaría hablar con un agente!');

    var wrap = document.createElement('div');
    wrap.className = 'chat-widget';
    wrap.innerHTML =
        '<button type="button" class="chat-fab" aria-label="Abrir chat de atención al cliente 24/7" aria-expanded="false">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
            '<span class="chat-fab-247">24/7</span>' +
            '<span class="chat-fab-dot" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="chat-panel" role="dialog" aria-label="Chat de atención al cliente" hidden>' +
            '<div class="chat-panel-head">' +
                '<div class="chat-panel-title">' +
                    '<strong>Atención al cliente</strong>' +
                    '<span><i class="chat-online" aria-hidden="true"></i>En línea 24/7 · respondemos en minutos</span>' +
                '</div>' +
                '<button type="button" class="chat-close" aria-label="Cerrar chat">&times;</button>' +
            '</div>' +
            '<div class="chat-panel-body">' +
                '<p class="chat-msg">Hola, bienvenido a ElectronicST. ¿En qué te ayudamos? Escríbenos por WhatsApp o mensaje de texto y te atendemos ahora mismo.</p>' +
            '</div>' +
            '<div class="chat-panel-actions">' +
                '<a class="chat-btn chat-btn-wa" href="https://wa.me/' + PHONE + '?text=' + mensaje + '" target="_blank" rel="noopener">Escribir por WhatsApp</a>' +
                '<a class="chat-btn chat-btn-ghost" href="sms:+1' + PHONE + '?&body=' + mensaje + '">Mensaje de texto</a>' +
                '<a class="chat-btn chat-btn-blue" href="/book-appointment">Reservar cita</a>' +
            '</div>' +
        '</div>';
    document.body.appendChild(wrap);

    var fab = wrap.querySelector('.chat-fab');
    var panel = wrap.querySelector('.chat-panel');
    var closeBtn = wrap.querySelector('.chat-close');

    function setOpen(open) {
        panel.hidden = !open;
        fab.setAttribute('aria-expanded', String(open));
    }

    fab.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(panel.hidden);
    });
    closeBtn.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('click', function (e) {
        if (!wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setOpen(false);
    });
})();
