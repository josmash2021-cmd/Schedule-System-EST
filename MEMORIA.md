# MEMORIA DEL PROYECTO — Schedule-System-EST (ElectronicST)

> Auditoría creada el 2026-07-18, actualizada el 2026-07-19. Memoria de trabajo
> NO genérica: describe lo que existe HOY en el código, con ubicaciones exactas.
> Actualizarla cuando cambie estructura, flujos o configuración.

---

## 1. El negocio (datos duros hardcodeados)

- **Nombre:** ElectronicST (Electronic Service Technology) — tienda de productos
  Apple (MacBook/iPhone) + servicio técnico, sitio 100% en español.
- **Dirección:** 3659 Lorna Rd Suite 157, Hoover, AL 35216.
- **Teléfono:** (205) 573-7840 → `tel:+12055737840`.
- **Horario:** Lunes a Sábado, 10:00 a.m. – 3:00 p.m. Domingos cerrado.
  Slots de 30 min. Zona horaria del negocio: `America/Chicago`.
- Estos datos están repetidos en: `index.html`, `productos.html`,
  `solicitud-servicio.html`, `server/notifications.js` (STORE_ADDRESS/STORE_PHONE),
  `netlify/functions/_lib/config.mjs`. No hay una fuente única.

## 2. Stack y despliegue (¡ambigüedad importante!)

- **Frontend:** HTML/CSS/JS estático, sin frameworks, sin bundler, sin tests,
  sin CI. Fuente Inter (Google Fonts).
- **Backend activo (producción):** Express + PostgreSQL (Railway). A partir del
  2026-07-19 el mismo backend Express sirve también el frontend estático desde
  `server/public/`, por lo que `schedule-system-est-production.up.railway.app`
  es ahora la URL única del sitio completo. El frontend sigue llamando a rutas
  relativas `/api/...`.
- **`server/public/`:** copia del frontend (HTML, assets, QR, logo) generada por
  `server/scripts/copy-frontend.js` y commiteada en el repo para que Railway la
  incluya en el deploy. El build script detecta si los archivos fuente no están
  disponibles (por ejemplo, en el contenedor de Railway) y conserva `public/`
  sin destruirlo.
- **Stack actual (2026-07-22, decisión del dueño): Vercel + Railway.**
  Vercel sirve el frontend estático (dominio personalizado) y proxifica
  `/api/*`, `/bot-qr*` y `/voz/*` → Railway (ver `vercel.json`). Railway
  corre el servidor Express (API, citas, bots de WhatsApp e Instagram,
  `/bot-qr`, `/voz/`). Se intentó migrar todo a Railway pero el DNS de
  Vercel no soltó la raíz (registro ALIAS por defecto imborrable), así
  que se restauró `vercel.json` y el dominio queda conectado al proyecto
  de Vercel. `netlify.toml` quedó obsoleto; `netlify/functions/` sigue
  siendo código alternativo no activo.
  **Los archivos HTML están en inglés** (`products.html`,
  `book-appointment.html`, `cart.html`, `terms.html`, `privacy.html`).
  Si se agregan/renombran rutas, hay que actualizar `server/index.js`
  y `copy-frontend.js`.
  `qr-cita.png` apuntaba a la URL vieja de Vercel; el QR debería
  regenerarse/apuntar a `https://electronicservicetechnology.com/book-appointment`
  si se usa material impreso.
- Hay dos `package.json` (raíz vacía; `server/` con express, pg, jsonwebtoken,
  twilio, cors, dotenv).

## 3. Mapa del frontend

