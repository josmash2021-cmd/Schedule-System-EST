# ElectronicST — Mapa del proyecto (Schedule-System-EST)

Tienda Apple + servicio técnico en Hoover, AL. Sitio 100% en español (rutas en
inglés). Este archivo es el mapa rápido: **lee aquí primero, no explores el
repo para ubicar cosas**. Para detalle profundo (historial de decisiones,
bugs resueltos, advertencias) consulta `MEMORIA.md` — y actualízalo cuando
cambies estructura, flujos o convenciones.

## Arquitectura y despliegue

- **Sitio público:** HTML/CSS/JS estático en la raíz, sin bundler ni framework.
- **Panel de gestión (back-office):** React 18 + Vite en `admin-app/`.
- **Backend:** Express + PostgreSQL en `server/` → despliega en **Railway**.
- **Vercel** sirve el frontend estático (dominio `electronicservicetechnology.com`)
  y proxifica `/api/*` y `/x/*` → Railway (`vercel.json`).
- `netlify/` y `netlify.toml` son **legado inactivo**: no tocar salvo limpieza.
- Rama de trabajo: `master`.

## Mapa de ubicaciones exactas

### Sitio público (raíz)
- Páginas: `index.html`, `products.html`, `macbook-air-13.html`,
  `iphone-15-pro.html`, `book-appointment.html`, `cart.html`, `success.html`,
  `track.html` (seguimiento público del pedido del cliente: `?t=<track_token>`,
  consulta `/api/track/:token` cada 30 s y en tiempo real por SSE; **animación de entrada del camión**
  (vista cenital con foto real `assets/img/truck-top.png`, flip horizontal
  para mirar a la derecha: aparece la línea de dashes (sin caja ni fondo,
  directo sobre la página) → el camión entra y frena → aparece la caja
  dorada → se sube atrás y se esconde (z-index bajo la foto) → rebote de
  suspensión → prenden las luces (resplandor difuminado con blur, sin
  formas simétricas) → queda conduciendo en loop; se salta con
  `prefers-reduced-motion`; los datos se revelan al arrancar); **barra de 5
  pasos con puntos en las puntas** (Creating label 0% → Shipped 25% → In
  transit 50% → Out for delivery 75% → Delivered 100%; círculos CENTRADOS
  sobre la línea (el relleno pasa por detrás y cada círculo salta con pop
  cuando la barra lo alcanza — delays escalonados); el paso actual pulsa
  lento y suave; la animación del camión y los datos entran con fundido
  fluido (doble rAF + clase .in, nunca de golpe); un fallo transitorio del
  API nunca muestra "Order not found" si ya hay datos); el título de la
  página es fijo ("Order tracking", sin nombre del producto); **el badge bajo
  el título muestra la fecha estimada de llegada** ("Llega el jue, 8 may" /
  "Arriving Thu, May 8" — de `expected_delivery` de AfterShip; "Entregado" al
  llegar; si no hay fecha, el número de orden como antes) y la página se
  actualiza en tiempo real por SSE (`/api/track/:token/stream`); **layout PC de
  ancho completo (máx. 1240px) en 3 columnas: Rastreo a la izquierda (300px),
  mapa de ruta al centro con la dirección de envío debajo del mapa, y resumen
  del pedido a la derecha (340px)** (el
  mapa es **Mapbox GL JS oscuro** (`dark-v11`, token público `MAPBOX_TOKEN`
  en el propio archivo): geocodifica tienda y destino, dibuja la ruta con la
  Directions API y encuadra el trayecto completo con `fitBounds`
  (padding 70, maxZoom 10); sin dirección o si Mapbox falla se oculta; en ≤980px todo
  cae a una columna: mapa+dirección → resumen → rastreo), **resumen tipo
  recibo** (productos con foto/desc + Subtotal/Tax/
  Shipping FREE-o-cobrado/Total — las líneas Tax/Shipping del JSONB se separan
  por nombre en el JS, textos dinámicos bilingües vía `window.EST_LANG`);
  **página compacta sin scroll en PC** (sin carrusel de productos; paddings y
  mapa reducidos en ≥981px); CSS inline propio — define `.hidden`, que
  `site-v3.css` no tiene;
  enlazada desde el menú principal como "Mi pedido" / `data-en="My order"` en
  todas las páginas — sin token muestra el bloque `#trackNoToken` con
  **formulario de búsqueda por número de rastreo** (`GET
  /api/track/lookup/:number`, mismo payload público), no el error),
  `terms.html`, `privacy.html`.
