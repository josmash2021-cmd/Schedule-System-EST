# Bot de Instagram (Angel) — API oficial de Meta

Angel también atiende los **mensajes directos de Instagram** con la API
oficial de Instagram Messaging. Es un bot **independiente** del bot de
WhatsApp (`server/wa-bot/`): módulos propios en `src/`, datos propios en
`data/` y avisos al dueño por **CallMeBot HTTP** (no usa el socket de
WhatsApp para nada).

El servidor Express (`server/index.js`) monta el webhook de este módulo:
`https://electronicservicetechnology.com/api/instagram/webhook`
(también funciona directo por el dominio de Railway, ej.
`https://<tu-servicio>.up.railway.app/api/instagram/webhook`).

## Variables de entorno

- `IG_ACCESS_TOKEN`: token de acceso de la cuenta de Instagram Business
  (Meta for Developers). Si falta, el webhook funciona en modo prueba:
  todo el flujo corre pero los envíos solo se loguean ("[ig] envío
  simulado").
- `IG_USER_ID`: ID de la cuenta de Instagram Business (ig_user_id).
- `IG_VERIFY_TOKEN`: cadena inventada por ti; la misma que pongas al
  configurar el webhook en Meta.
- `IG_APP_SECRET`: App Secret de la app de Meta (Settings → Basic), para
  verificar la firma X-Hub-Signature-256 de los eventos.
- `GRAPH_API_VERSION`: opcional, default `v21.0`.
- `IG_NOTIFY_PHONE`: número del dueño que recibe los avisos (citas,
  solicitudes de supervisor) por WhatsApp vía CallMeBot. Default:
  `OWNER_PHONE` o `12055737840`.
- `IG_CALLMEBOT_API_KEY`: API key de CallMeBot para ese número. Default:
  `CALLMEBOT_API_KEY` (la misma que ya usa el servidor web). Sin key, los
  avisos solo se loguean.
- Además comparte con el resto del sistema: `OPENAI_API_KEY`/`OPENAI_BASE_URL`/
  `OPENAI_MODEL`, `TRANSCRIBE_*`, `WEBSITE_API_URL` y `DATA_DIR_IG` (o
  `DATA_DIR`) para la persistencia (default `server/ig-bot/data`).

## Configuración en Meta for Developers (una sola vez)

1. En [developers.facebook.com](https://developers.facebook.com) crea una
   app tipo **Business** (o usa una existente).
2. Agrega el producto **Instagram** y entra a su configuración de
   **Messaging / API setup**.
3. Conecta la **cuenta de Instagram Business** del negocio (debe ser cuenta
   profesional vinculada a una página de Facebook) y genera el **token de
   acceso** (`IG_ACCESS_TOKEN`); ahí mismo aparece el **IG user ID**
   (`IG_USER_ID`).
4. En Railway → **Variables**, agrega las variables `IG_*` de arriba.
5. En la sección **Webhooks** del producto Instagram, configura el callback:
   - URL: `https://electronicservicetechnology.com/api/instagram/webhook`
   - Verify token: el mismo `IG_VERIFY_TOKEN`.
   - Suscríbete al campo **`messages`**.
6. Meta hará un GET de verificación; si el log muestra "Webhook verificado
   por Meta", quedó listo.

## ⚠️ Nota honesta sobre el alcance (App Review)

- En **modo desarrollo** la app de Meta solo puede responder a cuentas de
  Instagram agregadas como **testers** en la app (App Dashboard → Roles).
  Para probar, agrega ahí tu cuenta de Instagram.
- Para atender al **público general** hace falta pasar la **App Review** de
  Meta solicitando el permiso `instagram_business_messaging`: es una
  revisión manual que puede tardar **días**. Mientras tanto, el bot solo
  responde a testers.