### `index.html` — landing oscura estilo Apple (usa `assets/site-v3.css`)
Hero a pantalla completa con parallax (`data-parallax="0.28"`), entrada
escalonada (`.h-in-1..4`), sin indicador de scroll (`.scroll-cue` eliminado).
Gradiente superior reforzado (`assets/site-v3.css:194`) para oscurecer también
la zona justo debajo del menú (`rgba(0,0,0,.85)` → `.25` → `.55` → `#000`),
marquee infinito, 2 "capítulos" (MacBook desde
$1,099 / iPhone desde $799) con glow de color, 4 valores, y panel de reserva
final (`.cta-banner`): fondo transparente para mostrar la seda de la página;
luz blanca animada (`@keyframes ctaLight` en `::before`) y campo de puntos
(`::after`) por encima. `.cta-card` de vidrio más translúcido
(`backdrop-filter: blur(18px)`) con botones + QR de citas (`qr-cita.png`).
Sección "Dónde operamos" (antes "Where we operate"; todo el texto pasó a
español el 2026-07-20: eyebrow "Nuestra cobertura", tarjetas "Alabama —
Sede principal y cobertura en todo el estado" y "Sur de Florida", leyenda
"Áreas de cobertura"): mapa 3D con **MapLibre GL JS 4.7.1** (desde
2026-07-20; reemplazó a Leaflet) usando el estilo vectorial CartoDB
`dark-matter-gl-style` (source `carto`), teñido azul navy vía filtro CSS en
`.maplibregl-canvas` (`brightness(.9) sepia(.6) hue-rotate(185deg)
saturate(1.7)`; fondo del contenedor `#0b1426`). Alabama: anillo GeoJSON
como capa `line` SOLO con borde dorado `#d4af37` (sin relleno). Edificios
3D: capa `fill-extrusion` sobre `source-layer: building` de Carto
(alturas `render_height`, minzoom 13, insertada antes de la primera capa
`symbol`). OJO con el filtro navy del canvas: ROTA los colores 185°, así
que los colores de las capas se compensan a la inversa — los edificios
usan `#3c2606` (marrón oscuro) que tras el filtro SE VE `#1b2a4a` (azul
oscuro), y el borde de Alabama declarado `#d4af37` en realidad SE VE
`#8cacff` (azul claro); un dorado real no es alcanzable con este filtro
(lo más cercano sería un cobrizo). El marcador y el swatch de la leyenda
sí son dorados reales (son DOM, no pasan por el filtro). Los edificios
APARECEN FLUIDOS (2026-07-20): altura, base y opacidad interpoladas por
zoom (`interpolate linear` 13.8→15.5/15.2), así crecen desde el suelo
durante el flyTo en vez de aparecer de golpe. SIN marcador sobre la tienda (2026-07-20: el dueño pidió quitar el dot —
antes hubo pin tipo aguja y dot 3D, ambos rechazados; no reintroducir).
La dirección + horario se muestran en una tarjeta fija `.store-card`
(HTML estático dentro de `.operate-map`, arriba-centro,
`pointer-events: none`, mismo estilo vidrio+dorado `.sp-*`) que aparece
con transición al terminar el vuelo (`showStoreCard` en `moveend`). La
flechita dorada `.map-arrow` es un MARCADOR de MapLibre anclado por la
punta en la coordenada exacta de la tienda (`anchor: 'bottom'`; el rebote
va en el SVG hijo para no chocar con el posicionamiento de MapLibre,
`@keyframes arrowBounce`, off con `prefers-reduced-motion`); aparece con
fade junto a la tarjeta. Ya NO
es un popup de MapLibre, así el autopan nunca descentra la cámara (ese
bug dejaba el marcador pegado al borde izquierdo). El mapa es 100% NO
interactivo para el usuario
(2026-07-20): `dragPan`, `scrollZoom`, `boxZoom`, `dragRotate`,
`doubleClickZoom`, `touchZoomRotate`, `touchPitch`, `pitchWithRotate` y
`keyboard` todos en `false`; solo corre la animación automática de
entrada.
Responsive (2026-07-20): `.operate` y `.values` tienen padding lateral
propio (24px base; 30px en ≤720px) — antes su shorthand `padding: X 0`
anulaba el padding lateral del `.container` y el mapa y las tarjetas
quedaban pegados a los bordes en pantallas < ~1228px. Mismo fix en la
página de producto: `.product-detail` (base y su regla ≤860px),
`.components`, `.product-gallery` y `.testimonials` (24px; 30px en
≤720px). Además en ≤720px: `.operate-map` pasa a `aspect-ratio: 4/5`
(más alto, para que la tarjeta de dirección no tape la flecha de la
tienda). El `.coverage-legend` se mantiene también en móvil (el dueño
pidió conservarlo tras probar ocultarlo).
Cuadro `.coverage-legend` como HTML estático posicionado absolute en la
esquina inferior izquierda (lista solo Alabama). `fitBounds` inicial al
estado (2026-07-20; se retiró del mapa la zona de South Florida, aunque la
tarjeta de texto al lado la sigue mencionando). OJO: MapLibre usa
`[lng, lat]` (al revés que Leaflet). Atribución Carto/OSM DESACTIVADA
(`attributionControl: false`) a petición del dueño (2026-07-20) — OJO: la
licencia de OSM/Carto pide crédito; si hace falta, ponerlo en el footer.
Animación (2026-07-20): al entrar el mapa en pantalla (IntersectionObserver,
threshold .4), espera 1.2 s y hace `flyTo` 3D (4.5 s, zoom 16, pitch 55,
bearing -20) hasta la tienda — 3659 Lorna Rd geocodificada a
`[-86.7996, 33.3809]` vía Nominatim (antes el pin estaba ~2.5 km al norte)
— y abre el popup al llegar. Con `prefers-reduced-motion` usa `jumpTo`.
Footer con datos de la tienda.

