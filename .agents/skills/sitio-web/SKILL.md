---
name: sitio-web
description: Workflow para modificar el sitio público (HTML/CSS/JS estático en la raíz) — páginas, assets, copia a server/public y reglas de estilo del tema oscuro
type: prompt
whenToUse: Cuando el usuario pida cambios en la página web pública, landing, productos, carrito, reserva de citas, textos legales o assets del sitio
---

# Cambios en el sitio público (raíz del repo)

Sitio estático sin bundler. **No explores para ubicar:** mapa en `AGENTS.md`
y detalle fino (decisiones de diseño, bugs resueltos, advertencias) en
`MEMORIA.md` — léelo si tu cambio toca algo descrito ahí.

## Ubicaciones directas

| Necesitas | Archivo |
|---|---|
| Landing | `index.html` |
| Catálogo | `products.html` |
| Producto | `macbook-air-13.html`, `iphone-15-pro.html` |
| Reserva de citas (wizard) | `book-appointment.html` (CSS inline propio) |
| Carrito | `cart.html` + `assets/cart.js` |
| Sistema de diseño oscuro | `assets/site-v3.css` |
| Nav, reveals, filtros, mapa | `assets/site.js` (un solo IIFE, ES5) |
| Transiciones entre páginas | `assets/transitions.js` (se carga en todas) |
| Legales (tema CLARO, CSS inline duplicado) | `terms.html`, `privacy.html` |
| Backend citas/slots | `server/routes/appointments.js`, `slots.js`, `utils.js` |

## Workflow obligatorio

1. **Edita** la página/asset en la raíz. Texto visible en español; rutas/URLs
   en inglés (`/products`, `/book-appointment`, `/cart`, ...). Las rutas
   viejas en español son redirects 301 en `server/index.js` — conservarlas.
2. **Si agregas/renombras una página:** actualiza `htmlRoutes` en
   `server/index.js` y la lista de `server/scripts/copy-frontend.js`.
3. **Copia al deploy:** `node server/scripts/copy-frontend.js`
   (regenera `server/public/`, commiteada — Railway solo despliega `server/`).
4. **Verifica** el resultado (abre la página o revisa la copia en
   `server/public/`). No hay tests.
5. **Commit + push a `master`** con estilo `feat|fix|style(web): <desc>`.
   Incluye siempre la raíz modificada + `server/public/`.

## Reglas de diseño (del dueño, no violar)

- Tema oscuro **monocromo**: blanco/negro + dorado solo del logo
  (`#d4af37` en elementos DOM). Los acentos azules se eliminaron; no
  reintroducir color sin pedirlo.
- Fondo de seda: `assets/img/background-auth.webp` vía `body::before`
  (móvil ≤720px: posición `85% 20%`).
- `book-appointment.html` tiene su CSS **inline**: un cambio visual del tema
  oscuro puede requerir editar también `site-v3.css` (y viceversa).
- `terms.html`/`privacy.html` son tema claro con tokens inline duplicados:
  un cambio ahí se edita en los 2 archivos.
- Mapa de la home (MapLibre): filtro navy en el canvas ROTA colores 185° —
  los colores de capas están compensados a la inversa (ver `MEMORIA.md` §3
  antes de tocar el mapa). El mapa es 100% no interactivo y sin marcador
  sobre la tienda (solo flecha dorada + tarjeta de dirección).
- `assets/site.js`: no redeclarar `pill`/`movePill` (son de los filtros del
  catálogo); el código del nav usa prefijo `nav*`.
- Respeta `prefers-reduced-motion` en cualquier animación nueva.

## Datos del negocio (hardcodeados en varios archivos)

Dirección: 3659 Lorna Rd Suite 157, Hoover, AL 35216. Tel: (205) 573-7840.
Horario: Lun–Sáb 10:00–15:00, slots de 30 min, domingo cerrado, citas el
mismo día con 1 h de anticipación. Todo en TZ `America/Chicago`. Están
repetidos en varios HTML y en `server/notifications.js` — si cambian, busca
todas las ocurrencias.
