---
name: panel-admin
description: Workflow completo para modificar el panel de gestión (back-office React en admin-app/) — dónde está cada cosa, cómo compilar, verificar visualmente y entregar
type: prompt
whenToUse: Cuando el usuario pida cambios en el panel/dashboard/trabajadores/tareas/equipo/reparaciones/inventario/citas/ajustes del back-office, o cualquier vista servida bajo /x/
---

# Cambios en el panel de gestión (admin-app)

El panel es React 18 + Vite en `admin-app/`. **No explores para ubicar:** el
mapa está en `AGENTS.md` (raíz) y la composición del Dashboard también.

## Ubicaciones directas

| Necesitas | Archivo |
|---|---|
| Página/vista | `admin-app/src/pages/<Vista>.jsx` |
| Layout, menú lateral, topbar | `admin-app/src/components/Layout.jsx` |
| Modales y detalles | `admin-app/src/components/` |
| Llamadas a la API | `admin-app/src/api.js` (`api()` → `/x/s/*`, `apiRoot()` → `/api/*`) |
| Estilos (todos, hoja única) | `admin-app/src/styles.css` |
| Rutas internas | `admin-app/src/App.jsx` |
| Endpoint del backend | `server/routes/admin*.js` + `server/models/*.js` |

## Workflow obligatorio

1. **Edita** en `admin-app/src/`. Comentarios y texto visible en español.
   Respeta el estilo del archivo (tema oscuro, tarjetas blancas, sin
   negrillas en el Dashboard: `.dashboard * { font-weight: 400 !important }`).
2. **Sin dependencias nuevas** sin confirmar con el usuario. Las gráficas se
   hacen con SVG a mano (ver `BarChart` en `Dashboard.jsx`).
3. **Fechas de negocio en `America/Chicago`**: usa `chicagoKey()` /
   `currentWeekKeys()` del Dashboard (semana lunes–domingo, aritmética en UTC).
4. **Compila:** `cd admin-app && npm run build` (sale a `server/admin-dist/`,
   que va commiteado — Railway solo despliega `server/`).
5. **Verifica con el arnés visual** (local, gitignored):
   `node admin-app/.visual-test/run.cjs`
   - Sirve `admin-dist`, mockea toda la API (datos al inicio de `run.cjs`),
     captura todas las vistas en `.visual-test/shots/` con Chrome real.
   - Si tu cambio necesita datos nuevos en el mock (p. ej. campos de fecha
     para gráficas semanales), edita los arrays del inicio de `run.cjs` —
     fechas relativas (`iso(minutosAgo)` / `dayKey(díasAgo)`), nunca absolutas.
   - **Lee la captura de la vista que tocaste** con ReadMediaFile antes de
     dar el trabajo por terminado. Para revisiones amplias puedes delegar al
     agente `visual-qa`.
6. **Commit + push a `master`** (el dueño lo pidió para cada tarea):
   `git add admin-app/src server/admin-dist && git commit -m "<tipo>(panel): <desc>" && git push`
   Tipos: `feat` / `fix` / `style`. Nunca añadas `.vercel/` ni
   `admin-app/.visual-test/`.

## Datos del backend que usa el panel

- `GET /x/s/users` → `{users:[{id,username,email,role('admin'|'worker'),active,...}]}`
- `GET /x/s/repairs` → `{tickets:[{id,status,quoted_price,final_price,created_at,delivered_at,assigned_to,...}]}`
- `GET /x/s/inventory` → `{items:[{id,name,sku,category,price,stock,min_stock,...}]}`
- `GET /api/appointments[?date=YYYY-MM-DD]` → `{citas:[{id,nombre,telefono,servicio,fecha,hora,estado,...}]}`
  (sin `date` devuelve todas; la usa el Dashboard para la semana)
- Fotos de reparación: `photoUrl(filename)` en `api.js`.

## Errores ya cometidos (no repetir)

- Al convertir una tarjeta en `<Link>`: la regla global `a { color: inherit }`
  puede volver el texto blanco sobre tarjeta blanca. No uses `color: inherit`
  en la clase del enlace; deja que mande el color de la tarjeta.
- `final_price` llega como string desde Postgres (NUMERIC): convierte con
  `Number(...)` antes de sumar.