### `productos.html` — catálogo (misma hoja oscura)
Hoy el catálogo tiene **1 solo producto** hardcodeado: MacBook Air 13"
(desde $150 hasta $250 según condición, `data-cat="macos"`, link a
`/macbook-air-13`). Filtros con píldora animada (`site.js`, genéricos por
`data-cat`): Todos / MacOS / **Windows** / Tablet / iPhone — la categoría
"Windows" reemplazó a "iOS" el 2026-07-20; las categorías sin productos
simplemente muestran el grid vacío. Cada tarjeta lleva a
`/solicitud-servicio`.

### `macbook-air-13.html` — página del producto (misma hoja oscura)
Detalle (foto + info + precio), sección "Componentes" con 4 tarjetas
(Processor i5 / Memory 8GB / Storage 256GB / Graphics HD 6000), cada una
con icono SVG propio en caja redondeada (`.component-icon`, 2026-07-20) y
entrada escalonada (`transition-delay` por `:nth-child` sobre el reveal
individual de cada tarjeta; el hover resetea el delay). Galería de 2
fotos, carrusel de reseñas (marquee infinito) y CTA de cita.
En las acciones del producto: botón "Agendar visita" + **"Agregar al
carrito"** (`#addToCart` con `data-id/name/desc/price/cond/img`; reemplazó al
botón "Llamar" el 2026-07-20 — el "Llamar" del banner CTA sigue).
Selector de condición (2026-07-20): 3 opciones **Bueno $150 / Muy bueno
$200 / Excelente $250** (`.condition-option`, radio group) — al elegir,
el precio grande (`#priceAmount`) y la nota (`#priceNote`) se actualizan
y el item del carrito guarda `cond` (id `macbook-air-13-<cond>`: cada
condición es una línea separada del carrito, con badge dorado
`.cart-item-cond` en la página del carrito).
Animación coreografiada al agregar (WAAPI, `flyToCart` en cart.js): el
botón se morfa a un círculo y la bolsa SE DIBUJA trazo a trazo
(stroke-dash draw-on: cuerpo → línea media → asa, ~500/150/230 ms), la
foto del producto cae dentro (rebote de la bolsa al recibir), un clon de
la bolsa vuela en arco hasta el icono del carrito del nav y ahí el icono
da un golpe + sube el contador (el item se guarda al LLEGAR, no al hacer
clic; total ~2.6 s). Al terminar, el botón VUELVE con animación fluida
(`restoreBtn`: la bolsa se retira con el botón aún oculto — evita el
flash de bolsa visible — y el botón se expande desde opacidad 0 a su
forma original con resorte suave `cubic-bezier(.3,1.25,.4,1)` y la
etiqueta aparece al final, ~530 ms). Si el icono no es visible (menú
móvil cerrado) la bolsa sale con fade local; con
`prefers-reduced-motion` se agrega directo sin animación.

### `carrito.html` — carrito de compras (2026-07-20, SIN backend)
- `assets/cart.js` (IIFE): store en `localStorage['est_cart']`
  (`[{id,name,desc,price,img,qty}]`), inyecta enlace Carrito + contador
  dorado `.nav-cart-count` en `.nav-links` (antes de `.nav-cta`; visible
  en index/productos/macbook/carrito — `solicitud-servicio` no usa ese
  nav). Se carga ANTES de `site.js` en esas páginas para que la píldora
  del nav lo incluya. En móvil el enlace muestra la etiqueta "Carrito".
- Página: grid items + resumen sticky; cada item con foto, specs, stepper
  de cantidad (−/+), total por línea y quitar; subtotal/total; CTA
  "Agendar visita" → `/solicitud-servicio` (no hay pago en línea: la
  compra se cierra en tienda). Estado vacío con icono y link a productos.
  Precio guardado: $150 ("desde"; nota de precio final según condición).
  Impuestos: `TAX_RATE = 0.10` en cart.js — el resumen muestra Subtotal,
  Impuestos (10%), Recogida gratis y Total (subtotal + tax); `money()`
  formatea con 2 decimales solo cuando hacen falta.
  Entrada fluida (2026-07-20): items en cascada (90 ms entre cada uno,
  `@keyframes cartIn`) y resumen con retraso, SOLO en la primera carga —
  los re-renders por cantidad/quitar no reaniman.
- Ruta limpia `/carrito` en `server/index.js` y `carrito.html` incluido
  en `copy-frontend.js`.

### `solicitud-servicio.html` — reserva de cita (TEMA OSCURO, CSS inline propio)
Wizard de 3 pasos: (1) calendario mensual, (2) slots, (3) formulario.

