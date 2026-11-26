/* Panel sin zoom (petición del dueño): no se puede acercar ni alejar.
   - index.html: viewport con maximum-scale=1 y user-scalable=no.
   - styles.css: html { touch-action: pan-x pan-y } (sin pellizco ni doble toque
     en Android/Chrome).
   - Aquí: iPhone/iPad ignoran user-scalable=no, así que se bloquean sus gestos
     de pellizco; y en PC, Ctrl/⌘ + rueda (o pellizco del trackpad) y
     Ctrl/⌘ + / − / 0. El zoom desde el menú del navegador no se puede bloquear. */

const bloquear = (e) => e.preventDefault();
const opts = { passive: false };

// iOS Safari: gestos de pellizco.
document.addEventListener('gesturestart', bloquear, opts);
document.addEventListener('gesturechange', bloquear, opts);
document.addEventListener('gestureend', bloquear, opts);

// Pellizco con dos dedos (cualquier pantalla táctil).
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 1) e.preventDefault();
}, opts);

// PC: Ctrl/⌘ + rueda del mouse y pellizco del trackpad (llega como wheel+ctrl).
window.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) e.preventDefault();
}, opts);

// PC: Ctrl/⌘ + "+", "-", "=", "0" (también los del teclado numérico).
const TECLAS = new Set(['+', '-', '=', '_', '0']);
const CODIGOS = new Set(['NumpadAdd', 'NumpadSubtract', 'Numpad0', 'Equal', 'Minus', 'Digit0']);
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (TECLAS.has(e.key) || CODIGOS.has(e.code))) e.preventDefault();
});
