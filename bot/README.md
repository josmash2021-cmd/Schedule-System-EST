# Bot de WhatsApp para Servicio al Cliente

Bot de WhatsApp con inteligencia artificial para un negocio que **repara y vende laptops, tablets y iPhones**. Atiende clientes en español, responde consultas, cotiza desde el catálogo, agenda citas y escala a un asesor humano cuando hace falta.

> ⚠️ **Advertencia importante**: este bot usa [Baileys](https://github.com/WhiskeySockets/Baileys), una librería **no oficial** que se conecta a WhatsApp Web. Usar la API no oficial puede llevar a que WhatsApp **baneé el número**. Úsalo con un número dedicado al negocio (no tu número personal), evita enviar spam y úsalo bajo tu propio riesgo.

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior (recomendado 20+).
- Un número de WhatsApp para el negocio (se vincula escaneando un QR).

## Instalación

```bash
npm install
```

## Configuración

1. Copia el archivo de ejemplo de variables de entorno:

   ```bash
   cp .env.example .env
   ```

2. Edita `.env` con tus datos:

   - `OPENAI_API_KEY`: clave de tu proveedor de IA. **Si la dejas vacía**, el bot arranca igual, pero responderá a los clientes que un asesor humano los atenderá pronto (y te avisará).
   - `OPENAI_BASE_URL`: por defecto `https://api.openai.com/v1`. El cliente es compatible con cualquier API estilo OpenAI:
     - OpenAI: `https://api.openai.com/v1`
     - Gemini: `https://generativelanguage.googleapis.com/v1beta/openai/`
     - Groq: `https://api.groq.com/openai/v1`
   - `OPENAI_MODEL`: por defecto `gpt-4o-mini` (ej. `gemini-1.5-flash`, `llama-3.1-8b-instant`).
   - `OWNER_NUMBER`: tu número con código de país, sin `+` ni espacios (ej. `521XXXXXXXXXX`). Aquí llegan los avisos de citas nuevas y solicitudes de humano. Si no se configura, los avisos solo se muestran en consola.
   - `BUSINESS_NAME`: nombre del negocio.

3. **Datos del negocio**: edita `config/negocio.json` (dirección, horarios, teléfono, garantías, servicios de reparación). El bot los usa para responder consultas.

4. **Catálogo de productos**: edita a mano `config/catalogo.json`. Es una lista de productos con `tipo`, `nombre`, `specs`, `precio` y `moneda`. El bot **solo** menciona productos y precios que estén en este archivo; nunca inventa precios.

## Uso

```bash
npm start
```

La primera vez aparecerá un **código QR** en la terminal. Escanéalo desde el teléfono del negocio:

**WhatsApp → Configuración → Dispositivos vinculados → Vincular un dispositivo**

La sesión queda guardada en la carpeta `auth_info/`, así que no tendrás que escanear el QR cada vez. Si cierras la sesión desde el teléfono, borra `auth_info/` y vuelve a iniciar.

## ¿Qué hace el bot?

- **Reparaciones**: pide equipo, modelo y falla; explica que el diagnóstico es sin costo y que un técnico confirma precio antes de reparar.
- **Consultas generales**: horarios, dirección y garantías (desde `config/negocio.json`).
- **Ventas**: ofrece laptops, tablets e iPhones del catálogo, con precios exactos.
- **Agenda citas**: consulta la disponibilidad real del día en el sitio web, ofrece solo horas libres y registra la cita en el mismo sistema del sitio (además de un respaldo en `data/citas.json`).
- **Escala a humano**: si el cliente pide una persona o el caso es complejo, te avisa y el bot le dice al cliente que un asesor lo contactará.
- Ignora grupos, estados, difusiones, canales, stickers y mensajes vacíos. Simula "escribiendo..." antes de responder.

## Integración con el sitio web

Las citas que agenda el bot caen en el **mismo sistema de citas del sitio web** (`electronicservicetechnology.com`): aparecen en el panel de administración y el servidor notifica al dueño por WhatsApp (las notificaciones por SMS fueron desactivadas).

- Antes de proponer horarios, el bot consulta los horarios libres reales del día (`GET /api/slots`), así que nunca ofrece horas ocupadas ni domingos.
- Al agendar (`POST /api/appointments`), si el horario se ocupó en el interim, el bot vuelve a consultar y ofrece alternativas.
- Cada cita también queda guardada como respaldo/auditoría en `data/citas.json` (con la marca `registradaWeb`). Si el sitio no responde por un error de red, la cita se guarda solo local y el aviso al dueño lo indica con ⚠️.
- La URL base se configura con `WEBSITE_API_URL` en `.env` (por defecto `https://electronicservicetechnology.com`).

## Estructura del proyecto

```
index.js              # Arranque, conexión Baileys y ruteo de mensajes
src/
  ai.js               # Cliente LLM, system prompt, historial y tool calling
  citasApi.js         # Cliente HTTP del sistema de citas del sitio web
  citas.js            # Guardar/listar citas (data/citas.json)
  notificar.js        # Avisos al dueño por WhatsApp
  config.js           # Carga de .env y JSONs de configuración
config/
  negocio.json        # Datos editables del negocio
  catalogo.json       # Catálogo de productos (se edita a mano)
data/citas.json       # Citas agendadas (se crea solo)
auth_info/            # Sesión de WhatsApp (se crea solo, NO subir a git)
```

## Notas

- El historial de conversación es **en memoria**: se mantiene por usuario (máx. ~20 mensajes) y se limpia tras 24 horas de inactividad. Si reinicias el bot, las conversaciones empiezan de cero.
- Las citas se guardan en un JSON simple (`data/citas.json`) con escritura atómica. No se usa ninguna base de datos.
- Solo procesa mensajes de texto (y descripciones de imágenes). Audios, stickers y demás se ignoran.

## Operación autónoma (PM2 + arranque con Windows)

El bot corre bajo **PM2** (gestor de procesos de Node), así no depende de ninguna terminal abierta:

- **Se reinicia solo** si el proceso falla o se cae.
- **Arranca solo con Windows**: el script `whatsapp-bot-est.vbs` en la carpeta de inicio del usuario (`shell:startup`) ejecuta `pm2 resurrect` al iniciar sesión, restaurando el bot.
- La sesión de WhatsApp persiste en `auth_info/`: el QR solo se escanea una vez.

Comandos útiles:

```bash
pm2 status                 # ver si el bot está corriendo
pm2 logs whatsapp-bot      # ver los mensajes en vivo (aquí aparece el QR si hace falta)
pm2 restart whatsapp-bot   # reiniciar (ej. tras editar config/*.json)
pm2 stop whatsapp-bot      # detener el bot
```

Si cambias código y quieres que PM2 lo tome: `pm2 restart whatsapp-bot`. Si agregas/quitas procesos de PM2, guarda de nuevo con `pm2 save`.