- **Tema visual (2026-07-18/19):** fondo negro con la misma imagen de seda que
  la home (`assets/img/background-auth.webp`) aplicada en `body::before` y
  overlay oscuro fijo de 280px en `body::after` para la zona del header. En
  móvil (≤720px) la posición del fondo se desplaza a `85% 20%`, igual que en
  `site-v3.css`, para mostrar la zona iluminada de la seda. Card principal con
  glassmorphism (`backdrop-filter: blur(22px) saturate(1.5)`), bordes sutiles y
  tipografía blanca.
- **Calendario:** máx. 3 meses adelante, domingos deshabilitados. **El día
  actual ES reservable desde 2026-07-20, con 1 hora de anticipación**
  (regla del dueño: a las 10:00 ya no se puede 10:00, sí 11:00). Hoy solo
  se deshabilita cuando ya no queda ningún slot con esa anticipación
  (`todaySinTiempo` en `renderCalendar`). "Hoy" se calcula en la TZ del
  negocio con `businessNow()` (Intl, America/Chicago) tanto en frontend
  como en Express. Al cargar y al cambiar de mes se
  **auto-selecciona el primer día disponible** (`autoSelectFirstAvailable()`),
  selector `.cal-cell.available:not(.disabled)` (puede ser hoy). Además
  `selectDate()` valida nuevamente que la fecha no sea pasada o domingo
  antes de guardarla como seleccionada, y `renderCalendar()` solo aplica
  la clase `.selected` sobre celdas `.available`.
- **Estilo del día actual (2026-07-19):** se reemplazó el borde blanco interior
  (`box-shadow`) que lo hacía parecer seleccionado por un pequeño punto sutil
  (`::after`), para que no compita visualmente con el día realmente
  seleccionado.
- **Horarios:** grid de **3 columnas iguales** (`slots-grid` en `:157`),
  botones de alto fijo 54px para evitar tamaños desiguales. Slots 10:00 a.m. –
  3:00 p.m. cada 30 min (viene del backend Express).
- **Formulario:** nombre*, teléfono* (autoformato `(205) 555-1234`), correo
  opcional, servicio* (tarjetas: Consulta / Mantenimiento / Reparacion — sin
  tilde en el valor), honeypot `bot-field`, 2 checkboxes obligatorios: términos y
  consentimiento SMS (texto TCPA: STOP/HELP, hasta 3 msg por cita).
- **Footer completo** añadido el 2026-07-18 con logo, links legales y datos de
  la tienda.
- POST a `/api/appointments`. Pantalla de éxito con **factura unificada**
  (2026-07-20): UN solo documento con encabezado (logo + ElectronicST +
  número `#EST-<fecha>-<hora>`, SIN la palabra "Factura"), filas de Fecha /
  Hora / Servicio, "Tu información" (nombre, teléfono clicable, correo),
  líneas de items (en pickup: productos con precio, subtotal, impuestos 10%
  y total; en servicios: "Por confirmar"), la información de la tienda
  (dirección con link a mapas y teléfono) y borde troquelado de recibo.
  Se eliminaron las tarjetas separadas de calendario, reloj digital,
  servicio, carnet y el bloque `.store-info`. Para que la factura de
  pickup tenga los items, el carrito se vacía DESPUÉS de `showSuccess`.
  Si el error contiene "ocupado", recarga los slots.
- **Modo pickup** (2026-07-20, `?pickup=1` desde el carrito): si hay items en
  `localStorage['est_cart']`, muestra el resumen del pedido en el formulario
  (foto, condición, cantidad, subtotal, impuestos 10% y total, `.pickup-box`),
  deja solo la tarjeta de servicio "Pickup" preseleccionada y envía el campo
  `servicio` compuesto: `Pickup: <nombre> (<cond>) x<qty> $<linea>; ... |
  Total: $<con tax>` (así el admin y el SMS ven el pedido completo). Al
  confirmar con éxito, VACÍA el carrito. Sin `?pickup=1` o sin items, la
  página funciona igual que antes (la tarjeta Pickup queda oculta).

### ~~`admin.html`~~ — panel de citas (**ELIMINADO 2026-07-24**)
El panel viejo de citas (login con contraseña única → `POST /api/auth/login`)
se eliminó por completo: la gestión de citas ya vive en el back-office nuevo
(`/api/admin/app/<slug>`, sección Citas, que usa `/api/appointments` con el JWT
del panel). Se borró `admin.html` (raíz y `server/public/`), la ruta `/admin`
de `htmlRoutes` en `server/index.js`, su entrada en `copy-frontend.js` y el
enlace "Login / Register" del menú móvil en `assets/site.js` (y su copia en
`server/public/assets/site.js`). OJO: el endpoint `POST /api/auth/login`
(authRouter) sigue montado en `server/index.js` aunque ya no tiene frontend;
`GET/PATCH/DELETE /api/appointments` se siguen usando (panel nuevo + bots).