- JS/CSS compartido: `assets/` (`site.js`, `cart.js`, `site-v3.css`,
  `transitions.js`, `i18n.js`, `security.js`).
- **Tras editar cualquier página/asset del sitio:** `node server/scripts/copy-frontend.js`
  (copia a `server/public/`, que va commiteada para Railway). Si agregas o
  renombras una página, actualiza también `htmlRoutes` en `server/index.js` y
  la lista de `copy-frontend.js`.

### Panel de gestión (`admin-app/`)
- Páginas: `admin-app/src/pages/` — `Dashboard.jsx`, `Workers.jsx`,
  `Tasks.jsx`, `Team.jsx`, `Repairs.jsx`, `Sales.jsx` (Ventas: KPIs
  hoy/semana/mes/año con count-up — "esta semana" solo cuenta los días de la
  semana lun–dom que caen en el mes en curso, cada día pertenece a su propio
  mes —, gráfica por período, tabla detalle, y
  **Resumen por mes**: ventas, ganancia, inversión en inventario e inventario
  al cierre de cada mes — vía `/x/s/inventory/purchases-by-month` y
  `/x/s/inventory/stock-by-month`; la inversión se agrupa por la fecha REAL
  de compra (`inventory_movements.purchased_at`, editable por el admin en la
  ficha del producto con `PATCH /x/s/inventory/movements/:id`; sin ella cuenta
  la fecha de registro — TODAS las entradas cuentan, incluidas las
  retroactivas de stock inicial),
  `Invoices.jsx` (Facturas: Bill of Sale por venta/reparación, formulario +
  documento imprimible con `window.print()`, sin librerías de PDF; datos del
  vendedor recordados en localStorage `est_invoice_seller`; **vista previa en
  vivo** del documento al lado del formulario, layout `.inv-editor`),
  `Orders.jsx` (Órdenes/Envíos: compras del website automáticas vía Stripe +
  órdenes manuales de FB Marketplace; tracking number → estado
  pendiente→enviado→entregado; polling 30 s),
  `Inventory.jsx`, `Appointments.jsx`, `Settings.jsx`,
  `Login.jsx`, `WorkerHome.jsx`/`WorkerApp.jsx` (app móvil del trabajador).
- Componentes: `admin-app/src/components/` (`Layout.jsx`, `FormPage.jsx`,
  `BarChart.jsx` compartido, `RepairDetail.jsx`, `InventoryDetail.jsx`,
  `ChangePasswordForm.jsx`).
  Los formularios van a **página completa centrada** con `FormPage`
  (botón ← Volver + tarjeta centrada); ya no se usan modales.
- Cliente HTTP: `admin-app/src/api.js` — `api(path)` → `/x/s/*` (API del
  panel); `apiRoot(path)` → `/api/*` (pública, p. ej. citas). Token JWT en
  `sessionStorage['est_office_token']`.
- Estilos: `admin-app/src/styles.css` (páginas blancas con pelotitas sutiles,
  tarjetas blancas con sombras 3D; shell y modales/login oscuros).
- Rutas internas del panel: `admin-app/src/App.jsx` (`/`, `/trabajadores`,
  `/tareas`, `/equipo`, `/reparaciones`, `/ventas`, `/facturas`, `/ordenes`,
  `/inventario`, `/citas`, `/ajustes`).
- **Build obligatorio tras cualquier cambio:** `cd admin-app && npm run build`
  → genera `server/admin-dist/` (commiteado; Railway solo despliega `server/`).
- URL en producción: `/x/<slug>` (slug en env `ADMIN_PATH`); assets en
  `/x/static/` (base de Vite); API en `/x/s/*`.

### Backend (`server/`)
- Entrada: `server/index.js` — monta routers y sirve estáticos.
- Rutas del panel (`/x/s/*`): `server/routes/adminAuth.js`, `adminUsers.js`,
  `adminTime.js`, `adminTasks.js`, `adminMonitor.js`, `adminRepairs.js`,
  `adminInventory.js`, `adminInvoices.js` (facturas, solo admin),
  `adminOrders.js` (órdenes de envío: website vía Stripe + manuales FB
  Marketplace; GET sincroniza con Stripe máx. 1 vez/min, POST crea manual,
  PATCH tracking → 'enviado' o 'entregado' manual).
- Rutas públicas (`/api/*`): `appointments.js`, `slots.js`, `checkout.js`
  (Stripe; su webhook guarda cada pago en la tabla `online_orders` y pide
  dirección de envío US en la sesión), `track.js` (seguimiento público:
  `GET /api/track/:token` por `track_token`, sin PII de contacto),
  `auth.js` (login viejo, sin frontend).
- **Correos transaccionales:** `server/lib/email.js` (Resend vía fetch, sin
  dependencias; env `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`). **En
  inglés, fondo blanco y logo negro** (`assets/img/logo-black.png`, servido
  por el sitio público). La confirmación muestra cada producto con **foto y
  descripción** (los items se enriquecen en el webhook/sync con
  `catalog.enrichLineItems`, que guarda `img`/`desc` en inglés en el JSONB) y
  el desglose Subtotal / Tax / Shipping / Total paid. La
  confirmación adjunta el **recibo PDF** sola (la factura se crea con
  `await autoInvoice` antes de los correos; el PDF va **todo en inglés**:
  fecha MM/DD/YYYY, método de pago traducido, footer "Thank you…").
  Teléfono del pie: (385) 461-2042.
  Se envían:
  nuevo pedido (dueño + confirmación al cliente con link `/track?t=`), "va en
  camino" al guardar tracking, "en tránsito" y "entregado" (vía AfterShip), y
  la factura con PDF adjunto (`POST /x/s/orders/:id/send-invoice`).
  Flags en `online_orders` (`email_shipped/transit/delivered`) para no
  reenviar. Sin key solo loguea y sigue.
- **Facturas automáticas por orden:** al registrarse una orden (web o FB) se
  crea sola su factura (`invoices.order_id`, `invoices.createFromOrder`) con
  todos los datos del cliente. El PDF del Bill of Sale se genera server-side
  con `server/lib/invoicePdf.js` (pdfkit) — `GET /x/s/invoices/:id/pdf`
  descarga y el correo de factura lo adjunta.
- Modelos (SQL directo con `pg`): `server/models/` — `users.js`,
  `repairs.js`, `inventory.js`, `tasks.js`, `timeEntries.js`, `audit.js`,
  `invoices.js` (tabla `invoices`: Bill of Sale ligado a `sale_id` o
  `repair_id`; `items` JSONB solo productos — las líneas Tax/Shipping de
  Stripe se extraen a `tax_total`/`shipping_total` al crear la factura desde
  una orden; número auto `EST-0001`), `orders.js` (tabla
  `online_orders`: envíos; `stripe_session_id` UNIQUE nullable como dedupe;
  `items` JSONB; email/teléfono/dirección del cliente; `origen`
  website/fb_marketplace; `ship_status` pendiente→enviado→entregado;
  `tracking_number`/`carrier`/`tracking_id`; `ship_tag` (tag fino de
  AfterShip: InTransit/OutForDelivery/Delivered, alimenta la barra de
  progreso animada centrada de 5 pasos en Órdenes — Label generado → Enviado →
  En tránsito → En reparto → Delivered — y la línea de progreso de
  `track.html`).
- **Tracking de envíos:** `server/lib/tracking.js` con dos proveedores (gana
  el configurado): **USPS Tracking API v3** (`USPS_CLIENT_ID` +
  `USPS_CLIENT_SECRET`, gratis permanente, OAuth2; se consulta por número, sin
  registro previo; el job cada 15 min trae estado + `expectedDeliveryDate`) o
  **AfterShip Tracking API 2025-07** (`AFTERSHIP_API_KEY` llave `asat_*`,
  header `as-api-key`, trial/pago; además tiene webhook push). Al guardar tracking la orden pasa a 'enviado' sola. **Webhook en
  tiempo real (solo AfterShip):** `POST /api/track/webhook` aplica el cambio al
  instante vía `tracking.applyUpdate` (tag, `expected_delivery`, correos de
  tránsito/entrega con flags) y emite por el bus `server/lib/trackEvents.js`;
  `GET /api/track/:token/stream` (SSE) empuja el aviso a track.html (también
  cuando el dueño guarda tracking o marca entregado en el panel). El job de
  15 min en `server/index.js` corre SIEMPRE: con keys es el respaldo del
  webhook; sin keys aplica la regla de 24 h — `online_orders.shipped_at`
  (sellado al cargar tracking) + 24 h sin tag → 'InTransit' automático con su
  correo de tránsito. OutForDelivery/Delivered los marca el dueño a mano.
- **Ventas del panel = 3 fuentes** (misma definición en `Sales.jsx` y
  `Dashboard.jsx`): reparaciones entregadas + ventas de mostrador + órdenes
  de envío (website + FB Marketplace). Las órdenes no se anulan ni borran
  desde el panel (reembolsos en Stripe / trato directo en FB).
  **Costo de órdenes (`online_orders.costo`):** el catálogo web
  (`server/catalog.js`) está ligado al inventario por `invId` — al pagar, el
  webhook/sync descuenta stock y guarda el costo real; en FB lo escribe el
  dueño en el formulario. `orders.backfillCosts()` corre al arranque y
  repara órdenes viejas (empareja por nombre, NO toca stock). Sin costo, la
  ganancia mensual sale inflada (cuenta 100%).
- `server/db.js`: Pool + `CREATE TABLE IF NOT EXISTS` (las tablas se
  autocrean al arrancar). `repair_tickets` tiene `device_type`
  (telefono/tablet/laptop), `service_type` (revision/reparacion/mantenimiento),
  `final_price`, `quoted_price`, `status`
  (recibido→diagnostico→reparacion→listo→entregado), `created_at`,
  `delivered_at`.
- Bots: `server/wa-bot/` (WhatsApp), `server/ig-bot/` (Instagram) —
  artefactos locales gitignored.

### Dashboard del panel (composición actual, 2026-07-24)
`admin-app/src/pages/Dashboard.jsx`: fila superior de 4 tarjetas (enlaces):
Ventas de hoy ($ de entregados hoy), Trabajadores, Reparaciones esta semana
y Total de inventario. Abajo, layout `.dash-layout` (contenido a la
izquierda; a la derecha una dona "Ventas vs reparaciones (semana)" —
entregadas vs creadas no entregadas, componente `Donut` en el mismo archivo).
- Gráficos de barras SVG propios (`components/BarChart.jsx`, animación de
  crecimiento escalonada): Ventas de la semana (tickets `entregado`, suma
  `final_price` por `delivered_at`) y Citas de la semana (por `fecha`).
  Semana **lunes–domingo en America/Chicago** (`currentWeekKeys`). El día
  actual se resalta. **Las barras son clicables:** ventas →
  `/ventas?fecha=YYYY-MM-DD` (página Ventas en vista de día), citas →
  `/citas?fecha=YYYY-MM-DD`. El título "Ventas de la semana →" enlaza a
  `/ventas`.
- Tabla "Citas de hoy". Todo el dashboard sin negrillas
  (`.dashboard * { font-weight: 400 !important }`, petición del dueño).

## Verificación visual del panel (úsala SIEMPRE en cambios de UI)

`admin-app/.visual-test/run.cjs` (local, gitignored): sirve `server/admin-dist`,
mockea toda la API (datos al inicio del archivo) y captura todas las vistas con
Chrome real (puppeteer-core del `node_modules` raíz).

```bash
node admin-app/.visual-test/run.cjs   # shots en admin-app/.visual-test/shots/
```

Flujo: editar → build → correr arnés → **leer la captura afectada** antes de
commit. Si una vista necesita datos nuevos, ajusta los mocks de `run.cjs`.

## Flujo de trabajo y convenciones

- **Commit + push a `master` al terminar cada tarea** (petición expresa del
  dueño). Commits en español, estilo `feat(panel): ...` / `fix(panel): ...` /
  `style(panel): ...`.
- Nunca commitear: `.vercel/`, `admin-app/.visual-test/`, `.env`,
  `server/wa-bot|ig-bot` artefactos (ya en `.gitignore`).
- Sin tests ni CI: la verificación es el build + el arnés visual.
- No agregar dependencias nuevas al panel sin confirmarlo (las gráficas son
  SVG hechas a mano por eso).
- Texto visible en español; código/comentarios en español en el panel.
- Zona horaria del negocio: `America/Chicago` (citas, semanas, slots).
- Tema del sitio público: oscuro **monocromo** (blanco/negro/dorado del logo);
  no reintroducir acentos de color sin pedirlo (`MEMORIA.md` §3).

## Skills y agentes del proyecto

- `/skill:panel-admin` — workflow completo para cambios en el back-office.
- `/skill:sitio-web` — workflow para cambios en el sitio público.
- Agente `visual-qa` — subagente que corre el arnés visual y revisa capturas.
