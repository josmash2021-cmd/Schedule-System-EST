# Despliegue del bot de WhatsApp en Railway

El bot corre como un **segundo servicio** dentro del mismo proyecto de Railway
del sitio web (mismo repo, carpeta `bot/`).

## 1. Crear el servicio

1. En Railway, abre el proyecto del sitio web.
2. **New → Service → GitHub Repo** (el mismo repo) → en **Settings → Source**
   pon **Root Directory: `bot`**.
3. Railway detecta Node, corre `npm install` y arranca con `npm start`
   (`node index.js`). No necesita puerto ni dominio (es conexión saliente).

## 2. Variables de entorno (Settings → Variables)

```
OPENAI_API_KEY=<clave de Kimi Code (sk-kimi-...)>
OPENAI_BASE_URL=https://api.kimi.com/coding/v1
OPENAI_MODEL=k3
OWNER_NUMBER=12055737840
NOTIFY_NUMBERS=12055737840,13854612042
BUSINESS_NAME=ElectronicST
WEBSITE_API_URL=https://electronicservicetechnology.com
TRANSCRIBE_API_KEY=<clave de Groq (gsk_...)>
TRANSCRIBE_BASE_URL=https://api.groq.com/openai/v1
TRANSCRIBE_MODEL=whisper-large-v3
AUTH_DIR=/data/auth_info
DATA_DIR=/data/data
```

## 3. Volumen persistente (para no re-escanear el QR)

1. En el servicio del bot: **Settings → Volumes → New Volume**.
2. Mount path: `/data`.
3. Con `AUTH_DIR=/data/auth_info` y `DATA_DIR=/data/data`, la sesión de
   WhatsApp y las conversaciones sobreviven redespliegues.

## 4. Vincular WhatsApp (una sola vez)

1. Despliega y abre **Logs** del servicio.
2. Aparecerá el código QR en los logs (también en `npm start` local).
3. Escanéalo con el WhatsApp Business del 385-576-0574
   (⋮ → Dispositivos vinculados → Vincular un dispositivo).
4. Cuando el log diga "Conectado como ElectronicST", el bot queda vivo 24/7.

## 5. Importante

- **Apaga la instancia local** (`pm2 stop whatsapp-bot`) cuando Railway esté
  conectado: dos instancias con la misma cuenta se tumbarían entre sí.
- Los datos del negocio, catálogo y fotos se editan en `bot/config/*.json`
  y se aplican al reiniciar el servicio (o en el siguiente deploy).