### `terminos.html` / `politicas.html` — legales (tema claro, CSS inline duplicado)
Incluyen sección SMS (`/terminos#sms`) y política de NO devoluciones/reembolsos
(solo garantía del fabricante). Fechadas "18 de julio de 2026".

### Assets JS
- **Rutas/URLs en INGLÉS desde 2026-07-20** (petición del dueño):
  `/products`, `/book-appointment`, `/cart`, `/terms`, `/privacy`
  (`/macbook-air-13`, `/admin` y `/` ya estaban en inglés). Las rutas
  antiguas en español (`/productos`, `/solicitud-servicio`, `/carrito`,
  `/terminos`, `/politicas`) siguen vivas como **redirect 301** en
  `server/index.js` (el QR impreso de citas sigue funcionando). Todos los
  enlaces internos actualizados. El TEXTO del menú quedó en español
  (una traducción anterior a "Home/Products" fue revertida el mismo día).
- `assets/img/logo-cruise.png`: logo con fondo transparente (410×193 tras
  recortar con `sharp.trim()`, letras EST blancas + icono dorado). Se usa
  arriba del título "¿Tu equipo necesita reparación?" en `.cta-copy` de
  `index.html` a 320px de ancho en PC y 190px en móvil, centrado (clase
  `.cta-logo`), con 48px de separación del título debajo (34px en móvil). También
  se usa en el footer de las páginas oscuras (`index.html`, `productos.html`).
  El nav de esas páginas usa el nuevo `logo-cruise.png` tanto en PC
  (25px de alto, `.logo-desktop`) como en móvil (28px de alto,
  `.logo-mobile`). El archivo `logo.jpg` sigue usándose en
  `solicitud-servicio.html`, `terminos.html` y `politicas.html` (y en el
  back-office nuevo, `admin-app/public/img/logo.jpg`). Enlaces `.map-link` abren Apple Maps en iOS/iPadOS y Google
  Maps en el resto.
- `assets/site.js` (IIFE ES5): nav (cápsula flotante con estado `.scrolled`,
  píldora deslizante `.nav-pill` que sigue al hover y descansa en el activo,
  menú móvil a pantalla completa con entrada escalonada vía `--d`, contacto
  inyectado `.nav-meta` con teléfono y dirección como `.map-link`
  (el enlace "Login / Register" → `/admin` se quitó el 2026-07-24 al
  eliminar el panel viejo), cierre con
  ESC y scroll-lock del body), reveals por IntersectionObserver, parallax/fade
  del hero, filtros del catálogo, y listeners `.map-link` que abren Apple Maps
  en iOS/iPadOS y Google Maps en otros. Respeta `prefers-reduced-motion`. OJO:
  todo vive en un mismo IIFE — no redeclarar `pill`/`movePill` (son de los
  filtros); lo del nav usa prefijo `nav*`.
- `assets/transitions.js`: se carga en TODAS las páginas. Fade de entrada/salida
  entre páginas internas, prefetch al hover, ripple en `.btn`,
  `@view-transition`, fix bfcache.
