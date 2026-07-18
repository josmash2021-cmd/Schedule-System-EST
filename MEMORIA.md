# MEMORIA DEL PROYECTO — Schedule-System-EST (ElectronicST)

> Auditoría creada el 2026-07-18. Memoria de trabajo NO genérica: describe lo que
> existe HOY en el código, con ubicaciones exactas. Actualizarla cuando cambie
> estructura, flujos o configuración.

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

- **Frontend:** HTML/CSS/JS estático, sin build (`build` = `echo`). Fuente Inter
  (Google Fonts). Sin frameworks, sin bundler, sin tests, sin CI.
- **Backend activo (producción):** Express + PostgreSQL (Railway), según
  `vercel.json`: todo `/api/*` se reescribe a
  `https://schedule-system-est-production.up.railway.app/api/:path*`.
  El frontend siempre llama rutas relativas `/api/...`.
- **Segundo backend paralelo:** `netlify/functions/` (Netlify Blobs como DB).
  `netlify.toml` publica el estático y declara las functions, PERO no hay
  redirects de `/api/*` hacia `/.netlify/functions/*`, así que en Netlify el
  frontend no alcanzaría la API. Además no existe endpoint de login ahí.
  → **Conclusión: Vercel + Railway es el stack vivo; `netlify/functions/` es
  código legado/alternativo con divergencias de lógica (ver §6).**
- Hay dos configs de hosting (`vercel.json` y `netlify.toml`) y dos `package.json`
  (raíz vacía; `server/` con express, pg, jsonwebtoken, twilio, cors, dotenv).
- `qr-cita.png` (raíz): QR de citas. Regenerado el 2026-07-18 para apuntar a
  `https://electronic-service-tech.vercel.app/solicitud-servicio` (antes apuntaba
  a la URL vieja de Netlify `dynamic-tartufo-b1810a.netlify.app`; ojo si hay
  material impreso con el QR anterior). Se muestra en el panel CTA de
  index/productos.

## 3. Mapa del frontend

### `index.html` — landing oscura estilo Apple (usa `assets/site.css`)
Hero a pantalla completa con parallax (`data-parallax="0.28"`), entrada
escalonada (`.h-in-1..4`), marquee infinito, 2 "capítulos" (MacBook desde
$1,099 / iPhone desde $799) con glow de color, 4 valores, y panel de reserva
final (`.cta-banner`): campo de puntos + luz blanca animada que deriva lenta
(`@keyframes ctaLight` en `::before`, puntos en `::after`), copy con 3 puntos
con iconos, y `.cta-card` de vidrio con botones + QR de citas (`qr-cita.png`).
Footer con datos de la tienda.

### `productos.html` — catálogo (misma hoja oscura)
8 productos hardcodeados con foto, specs y precio "desde":
MacBook Air 13" $1,099 · Air 15" $1,299 · Pro 14" $1,999 · Pro 16" $2,999 ·
iPhone 16 $799 · 16 Plus $899 · 16 Pro $999 · 16 Pro Max $1,199.
Filtros Todos/Air/Pro/iPhone con píldora animada (`site.js`). Cada tarjeta lleva
a `/solicitud-servicio`.

### `solicitud-servicio.html` — reserva de cita (TEMA CLARO, CSS inline propio)
Wizard de 3 pasos: (1) calendario mensual (máx. 3 meses adelante, domingos y
pasados deshabilitados, todo client-side), (2) slots desde `GET /api/slots?date=`,
(3) formulario: nombre*, teléfono* (autoformato `(205) 555-1234`), correo
opcional, servicio* (tarjetas: Consulta / Mantenimiento / Reparacion — sin tilde
en el valor), honeypot `bot-field`, 2 checkboxes obligatorios: términos y
consentimiento SMS (texto TCPA: STOP/HELP, hasta 3 msg por cita).
POST a `/api/appointments`. Pantalla de éxito con detalle y link a mapa
(Apple Maps en iOS, Google Maps en el resto). Si el error contiene "ocupado",
recarga los slots.

### `admin.html` — panel de citas (tema claro, `noindex`)
Login por contraseña → `POST /api/auth/login` → JWT guardado en
`sessionStorage['est_admin_token']` (8h). Muestra errores con intentos restantes
y bloqueo 429. Stats por estado, filtro por fecha, lista de tarjetas.
Acciones según estado: pendiente→Confirmar/Cancelar, confirmada→Atendida/Cancelar,
cancelada→Reabrir. Botón "Eliminar todas" (DELETE con confirmación).
**Las citas se identifican por (fecha, hora), no por id** — las acciones PATCH
mandan `fecha`+`hora`.

### `terminos.html` / `politicas.html` — legales (tema claro, CSS inline duplicado)
Incluyen sección SMS (`/terminos#sms`) y política de NO devoluciones/reembolsos
(solo garantía del fabricante). Fechadas "18 de julio de 2026".

### Assets JS
- `logo.jpg`: imagen con fondo negro propio. Desde 2026-07-18 está recortada al
  contenido (1040×640, letras EST + icono dorado) y se muestra SIN la tarjeta
  blanca que antes la enmarcaba: `height` fijo con `width:auto` en todas las
  páginas (nav/footer 44px vía `site.css`, solicitud 72px, admin 52/88px,
  legales 44px); radius sutil solo en las páginas claras, donde el fondo negro
  del logo se ve como placa. No volver a poner `background`/`padding` al img.
