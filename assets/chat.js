/* ============================================================
   ElectronicST — Chat flotante 24/7 (atención al cliente)
   Botón circular fijo abajo a la derecha con panel de contacto:
   WhatsApp, llamada y reserva de cita. Sin dependencias.
   ============================================================ */
(function () {
    'use strict';
    if (document.querySelector('.chat-widget')) return;

    // Estilos autocontenidos: el widget se usa en páginas que NO cargan
    // site-v3.css (privacy, terms, book-appointment). Sin esto el SVG del
    // botón crecía a pantalla completa y el panel se desarmaba en móviles.
    // Se usan var() con fallback: en páginas con site-v3.css manda el tema.
    var css = '' +
    '.chat-widget{position:fixed;right:22px;bottom:22px;z-index:120;font-family:inherit}' +
    '.chat-widget *{box-sizing:border-box}' +
    '.chat-fab{position:relative;width:58px;height:58px;border-radius:50%;cursor:pointer;background:#fff;border:1px solid rgba(255,255,255,.9);color:#0a0a0c;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-shadow:0 14px 34px rgba(0,0,0,.55);transition:transform .25s,box-shadow .25s}' +
    '.chat-fab:hover{transform:translateY(-3px);box-shadow:0 20px 44px rgba(0,0,0,.65)}' +
    '.chat-fab svg{width:22px;height:22px}' +
    '.chat-fab-247{font-size:8.5px;font-weight:800;letter-spacing:.1em}' +
    '.chat-fab-dot{position:absolute;top:2px;right:2px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #fff;animation:chatDotPulse 1.8s ease-out infinite}' +
    '@keyframes chatDotPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 9px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
    '.chat-panel{position:absolute;right:0;bottom:72px;width:320px;max-width:calc(100vw - 44px);background:var(--panel,#17181d);border:1px solid var(--line,rgba(255,255,255,.1));border-radius:20px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.6);transform-origin:bottom right;animation:chatPanelIn .34s cubic-bezier(.22,1.2,.36,1);color:var(--text,#f2f3f5)}' +
    '@keyframes chatPanelIn{from{opacity:0;transform:translateY(14px) scale(.92)}to{opacity:1;transform:none}}' +
    '.chat-panel.closing{animation:chatPanelOut .22s cubic-bezier(.5,0,.75,0) forwards}' +
    '@keyframes chatPanelOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(12px) scale(.94)}}' +
    '.chat-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px 16px 12px;border-bottom:1px solid var(--line,rgba(255,255,255,.1))}' +
    '.chat-panel-head strong{display:block;font-size:15px}' +
    '.chat-panel-head span{display:flex;align-items:center;gap:6px;color:var(--muted,#9aa0a8);font-size:12px;margin-top:3px}' +
    '.chat-online{width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block}' +
    '.chat-close{background:none;border:none;color:var(--muted,#9aa0a8);font-size:22px;line-height:1;cursor:pointer;padding:2px 6px;border-radius:8px}' +
    '.chat-close:hover{color:#fff;background:rgba(255,255,255,.08)}' +
    '.chat-panel-body{padding:14px 16px}' +
    '.chat-msg{background:rgba(255,255,255,.06);border:1px solid var(--line,rgba(255,255,255,.1));border-radius:14px 14px 14px 4px;padding:10px 13px;font-size:13.5px;line-height:1.5;margin:0}' +
    '.chat-panel-actions{display:grid;gap:8px;padding:0 16px 16px}' +
    '.chat-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;padding:11px 14px 11px 42px;border-radius:12px;font-size:13.5px;font-weight:700;text-decoration:none;transition:transform .2s,filter .2s}' +
    '.chat-btn .btn-ico{position:absolute;left:16px;top:50%;transform:translateY(-50%);width:17px;height:17px}' +
    '.chat-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}' +
    '.chat-btn-wa{background:#22c55e;color:#04120a}' +
    '.chat-btn-ghost{background:rgba(255,255,255,.07);color:var(--text,#f2f3f5);border:1px solid var(--line,rgba(255,255,255,.1))}' +
    '.chat-btn-blue{background:#fff;color:#0a0a0c}' +
    '@media (max-width:720px){.chat-widget{right:16px;bottom:16px}.chat-fab{width:54px;height:54px}.chat-panel{bottom:66px}}' +
    '@media (prefers-reduced-motion:reduce){.chat-fab-dot,.chat-panel{animation:none}}';
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var PHONE = '12055737840';        // línea de atención (SMS/llamadas)
    var WA_PHONE = '18018017359';     // WhatsApp Business con el bot Angela
    var LANG = window.EST_LANG || 'es';
    function T(es, en) { return LANG === 'en' ? en : es; }

    // Saludo según la hora local del cliente (en el idioma de su dispositivo)
    var h = new Date().getHours();
    var saludo = LANG === 'en'
        ? (h < 12 ? 'good morning' : (h < 19 ? 'good afternoon' : 'good evening'))
        : (h < 12 ? 'buenos días' : (h < 19 ? 'buenas tardes' : 'buenas noches'));
    var mensaje = encodeURIComponent(T('Hola, ' + saludo + ', me gustaría hablar con un agente!',
                                       'Hello, ' + saludo + ', I would like to speak with an agent!'));

    var wrap = document.createElement('div');
    wrap.className = 'chat-widget';
    wrap.innerHTML =
        '<button type="button" class="chat-fab" aria-label="' + T('Abrir chat de atención al cliente 24/7', 'Open 24/7 customer service chat') + '" aria-expanded="false">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
            '<span class="chat-fab-247">24/7</span>' +
            '<span class="chat-fab-dot" aria-hidden="true"></span>' +
        '</button>' +
        '<div class="chat-panel" role="dialog" aria-label="' + T('Chat de atención al cliente', 'Customer service chat') + '" hidden>' +
            '<div class="chat-panel-head">' +
                '<div class="chat-panel-title">' +
                    '<strong>' + T('Atención al cliente', 'Customer service') + '</strong>' +
                    '<span><i class="chat-online" aria-hidden="true"></i>' + T('En línea · respondemos en minutos', 'Online · we reply in minutes') + '</span>' +
                '</div>' +
                '<button type="button" class="chat-close" aria-label="' + T('Cerrar chat', 'Close chat') + '">&times;</button>' +
            '</div>' +
            '<div class="chat-panel-body">' +
                '<p class="chat-msg">' + T('Hola, bienvenido a ElectronicST. ¿En qué te ayudamos? Escríbenos por WhatsApp o mensaje de texto y te atendemos ahora mismo.', 'Hi, welcome to ElectronicST. How can we help you? Message us on WhatsApp or by text and we will assist you right away.') + '</p>' +
            '</div>' +
            '<div class="chat-panel-actions">' +
                '<a class="chat-btn chat-btn-wa" href="https://wa.me/' + WA_PHONE + '?text=' + mensaje + '" target="_blank" rel="noopener"><svg class="btn-ico" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M380.9 97.1C339 55.1 283.2 0 193.9 0c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>' + T('Escribir por WhatsApp', 'Message on WhatsApp') + '</a>' +
                '<a class="chat-btn chat-btn-ghost" href="sms:+1' + PHONE + '?&body=' + mensaje + '"><svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' + T('Mensaje de texto', 'Text message') + '</a>' +
                '<a class="chat-btn chat-btn-blue" href="/book-appointment"><svg class="btn-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' + T('Reservar cita', 'Book appointment') + '</a>' +
            '</div>' +
        '</div>';
    document.body.appendChild(wrap);

    var fab = wrap.querySelector('.chat-fab');
    var panel = wrap.querySelector('.chat-panel');
    var closeBtn = wrap.querySelector('.chat-close');

    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function setOpen(open) {
        if (open) {
            panel.classList.remove('closing');
            panel.hidden = false;
            fab.setAttribute('aria-expanded', 'true');
        } else if (!panel.hidden) {
            fab.setAttribute('aria-expanded', 'false');
            if (reducedMotion) { panel.hidden = true; return; }
            panel.classList.add('closing');
            panel.addEventListener('animationend', function done() {
                panel.removeEventListener('animationend', done);
                panel.classList.remove('closing');
                panel.hidden = true;
            });
        }
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