- `assets/site-v3.css`: sistema de diseño oscuro (tokens: `--black #000`,
  `--panel #0c0c0f`, radio 999px en botones). Tema MONOCROMO blanco/negro desde
  2026-07-18: se eliminaron los tokens azules (`--blue`, `--blue-h`, `--link`);
  `.btn-blue` ahora es botón blanco con texto negro puro `#000`,
  y todos los acentos (eyebrow, iconos, link-arrow, marquee, badge `.new`,
  glows de capítulos) usan blancos/grises. No reintroducir color sin pedirlo.
  Tarjetas `.value` (2026-07-19): fondo de vidrio translúcido con blur, borde
  sutil, icono envuelto en `.value-icon` con caja redondeada, campo de puntos
  radial centrado (máscara para que no llegue de lado a lado) y elevación +
  brillo en hover. Grid `.values-grid` con `max-width: 960px` y centrada para
  que no ocupe todo el ancho en pantallas grandes.
  Fondo de seda (2026-07-18): imagen real descargada del sitio de Resend,
  guardada como `assets/img/background-auth.webp`. Servida fija vía
  `body::before` (z-index -1) con `center / cover no-repeat`. En escritorio
  se muestra centrada; en móvil (≤720px) se desplaza a `85% 20%` para mostrar
  la zona iluminada de la seda y evitar que se vea solo el centro negro.
  **Este mismo fondo se replica ahora en `solicitud-servicio.html`**
  (`solicitud-servicio.html:60-67`), unificando la experiencia visual entre
  la home y el flujo de citas.
  Overlay superior (2026-07-19): `body::after` con un degradado negro fijo
  de 280px de alto sobre el fondo de seda (`#000 0%, #000 30%, ...`), para
  oscurecer la zona que queda detrás del menú translúcido. Hero con negro
  sólido solo en el top 8%, gradiente muy suave (`rgba(0,0,0,.42)` →
  `.32`) e imagen de la laptop a opacidad `1`, para que la foto se note
  mucho más.
  Sustituye a las imágenes generadas previamente (`bg-silk.jpg` /
  `bg-silk-m.jpg`), que fueron eliminadas junto con `tools/generar_fondo_seda.py`.
  Footer (2026-07-18): fondo semitransparente (`rgba(0,0,0,.25)`) con
  `backdrop-filter: blur(14px)` para que la seda se extienda borrosa hasta el
  final de la página.
  Nav (2026-07-18): cápsula flotante sticky — `.nav` es wrapper con
  `pointer-events:none`; el fondo/blur va en `.nav-inner::before` (si se pone en
  `.nav-inner`, el menú móvil `fixed` dejaría de ser relativo al viewport).
  Capas: brand/burger z2 > `.nav-links` z1 > fondo cápsula z0. `.brand` tiene
  `gap: 5px` para que el texto quede pegado al logo. Hero usa
  `calc(100svh - 70px)` porque la cápsula ocupa 70px en flujo.
  Fondo de la cápsula oscurecido (2026-07-19): doble capa en
  `.nav-inner::before` — un gradiente negro encima tipo overlay de hero
  (`rgba(0,0,0,.78)` → `.45` → `.15`) sobre el fondo oscuro de la cápsula
  (`rgba(6,6,8,.88)`), y versión scrolled (`rgba(0,0,0,.55)` → `.15` sobre
  `rgba(4,4,6,.96)`). Así el header tiene un overlay oscuro similar al del
  hero. Hero ajustado a un gradiente más suave (`rgba(0,0,0,.88)` → `.75`
  → `.2` → `.5` → `#000`) que se extiende un 30% por encima del hero;
  imagen de la laptop a opacidad `.9`.

### ⚠️ Sistemas de diseño coexisten
- Oscuro cinematográfico: `index.html`, `productos.html` y ahora
  `solicitud-servicio.html`.
- Claro "slate": `terminos.html`, `politicas.html` — cada uno con
  su propio `<style>` inline que duplica los mismos tokens (`--bg #f8fafc`,
  `--accent #111827`, mismos keyframes…). Cambiar algo del tema claro implica
  editar 2 archivos.
- `solicitud-servicio.html` sigue teniendo todo su CSS inline (no usa
  `site-v3.css`), por lo que aunque visualmente coincide con la home, los
  cambios de estilo deben mantenerse en dos lugares: `site-v3.css` y el
  `<style>` de `solicitud-servicio.html`.

## 4. Backend Express (`server/`) — el vivo

- `index.js`: CORS (`CORS_ORIGIN`, default `*`), JSON, `/api/health`, monta
  routers, manejador 500, `initDb()` antes de `listen`.
- `db.js`: `pg.Pool` con `DATABASE_URL` (SSL laxo en producción). Tabla
  `appointments(id SERIAL, nombre, telefono, correo, direccion, servicio, fecha
  DATE, hora TIME, estado DEFAULT 'pendiente', created_at, UNIQUE(fecha, hora))`
  + índice por fecha. Se crea sola al arrancar.
- `routes/slots.js` GET: valida fecha y devuelve `{abierto:true, date, slots}`
  solo con slots LIBRES (`{hora, disponible:true}`); ocupado = existe cita con
  estado != 'cancelada'. Desde 2026-07-20 filtra además los slots de HOY con
  menos de 1 h de anticipación (`isSlotBookable`).
- `routes/appointments.js`:
  - POST público: valida campos + fecha + hora; INSERT con
    `ON CONFLICT (fecha,hora) DO NOTHING` → 409 "Este horario ya está ocupado…";
    dispara SMS (no bloqueantes) y responde 201.
  - GET (auth): lista todas o `?date=YYYY-MM-DD`, orden fecha/hora DESC.
  - PATCH (auth): cambia estado por (fecha,hora); estados válidos: pendiente,
    confirmada, atendida, cancelada.
  - DELETE (auth): borra TODAS las citas.
