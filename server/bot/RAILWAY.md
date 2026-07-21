# Bot de WhatsApp (Angel) — integrado en el servidor web

El bot corre **dentro del mismo servicio de Railway que la página web**
(`Schedule-System-EST`). El servidor Express (`server/index.js`) lo arranca
como módulo: comparten proceso, repo y despliegue. Si el bot falla, la web
sigue corriendo, y se puede desactivar con `BOT_ENABLED=false`.

## Configuración en Railway (una sola vez)

1. **Variables de entorno**: en el servicio `Schedule-System-EST`
   → **Variables**, agrega las de la sección "Bot de WhatsApp" de
   `server/.env.example` (claves de Kimi y Groq, números de aviso,
   `AUTH_DIR=/data/auth_info`, `DATA_DIR=/data/data`).

2. **Volumen persistente**: en el mismo servicio → **Settings → Volumes →
   New Volume** → mount path `/data`. Ahí viven la sesión de WhatsApp
   (`auth_info`) y las conversaciones; sin volumen habría que escanear el
   QR en cada redespliegue.

3. **Vincular WhatsApp**: tras el deploy, abre **Logs** del servicio,
   aparecerá el QR del bot junto a los logs del servidor. Escanéalo con el
   WhatsApp Business del 385-576-0574 (⋮ → Dispositivos vinculados).
   Cuando el log diga "Conectado como ElectronicST", Angel queda en línea.

4. **Apagar la instancia local**: si el bot corre en otra parte (PM2 en una
   PC), detenla — dos instancias con la misma cuenta se tumbarían entre sí.

## Notas

- Las dependencias del bot están fusionadas en `server/package.json`
  (Baileys, openai, pino, qrcode-terminal).
- Datos del negocio, catálogo y fotos: `server/bot/config/*.json`
  (se aplican al reiniciar el servicio).
- El bot también puede correr solo: `cd server/bot && node index.js`
  (útil para pruebas locales con su propio `.env`).