- `assets/site.js` (IIFE ES5): nav (cápsula flotante con estado `.scrolled`,
  píldora deslizante `.nav-pill` que sigue al hover y descansa en el activo,
  menú móvil a pantalla completa con entrada escalonada vía `--d`, contacto
  inyectado `.nav-meta`, cierre con ESC y scroll-lock del body), reveals por
  IntersectionObserver, parallax/fade del hero, filtros del catálogo. Respeta
  `prefers-reduced-motion`. OJO: todo vive en un mismo IIFE — no redeclarar
  `pill`/`movePill` (son de los filtros); lo del nav usa prefijo `nav*`.
- `assets/transitions.js`: se carga en TODAS las páginas. Fade de entrada/salida
  entre páginas internas, prefetch al hover, ripple en `.btn`,
  `@view-transition`, fix bfcache.
- `assets/site.css`: sistema de diseño oscuro (tokens: `--black #000`,
  `--panel #0c0c0f`, radio 999px en botones). Tema MONOCROMO blanco/negro desde
  2026-07-18: se eliminaron los tokens azules (`--blue`, `--blue-h`, `--link`);
  `.btn-blue` ahora es botón blanco con texto negro (idéntico a `.btn-light`),
  y todos los acentos (eyebrow, iconos, link-arrow, marquee, badge `.new`,
  glows de capítulos) usan blancos/grises. No reintroducir color sin pedirlo.
  Fondo de seda (2026-07-18): imagen real descargada del sitio de Resend,
  guardada como `assets/img/background-auth.webp`. Servida fija vía
  `body::before` (z-index -1) con `center / cover no-repeat`. Sustituye a
  las imágenes generadas previamente (`bg-silk.jpg` / `bg-silk-m.jpg`).
  Nav (2026-07-18): cápsula flotante sticky — `.nav` es wrapper con
  `pointer-events:none`; el fondo/blur va en `.nav-inner::before` (si se pone en
  `.nav-inner`, el menú móvil `fixed` dejaría de ser relativo al viewport).
  Capas: brand/burger z2 > `.nav-links` z1 > fondo cápsula z0. Hero usa
  `calc(100svh - 70px)` porque la cápsula ocupa 70px en flujo.

### ⚠️ Dos sistemas de diseño coexisten
- Oscuro cinematográfico: `index.html` + `productos.html` (vía `site.css`).
- Claro "slate": `solicitud-servicio.html`, `admin.html`, `terminos.html`,
  `politicas.html` — cada uno con su propio `<style>` inline que duplica los
  mismos tokens (`--bg #f8fafc`, `--accent #111827`, mismos keyframes…).
  Cambiar algo del tema claro implica editar 4 archivos.

## 4. Backend Express (`server/`) — el vivo

- `index.js`: CORS (`CORS_ORIGIN`, default `*`), JSON, `/api/health`, monta
  routers, manejador 500, `initDb()` antes de `listen`.
- `db.js`: `pg.Pool` con `DATABASE_URL` (SSL laxo en producción). Tabla
  `appointments(id SERIAL, nombre, telefono, correo, direccion, servicio, fecha
  DATE, hora TIME, estado DEFAULT 'pendiente', created_at, UNIQUE(fecha, hora))`
  + índice por fecha. Se crea sola al arrancar.
- `routes/slots.js` GET: valida fecha y devuelve `{abierto:true, date, slots}`
  solo con slots LIBRES (`{hora, disponible:true}`); ocupado = existe cita con
  estado != 'cancelada'.
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
  middleware `requireAuth` (JWT, role admin).
- `validation.js`: solo campos obligatorios (nombre, telefono, servicio, fecha,
  hora). NO valida formato de teléfono ni que la hora de hoy ya haya pasado.
- `notifications.js`: Twilio SMS. Al crear cita: SMS al dueño (`OWNER_PHONE`)
  con los datos + SMS de confirmación al cliente con dirección, STOP/HELP.
  `toE164` asume EE.UU. (+1). Si faltan credenciales, solo loguea y sigue.
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
2. **Bug de zona horaria en Express:** "hoy" se calcula en la TZ del servidor
   (UTC en Railway), no en America/Chicago → cerca de medianoche el calendario
   del servidor y el del cliente discrepan; y se puede reservar una hora de hoy
   que ya pasó (`server/utils.js:27-38`, `routes/appointments.js`).
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

## 9. Estado del repo

- Rama con historial de ~10 commits; los 2 más recientes son el rediseño oscuro
  Apple-style (`eb04a69`, `a2dca36`). Working tree limpio al auditar.

## 10. Preguntas abiertas para el dueño del proyecto

- ¿Confirmamos Vercel+Railway como único stack y retiramos `netlify/functions/`
  y `netlify.toml` (o al revés)?
- ¿El horario real es hasta las 3:00 p.m. (última cita 2:30) o se atiende a
  las 3:00?
- ¿Se quiere unificar el tema visual (todo oscuro estilo Apple o todo claro)?
- ¿Twilio está activo en producción o los SMS solo se loguean?
