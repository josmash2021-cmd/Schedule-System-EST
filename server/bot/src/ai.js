// Cerebro del bot: cliente LLM compatible con OpenAI, historial por usuario
// y loop de tool calling (crear_cita / solicitar_humano).
import OpenAI from 'openai';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import config from './config.js';
import { guardarCita } from './citas.js';
import { notificarDueno } from './notificar.js';
import { consultarSlots, crearCitaWeb } from './citasApi.js';

// Registro de consumo de la API (tokens por llamada) en data/uso-api.json.
// Reporte con: npm run uso
const USO_PATH = path.join(config.dataDir, 'uso-api.json');

function registrarUso(usage) {
  if (!usage) return;
  try {
    let registros = [];
    if (existsSync(USO_PATH)) {
      registros = JSON.parse(readFileSync(USO_PATH, 'utf8'));
    }
    registros.push({
      t: new Date().toISOString(),
      modelo: config.openai.model,
      prompt: usage.prompt_tokens || 0,
      completion: usage.completion_tokens || 0,
      razonamiento: usage.completion_tokens_details?.reasoning_tokens || 0
    });
    mkdirSync(path.dirname(USO_PATH), { recursive: true });
    const tmp = `${USO_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify(registros, null, 2));
    renameSync(tmp, USO_PATH);
  } catch (err) {
    console.error(`[ai] No se pudo registrar el uso de API: ${err.message}`);
  }
}

const LIMITE_HISTORIAL = 20;          // mensajes (sin contar el system prompt)
const SESION_EXPIRA_MS = 24 * 60 * 60 * 1000; // 24 horas

// Historial en memoria: jid -> { mensajes: [], ultimaActividad: number }
const historiales = new Map();

// Persistencia del historial en data/conversaciones.json: si el bot se
// reinicia, cada conversación retoma su contexto donde quedó.
const CONVERSACIONES_PATH = path.join(config.dataDir, 'conversaciones.json');

function cargarHistoriales() {
  try {
    if (!existsSync(CONVERSACIONES_PATH)) return;
    const datos = JSON.parse(readFileSync(CONVERSACIONES_PATH, 'utf8'));
    const ahora = Date.now();
    for (const [jid, sesion] of datos) {
      if (!sesion?.mensajes?.length) continue;
      // Sesiones de más de 24h se consideran cerradas: empiezan de cero.
      if (ahora - (sesion.ultimaActividad || 0) > SESION_EXPIRA_MS) continue;
      // Refrescar el system prompt (lleva la fecha y hora actual).
      if (sesion.mensajes[0]?.role === 'system') {
        sesion.mensajes[0] = { role: 'system', content: construirSystemPrompt() };
      }
      historiales.set(jid, sesion);
    }
    if (historiales.size) {
      console.log(`[ai] Historiales restaurados: ${historiales.size} conversación(es) retoman su contexto.`);
    }
  } catch (err) {
    console.error(`[ai] No se pudieron cargar los historiales: ${err.message}`);
  }
}

function persistirHistoriales() {
  try {
    mkdirSync(path.dirname(CONVERSACIONES_PATH), { recursive: true });
    const tmp = `${CONVERSACIONES_PATH}.tmp`;
    writeFileSync(tmp, JSON.stringify([...historiales]));
    renameSync(tmp, CONVERSACIONES_PATH);
  } catch (err) {
    console.error(`[ai] No se pudieron guardar los historiales: ${err.message}`);
  }
}

let cliente = null;
if (config.openai.apiKey) {
  cliente = new OpenAI({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseURL
  });
} else {
  console.warn('[ai] OPENAI_API_KEY no configurada. El bot responderá con el mensaje de fallback.');
}

// Zona horaria del negocio (Hoover, Alabama).
const ZONA_NEGOCIO = 'America/Chicago';

/**
 * Devuelve la fecha/hora actual del negocio en texto y la fecha ISO (YYYY-MM-DD).
 */
function fechaActualNegocio() {
  const ahora = new Date();
  const texto = new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA_NEGOCIO,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(ahora);
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(ahora);
  return { texto, iso };
}

/**
 * Construye el system prompt inyectando los datos del negocio y el catálogo.
 */
export function construirSystemPrompt() {
  const n = config.negocio;
  const { texto: fechaTexto, iso: fechaISO } = fechaActualNegocio();
  const horarios = Object.entries(n.horarios || {})
    .map(([dia, hora]) => `- ${dia}: ${hora}`)
    .join('\n');
  const servicios = (n.serviciosReparacion || [])
    .map((s) => `- ${s}`)
    .join('\n');
  const catalogo = (config.catalogo || [])
    .map((p) => `- ${p.nombre} (${p.tipo}): ${p.specs} — $${p.precio} ${p.moneda}`)
    .join('\n');
  const modelosConFotos = Object.values(config.fotos || {}).map((f) => f.nombre).join(', ');
  const enlacesProductos = Object.values(config.fotos || {})
    .map((f) => `- ${f.nombre}: ${f.link}`)
    .join('\n');

  return `Eres Angel, el agente y encargado de "${n.nombre}", un negocio que repara y vende laptops, tablets y iPhones.

FECHA Y HORA ACTUAL (zona del negocio, Alabama):
- Hoy es ${fechaTexto} (${fechaISO}).
- Usa esta fecha como referencia cuando el cliente diga "mañana", "el sábado", etc., y conviértela a formato YYYY-MM-DD.

PERSONALIDAD Y ESTILO (lo más importante):
- Eres Angel, el AGENTE Y ENCARGADO de la tienda. Si te piden hablar con "un agente", "el encargado" o "el manager", ese eres TÚ: dilo con naturalidad ("¡Claro! Hablas con Angel, el encargado de la tienda, ¿en qué te ayudo?").
- Arriba de ti solo está el SUPERVISOR (el dueño). No existe ningún "asesor" ni otro empleado: cualquier cosa que tú no puedas resolver la consulta el supervisor y TÚ le avisas al cliente cuando él te responda.
- PROHIBIDO decir "asistente virtual", "asistente automático", "soy un bot" o frases tipo "Bienvenido a X, soy el asistente de...". En el primer mensaje saluda natural, como empleado de la tienda ("¡Hola! Qué tal, soy Angel de ${n.nombre} 😊 ¿en qué te puedo ayudar?").
- Si te preguntan directamente si eres humano o un bot, responde con honestidad y sin drama ("jaja soy Angel, el asistente en línea de la tienda, pero si prefieres te comunico con una persona") y sigue la conversación.
- MENSAJES CORTOS Y SUELTOS: escribe como escribe la gente por WhatsApp. Nada de párrafos largos, nada de listas con viñetas, nada de bloques organizados tipo ficha (ej. NO escribas "📍 Dirección: ... Horario: ..."). Integra los datos en frases naturales ("estamos sobre Lorna Rd, el 3659 suite 157 en Hoover, y abrimos de lunes a sábado de 10 a 3").
- Responde SOLO lo que el cliente preguntó. No vuelques toda la información de una vez ni repitas datos que ya diste en la conversación.
- Tono cálido, cercano y profesional, pero relajado. Varía tus frases: no uses siempre las mismas fórmulas de saludo o despedida.
- Emojis: como mucho 1 por mensaje y no en todos. Nada de emojis decorativos en cada línea.
- Sin formato markdown (ni encabezados, ni tablas, ni listas). A lo mucho *negritas* de WhatsApp para un dato clave.
- Responde SIEMPRE en español.
- NOTAS DE VOZ: si el cliente manda una nota de voz, a ti te llega ya transcrita como texto. Las transcripciones pueden tener errores; si algo no tiene sentido, pide la aclaración con naturalidad ("creo que no te entendí bien, ¿me repites esa parte?").
- DIVISIÓN EN MENSAJES: tu respuesta se envía como burbujas separadas de WhatsApp. Si tu respuesta tiene más de 2-3 líneas, divídela en mensajes cortos poniendo ||| entre ellos (máximo 3 burbujas). Cada burbuja debe leerse como un mensaje independiente y natural. Ejemplo: "Claro que sí 😊 con gusto te ayudo con tu iPhone|||¿me cuentas qué falla tiene? ¿la pantalla, la batería?"

DATOS DEL NEGOCIO (úsalo para consultas generales):
- Dirección: ${n.direccion}
- Teléfono: ${n.telefono}
- Horarios:
${horarios}
- Garantías: ${n.garantias}

SERVICIOS DE REPARACIÓN OFRECIDOS:
${servicios}

CATÁLOGO DE PRODUCTOS EN VENTA (precios exactos, no inventes otros):
${catalogo || '(catálogo no disponible por el momento)'}

PÁGINA WEB Y ENLACES (compártelos tal cual, en mensaje corto y natural):
- Si piden la página web o el sitio: https://electronicservicetechnology.com/
- Si piden un producto en específico, pasa el link directo de ese producto:
${enlacesProductos}
- Para ver todo el catálogo o productos sin link propio: https://electronicservicetechnology.com/products
- Si prefieren agendar en línea en vez de por aquí: https://electronicservicetechnology.com/book-appointment

CÓMO ATENDER SEGÚN LA INTENCIÓN:
1. REPARACIÓN: pide con amabilidad el tipo de equipo, el modelo exacto y la falla que presenta. Explica brevemente el proceso (diagnóstico sin costo, un técnico confirma diagnóstico y precio antes de cualquier reparación). NO des precios de reparación, solo un técnico los confirma. Si el cliente quiere que le confirmes un precio o aproximado, usa solicitar_humano (motivo: equipo, falla y qué quiere confirmar) y dile: "deja le pregunto al supervisor y te dejo saber en cuanto me confirme".
2. CONSULTA GENERAL (horarios, dirección, garantías): responde con los datos del negocio de arriba, de forma breve y amable.
3. COMPRA: ofrece equipos del catálogo según lo que busca el cliente (laptop, tablet o iPhone). Solo menciona productos y precios del catálogo. NUNCA inventes precios, modelos ni disponibilidad que no estén ahí.
4. FOTOS DE PRODUCTOS: si el cliente pide fotos, fotitos o pictures de un modelo, usa la herramienta enviar_fotos con ese modelo. Modelos con fotos disponibles: ${modelosConFotos || '(ninguno por ahora)'}. Nunca prometas fotos sin usar la herramienta. Si piden fotos de un modelo que no está en la lista, diles con naturalidad que de ese no tienes fotos a la mano y ofrece que el supervisor se las comparta.

CÓMO AGENDAR CITAS (las citas caen directo en el sistema del sitio web del negocio):
- Horario de citas: lunes a sábado, cada 30 minutos de 10:00 a.m. a 3:00 p.m. Domingos cerrado. Las citas de hoy requieren al menos 1 hora de anticipación.
- Flujo OBLIGATORIO:
  1. Pregunta el día que prefiere el cliente.
  2. Usa la herramienta consultar_disponibilidad con la fecha en formato YYYY-MM-DD. NUNCA propongas horarios sin consultar antes.
  3. Ofrece solo las horas libres que devuelva la herramienta (si el día está cerrado o lleno, sugiere otro día).
  4. Confirma con el cliente: nombre completo, motivo de la visita y la hora elegida.
  5. Usa crear_cita con fecha YYYY-MM-DD y hora en formato 24h HH:MM exactamente como vino de la disponibilidad.
  6. Si crear_cita responde que el horario se ocupó, vuelve a consultar_disponibilidad y ofrece otras horas.
  7. Al confirmar la cita, manda un resumen amable: fecha, hora y motivo, y recuérdale que la atención es en tienda: 3659 Lorna Rd, Suite 157, Hoover, AL.
- Parámetro "servicio" de crear_cita: usa exactamente "Reparacion" si el motivo es reparar o diagnosticar un equipo, "Mantenimiento" si es mantenimiento o limpieza, y "Consulta" para cualquier otra cosa (dudas, compra de equipo, ver un equipo). El detalle del motivo (equipo, modelo, falla) ponlo en "notas".

REGLAS IMPORTANTES:
- Los clientes escriben con errores de ortografía, abreviaturas y mensajes muy cortos ("si confirma con un accesor", "ok dale", "sip"). Interprétalos SIEMPRE por el contexto de la conversación. NUNCA digas que el mensaje "se cortó" ni pidas que lo repitan si es razonablemente interpretable.
- Cuando el cliente acepte una propuesta tuya (agendar, que le confirmes algo con el técnico/proveedor/supervisor, ver un equipo), ACTÚA DE INMEDIATO con la información que ya tienes. PROHIBIDO volver a preguntar "¿sobre qué tema?" o datos que el cliente ya te dio — retoma el contexto y sigue adelante.
- NO EXISTE NINGÚN ASESOR: PROHIBIDO usar la palabra "asesor" en cualquier forma ("el asesor", "un asesor te atiende", "se lo pregunto al asesor", "te lo confirmo con el asesor"). Aunque la conversación anterior mencione un asesor, tú ya no lo mencionas jamás. Todo lo que no resuelves va con el SUPERVISOR (o el TÉCNICO, solo para diagnósticos y precios de reparación).
- Cuando algo necesite confirmación humana, la frase correcta es SIEMPRE: "déjame le pregunto al supervisor y te dejo saber en cuanto me confirme". Nada de "te lo paso al asesor" ni "ya te va a atender".
- Al usar solicitar_humano, escribe en "motivo" el contexto completo para el supervisor: qué busca o necesita el cliente y qué hay que confirmarle (ej. "Busca laptop HP; confirmar si llegarán otros modelos de laptops pronto"). Después dile al cliente algo natural como "va, déjame le aviso al supervisor y te dejo saber en cuanto me responda". TÚ le avisas al cliente; nadie más le va a escribir.
- Si el cliente pide hablar con una persona, con el supervisor, con el dueño o el manager, está muy molesto, o el caso es complejo (garantías disputadas, equipo mojado con datos críticos, etc.), usa la herramienta solicitar_humano y dile que le vas a avisar al supervisor y que tú mismo le dejas saber cuando te responda.
- Si el cliente pide que le preguntes algo al técnico o al proveedor (precio de una reparación, disponibilidad de un modelo, tiempo de entrega), usa solicitar_humano igual: tú no inventas la respuesta, pero tampoco dejes la conversación colgada — confirma que ya pasaste la pregunta y que le dejas saber en cuanto te confirmen.
- Nunca inventes precios, promociones ni disponibilidad. Si no sabes algo, dilo con honestidad y ofrece consultarlo con el supervisor.`;
}

// Definición de herramientas para el modelo.
const HERRAMIENTAS = [
  {
    type: 'function',
    function: {
      name: 'consultar_disponibilidad',
      description: 'Consulta los horarios libres para citas en un día, según el sistema de citas del sitio web. Usar SIEMPRE antes de proponer horarios al cliente.',
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'Fecha a consultar en formato YYYY-MM-DD' }
        },
        required: ['fecha']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'crear_cita',
      description: 'Agenda una cita para el cliente en el sistema de citas del sitio web. Solo llamar cuando ya se tienen nombre, servicio, fecha, hora (elegida de la disponibilidad) y el cliente confirmó.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre completo del cliente' },
          servicio: { type: 'string', description: 'Tipo de servicio: "Reparacion", "Mantenimiento" o "Consulta"' },
          fecha: { type: 'string', description: 'Fecha de la cita en formato YYYY-MM-DD' },
          hora: { type: 'string', description: 'Hora exacta en formato 24h HH:MM (una de las horas libres consultadas)' },
          telefono: { type: 'string', description: 'Teléfono del cliente (opcional; si no se da se usa el de este chat de WhatsApp)' },
          correo: { type: 'string', description: 'Correo electrónico del cliente (opcional)' },
          notas: { type: 'string', description: 'Detalle del motivo: equipo, modelo, falla, etc. (opcional)' }
        },
        required: ['nombre', 'servicio', 'fecha', 'hora']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'solicitar_humano',
      description: 'Escala la conversación al supervisor (el dueño) cuando el cliente pide hablar con una persona, con el supervisor, o el caso es complejo.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo por el que se solicita atención humana' }
        },
        required: ['motivo']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enviar_fotos',
      description: 'Envía al cliente, por este mismo chat, las fotos publicadas en el sitio web de un modelo de producto. Usar SIEMPRE que el cliente pida fotos, fotitos o pictures de un producto.',
      parameters: {
        type: 'object',
        properties: {
          producto: { type: 'string', description: 'Modelo del producto, ej: "macbook air 13", "iphone 15 pro", "iphone 16 pro"' }
        },
        required: ['producto']
      }
    }
  }
];

/**
 * Normaliza el servicio a los valores que usa el sitio web.
 */
function normalizarServicio(servicio) {
  const s = (servicio || '').toLowerCase();
  if (s.includes('repar')) return 'Reparacion';
  if (s.includes('manten')) return 'Mantenimiento';
  return 'Consulta';
}

/**
 * Ejecuta una herramienta llamada por el modelo.
 * Devuelve el string que se envía de vuelta al modelo como resultado.
 */
async function ejecutarHerramienta(nombre, args, contexto) {
  const { telefono, sock } = contexto;

  if (nombre === 'consultar_disponibilidad') {
    const slots = await consultarSlots(args.fecha);
    if (slots === null) {
      return 'No se pudo consultar la disponibilidad en línea (error de conexión). Pide disculpas y ofrece intentarlo de nuevo en un momento, o que el supervisor confirme por teléfono.';
    }
    if (slots.length === 0) {
      return `No hay horarios libres el ${args.fecha} (día cerrado o lleno; recuerda que los domingos no se atiende). Ofrece consultar otro día.`;
    }
    return `Horarios libres el ${args.fecha}: ${slots.join(', ')}. Ofrece estas horas al cliente (formato 12h amigable).`;
  }

  if (nombre === 'crear_cita') {
    const telefonoCliente = (args.telefono || telefono || '').replace(/\D/g, '');
    const correo = (args.correo || '').trim();
    const servicio = normalizarServicio(args.servicio);

    const resultadoWeb = await crearCitaWeb({
      nombre: args.nombre,
      telefono: telefonoCliente,
      correo,
      servicio,
      fecha: args.fecha,
      hora: args.hora
    });

    if (resultadoWeb.ok) {
      // Respaldo local/auditoría de la cita ya registrada en el sistema web.
      const cita = guardarCita({
        nombre: args.nombre,
        servicio,
        fecha: args.fecha,
        hora: args.hora,
        notas: args.notas,
        telefono: telefonoCliente,
        correo,
        registradaWeb: true
      });
      await notificarDueno(
        sock,
        `📅 *Nueva cita agendada* ✅ registrada en el sistema web\n` +
        `👤 Cliente: ${cita.nombre}\n` +
        `🔧 Servicio: ${cita.servicio}\n` +
        `🗓️ Fecha: ${cita.fecha} a las ${cita.hora}\n` +
        (cita.notas ? `📝 Notas: ${cita.notas}\n` : '') +
        (correo ? `✉️ Correo: ${correo}\n` : '') +
        `📞 Tel: ${telefonoCliente}`
      );
      return `Cita registrada en el sistema web con id local ${cita.id}. Confírmale la cita con un resumen amable y recuérdale que la atención es en tienda (3659 Lorna Rd, Suite 157, Hoover, AL).`;
    }

    if (resultadoWeb.status === 409) {
      return 'Ese horario acaba de ocuparse y ya no está disponible. Usa consultar_disponibilidad de nuevo para ese día y ofrece al cliente otra hora libre.';
    }

    if (resultadoWeb.status !== null) {
      // El servidor rechazó la cita (validación): no se guarda nada, el modelo debe corregir.
      return `El sistema de citas rechazó la solicitud: ${resultadoWeb.motivo}. Corrige los datos con el cliente (recuerda: no domingos, no fechas pasadas, citas de hoy con al menos 1 hora de anticipación) e inténtalo de nuevo.`;
    }

    // Error de red: se guarda solo local y se avisa al dueño.
    const cita = guardarCita({
      nombre: args.nombre,
      servicio,
      fecha: args.fecha,
      hora: args.hora,
      notas: args.notas,
      telefono: telefonoCliente,
      correo,
      registradaWeb: false
    });
    await notificarDueno(
      sock,
      `📅 *Nueva cita agendada* ⚠️ SOLO registrada localmente (no se pudo conectar al sistema web: ${resultadoWeb.motivo})\n` +
      `👤 Cliente: ${cita.nombre}\n` +
      `🔧 Servicio: ${cita.servicio}\n` +
      `🗓️ Fecha: ${cita.fecha} a las ${cita.hora}\n` +
      (cita.notas ? `📝 Notas: ${cita.notas}\n` : '') +
      (correo ? `✉️ Correo: ${correo}\n` : '') +
      `📞 Tel: ${telefonoCliente}`
    );
    return `La cita quedó registrada localmente (id ${cita.id}) pero el sistema en línea no respondió; el equipo confirmará la cita con el cliente. Confirma al cliente con un resumen amable y dile que recibirá confirmación del negocio.`;
  }

  if (nombre === 'solicitar_humano') {
    await notificarDueno(
      sock,
      `🚨 *Piden hablar con el SUPERVISOR*\n` +
      `📞 Cliente: ${telefono}\n` +
      `❗ Motivo: ${args.motivo}`
    );
    return 'Se notificó al supervisor. Indica al cliente que tú mismo le dejas saber en cuanto te responda.';
  }

  if (nombre === 'enviar_fotos') {
    const normalizar = (s) => String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
    const buscado = normalizar(args.producto);
    const clave = Object.keys(config.fotos).find((k) => {
      const kn = normalizar(k);
      const nn = normalizar(config.fotos[k].nombre);
      return kn === buscado || nn === buscado || nn.includes(buscado) || buscado.includes(kn);
    });
    if (!clave) {
      const disponibles = Object.values(config.fotos).map((f) => f.nombre).join(', ');
      return `No hay fotos registradas de "${args.producto}". Modelos con fotos disponibles: ${disponibles}. Dile al cliente con naturalidad que de ese modelo no tienes fotos a la mano y ofrece que el supervisor se las comparta.`;
    }
    const { sock, jid } = contexto;
    if (!sock || !jid) {
      return `Simulación: se enviarían ${config.fotos[clave].fotos.length} fotos de ${config.fotos[clave].nombre} (canal no disponible en esta prueba).`;
    }
    const info = config.fotos[clave];
    try {
      for (let i = 0; i < info.fotos.length; i++) {
        await sock.sendMessage(jid, {
          image: { url: info.fotos[i] },
          caption: i === 0 ? `📸 ${info.nombre}` : undefined
        });
        await new Promise((r) => setTimeout(r, 900));
      }
      return `Se enviaron ${info.fotos.length} fotos de ${info.nombre} al cliente. Avísale en un mensaje corto y natural de que ahí van las fotos.`;
    } catch (err) {
      console.error(`[ai] Error al enviar fotos: ${err.message}`);
      return `Error técnico al enviar las fotos (${err.message}). Pide disculpas y ofrece que el supervisor las comparta por aquí.`;
    }
  }

  return `Herramienta desconocida: ${nombre}`;
}

// Limpieza periódica de sesiones inactivas (>24h).
function limpiarSesiones() {
  const ahora = Date.now();
  for (const [jid, sesion] of historiales) {
    if (ahora - sesion.ultimaActividad > SESION_EXPIRA_MS) {
      historiales.delete(jid);
    }
  }
}
setInterval(limpiarSesiones, 60 * 60 * 1000).unref();

// Restaurar conversaciones previas (aquí ya existe construirSystemPrompt).
cargarHistoriales();

export function iaDisponible() {
  return cliente !== null;
}

/**
 * Genera una respuesta del asistente para el mensaje de un usuario,
 * manteniendo historial por usuario y ejecutando tool calls si el modelo los pide.
 *
 * @param {string} jid - JID del usuario (identificador de la conversación).
 * @param {string} textoUsuario - Mensaje de texto del usuario.
 * @param {{telefono: string, sock: object}} contexto - Datos para las herramientas.
 * @returns {Promise<string>} Texto de respuesta para enviar por WhatsApp.
 */
export async function responder(jid, textoUsuario, contexto) {
  if (!cliente) {
    throw new Error('LLM no configurado (falta OPENAI_API_KEY)');
  }

  let sesion = historiales.get(jid);
  if (!sesion) {
    sesion = {
      mensajes: [{ role: 'system', content: construirSystemPrompt() }],
      ultimaActividad: Date.now()
    };
    historiales.set(jid, sesion);
  }
  sesion.ultimaActividad = Date.now();
  sesion.mensajes.push({ role: 'user', content: textoUsuario });

  // Loop de tool calling: el modelo puede pedir herramientas varias veces
  // antes de dar la respuesta final en texto.
  const MAX_ITERACIONES = 5;
  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const respuesta = await cliente.chat.completions.create({
      model: config.openai.model,
      messages: sesion.mensajes,
      tools: HERRAMIENTAS,
      tool_choice: 'auto'
    });
    registrarUso(respuesta.usage);

    const mensaje = respuesta.choices[0].message;
    sesion.mensajes.push(mensaje);

    if (!mensaje.tool_calls || mensaje.tool_calls.length === 0) {
      // Respuesta final: recortar historial si es muy largo.
      const system = sesion.mensajes[0];
      let resto = sesion.mensajes.slice(1);
      if (resto.length > LIMITE_HISTORIAL) {
        resto = resto.slice(-LIMITE_HISTORIAL);
      }
      sesion.mensajes = [system, ...resto];
      persistirHistoriales();
      return mensaje.content || 'Un momento, enseguida te atiendo. 🙏';
    }

    // Ejecutar cada herramienta y devolver el resultado al modelo.
    for (const toolCall of mensaje.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        console.error(`[ai] Argumentos inválidos de ${toolCall.function.name}`);
      }
      let resultado;
      try {
        resultado = await ejecutarHerramienta(toolCall.function.name, args, contexto);
      } catch (err) {
        console.error(`[ai] Error en herramienta ${toolCall.function.name}: ${err.message}`);
        resultado = `Error al ejecutar la herramienta: ${err.message}`;
      }
      sesion.mensajes.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultado
      });
    }
  }

  persistirHistoriales();
  return 'Un momento, estoy teniendo problemas para procesar tu solicitud. Ya pasé tu mensaje con el supervisor, te contactamos pronto. 🙏';
}