- `routes/auth.js` POST /login: rate limit en memoria por IP (5 intentos / 15
  min, limpieza cada 60s), compara contra `ADMIN_PASSWORD`, emite JWT
  `{role:'admin'}` 8h con `JWT_SECRET`. Responde `remainingAttempts`.
- `utils.js`: slots 10:00–15:00 cada 30 min **incluyendo 15:00** (11 slots,
  `m <= totalMinutes`), validaciones de fecha (formato, no pasada, no domingo),
  middleware `requireAuth` (JWT, role admin). Desde 2026-07-20: `businessNow()`
  (fecha+minutos en America/Chicago vía Intl), `isSlotBookable(fecha, hora)`
  (mismo día exige `LEAD_MINUTES=60` de anticipación) y `isPastDate` usa la
  fecha del negocio, no la UTC del servidor. El POST de citas también valida
  `isSlotBookable` (no se puede saltar la regla con un POST directo).
- `validation.js`: solo campos obligatorios (nombre, telefono, servicio, fecha,
  hora). NO valida formato de teléfono ni que la hora de hoy ya haya pasado.
- `notifications.js`: notificaciones al crear cita (3 canales, no bloqueantes):
  SMS Twilio al dueño (`OWNER_PHONE`), **WhatsApp al dueño vía CallMeBot**
  (`sendOwnerWhatsAppNotification`, 2026-07-20 — mismo texto con *negritas*,
  GET `api.callmebot.com/whatsapp.php?phone/text/apikey`; requiere que el
  número destino haya activado el bot de CallMeBot alguna vez) y SMS de
  confirmación al cliente con dirección, STOP/HELP. `toE164` asume EE.UU. (+1).
  Si faltan credenciales, solo loguea y sigue.
  **Diagnóstico 2026-07-20:** las 4 vars Twilio están en Railway y las
  credenciales son VÁLIDAS (cuenta + número `+12052094654` verificados vía
  API), pero un SMS de prueba al dueño fue BLOQUEADO con **error 30034 (A2P
  10DLC)** — las operadoras de EE.UU. exigen registrar marca+campaña A2P
  para entregar SMS desde números locales. Mientras tanto el canal que SÍ
  llega es WhatsApp (prueba real encolada y aceptada el mismo día).
- `config.js`: env vars. Default inseguro `ADMIN_PASSWORD='admin123'`;
  `JWT_SECRET` obligatorio en producción (sale con error si falta);
  `CALLMEBOT_API_KEY` y `OWNER_PHONE` presentes pero **CallMeBot ya no se usa**
  (residuo de una integración anterior a Twilio).

## 5. Backend Netlify (`netlify/functions/`) — legado/paralelo

- Storage: Netlify Blobs, store `appointments`, llave `fecha/hora`.
- `_lib/config.mjs`: timezone `America/Chicago`, openDays [1..6], 10:00–15:00,
  slotMinutes 30, y una lista de 14 servicios (incluye Consulta, Mantenimiento,
  Reparacion y otros como Factura, Pedido…).
- `slots.mjs`: devuelve TODOS los slots con flag `disponible` + `abierto`;
  filtra horas pasadas de hoy usando la TZ del negocio.
- `appointments-create.mjs`: honeypot, validación con regex de teléfono US,
  servicio contra lista, 409 si ocupado (cancelada libera el slot).
- `appointments-list.mjs` / `appointments-update.mjs`: auth por header
  `Bearer <ADMIN_TOKEN>` estático (`_lib/auth.mjs`). Sin login, sin JWT,
  sin rate limit, sin SMS, sin DELETE-all.
- `@netlify/blobs` NO está declarado en ningún package.json (raíz está vacío).

## 6. Divergencias Express vs Netlify (mismo frontend, dos lógicas)

| Aspecto | Express (Railway, vivo) | Netlify Functions (legado) |
|---|---|---|
| Último slot | **15:00** incluido (11 slots) | 14:30 (10 slots, excluye cierre) |
| "Hoy/pasado" | Hora local del servidor (Railway = UTC) | America/Chicago correcto |
| Hora pasada hoy | NO se bloquea (se puede reservar en el pasado de hoy) | Sí se bloquea |
| Slots response | solo libres | todos con `disponible` + `abierto` |
| Servicios | cualquier string | lista cerrada de 14 |
| Teléfono | sin formato | regex US |
| Auth admin | JWT 8h + rate limit | token estático |
| SMS | Twilio (dueño + cliente) | ninguno |
| DB | Postgres | Blobs |

El frontend funciona con ambos (usa `data.abierto` y filtra `s.disponible`;
los mensajes de "ocupado" coinciden), pero solo Express tiene `/api/auth/login`.

## 7. Variables de entorno

`server/.env.example`: `DATABASE_URL`, `ADMIN_PASSWORD`, `CORS_ORIGIN=*`,
`PORT=3000`, `CALLMEBOT_API_KEY=1367816` (¡parece una key real commiteada!),
`OWNER_PHONE=12055737840`, `TWILIO_ACCOUNT_SID/AUTH_TOKEN/SMS_FROM`.
`.gitignore` cubre `.env` y `node_modules` en ambos niveles.

## 8. Hallazgos de auditoría (candidatos a mejora)

1. **Doble backend y doble hosting config** (§2, §6): mantener dos lógicas
   divergentes es riesgo; hay que decidir una y borrar/congelar la otra.
2. **~~Bug de zona horaria en Express~~** (RESUELTO 2026-07-20): "hoy" se
   calculaba en la TZ del servidor (UTC en Railway) y se podía reservar una
   hora de hoy ya pasada. Ahora `businessNow()` usa America/Chicago en
   `isPastDate` y en la regla de 1 h de anticipación (`isSlotBookable`),
   tanto en slots GET como en el POST. El frontend usa la misma TZ.
   OJO: el Netlify legacy (`slots.mjs`) sigue con su propia lógica vieja.
3. **Slot de cierre reservable:** Express permite reservar 15:00, la hora exacta
   de cierre (`server/utils.js:11`). Netlify no. Inconsistente con el horario
   publicado.
4. **Sin límite de anticipación en servidor:** el tope de 3 meses es solo
   client-side; POST directo acepta cualquier fecha futura.
5. **Campo `direccion` muerto:** existe en la tabla y en el SELECT del admin,
   pero el formulario nunca lo captura ni el INSERT lo guarda.
6. **Citas sin id estable:** PATCH usa (fecha,hora) como identidad; si se
   quisiera editar/reagendar habría que cambiar el modelo.
7. **Credenciales/secretos en repo:** `.env.example` incluye lo que parece una
   API key real de CallMeBot (`1367816`) y el teléfono del dueño; default
   `admin123`. Sin uso actual de CallMeBot → limpiar.
8. **Duplicación de CSS/tokens** en las 4 páginas claras (§3) y datos del
   negocio repetidos en 5+ lugares (§1): cualquier cambio de horario/teléfono
   exige tocar muchos archivos.
9. **Imagen pesada:** `assets/img/iphone-chapter.jpg` pesa ~613 KB (las demás
   27–165 KB). No hay optimización ni formatos modernos (webp/avif).
10. **Sin metraje SEO/social completo:** solo `description` en index/productos;
    sin Open Graph, sin favicon declarado, sin sitemap/robots (admin sí tiene
    `noindex`).
11. **Sin tests ni lint ni CI** en ninguna parte del repo.
12. **CORS `*` por defecto** y sin cabeceras de seguridad (CSP, etc.).
13. Detalles menores: `@netlify/blobs` sin declarar; `slots.js` de Express
    siempre responde `abierto:true`; teléfono del SMS del dueño sin formato.

## 9. Estado del repo y despliegue

- Rama `master`, working tree limpio.
- **A partir del 2026-07-19 el sitio completo se sirve desde Railway.** El
  backend Express en `schedule-system-est-production.up.railway.app` entrega
  el frontend estático desde `server/public/` y las APIs desde `/api/*`.
- Últimos commits relevantes:
  - `90bbdc3` — build script defensivo para `server/public/`.
  - `943a47d` — inclusión de `server/public/` en el repo para Railway.
  - `ac248bb` — iconos SVG en tarjetas de servicio.
  - `293686e` — fondo de citas ajustado en móvil.
  - `0bd0eb4` — Express sirve frontend completo.
- Vercel se retiró del stack (2026-07-22): `vercel.json` eliminado y Railway
  sirve frontend + API + bots. Falta mover el DNS del dominio a Railway.
- URL de producción:
  `https://schedule-system-est-production.up.railway.app`.

## 10. Preguntas abiertas para el dueño del proyecto

- ¿Retiramos también `netlify/functions/` y `netlify.toml` (ya obsoletos)?
- ¿El horario real es hasta las 3:00 p.m. (última cita 2:30) o se atiende a
  las 3:00?
- ¿Se quiere unificar el tema visual (todo oscuro estilo Apple o todo claro)?
- ¿~~Twilio está activo en producción o los SMS solo se loguean?~~ RESUELTO
  (2026-07-20): credenciales válidas y configuradas, pero los SMS se bloquean
  por falta de registro **A2P 10DLC** (error 30034). Falta registrar marca y
  campaña en Twilio Console para que entreguen.
