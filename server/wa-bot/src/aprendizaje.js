// Auto-mejora de Angela: una vez al día analiza las conversaciones recientes
// con la propia IA, extrae inteligencia de clientes (temas frecuentes,
// modelos buscados, preguntas sin respuesta) y la guarda en
// config/aprendizaje.json. Esa nota se inyecta al prompt, así Angela se hace
// más preciso para este negocio con el tiempo. También envía un resumen
// diario al dueño con lo que no supo responder (para mejorar el catálogo).
import OpenAI from 'openai';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import config from './config.js';
import { notificarDueno } from './notificar.js';
import { usarIA } from './cola.js';

const RUTA_NOTAS = path.join(config.root, 'config', 'aprendizaje.json');
const RUTA_CONVERSACIONES = path.join(config.dataDir, 'conversaciones.json');
const RUTA_ESTADO = path.join(config.dataDir, 'aprendizaje-estado.json');
const HORA_DIARIA = 19; // 7 p.m. hora del negocio (America/Chicago)
const VENTANA_MS = 24 * 60 * 60 * 1000;

let cliente = null;
if (config.openai.apiKey) {
  cliente = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseURL });
}

function leerJson(ruta, defecto) {
  try {
    return existsSync(ruta) ? JSON.parse(readFileSync(ruta, 'utf8')) : defecto;
  } catch {
    return defecto;
  }
}

function escribirJson(ruta, datos) {
  mkdirSync(path.dirname(ruta), { recursive: true });
  const tmp = `${ruta}.tmp`;
  writeFileSync(tmp, JSON.stringify(datos, null, 2));
  renameSync(tmp, ruta);
}

function horaNegocio() {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', hour12: false
  }).format(new Date()));
}

function hoyNegocio() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function construirTranscripts() {
  const sesiones = leerJson(RUTA_CONVERSACIONES, []);
  const ahora = Date.now();
  const transcripts = [];
  for (const [jid, sesion] of sesiones) {
    if (!sesion?.mensajes?.length) continue;
    if (ahora - (sesion.ultimaActividad || 0) > VENTANA_MS) continue;
    const lineas = sesion.mensajes
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-12)
      .map((m) => `${m.role === 'user' ? 'Cliente' : 'Angela'}: ${String(m.content || '').slice(0, 300)}`)
      .join('\n');
    if (lineas) {
      transcripts.push(`--- Chat ${String(jid).split('@')[0]} ---\n${lineas}`.slice(0, 2000));
    }
  }
  return transcripts;
}

/**
 * Ejecuta el análisis de auto-mejora. Devuelve true si generó notas nuevas.
 */
export async function ejecutarAprendizaje(sock) {
  if (!cliente) return false;
  const transcripts = construirTranscripts();
  if (!transcripts.length) {
    console.log('[aprendizaje] Sin conversaciones recientes que analizar.');
    return false;
  }
  try {
    const r = await usarIA(() => cliente.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: 'Eres un analista de conversaciones. Respondes SOLO con JSON válido, sin markdown ni explicaciones.' },
        {
          role: 'user',
          content: (
            `Analiza estas conversaciones de WhatsApp entre clientes y "Angela", el encargado (bot) de una tienda que repara y vende laptops, tablets y iPhones en Hoover, Alabama.\n\n` +
            `Responde SOLO JSON válido con esta forma exacta:\n` +
            `{"notas": ["..."], "preguntas_sin_respuesta": ["..."], "resumen": "..."}\n\n` +
            `- notas (máx 6): inteligencia útil para el negocio — temas más preguntados, modelos que buscan, dudas o quejas repetidas, objeciones de precio. Frases cortas. SIN precios inventados ni datos personales (ni nombres ni teléfonos).\n` +
            `- preguntas_sin_respuesta (máx 6): dudas concretas que Angela no pudo responder o tuvo que escalar al supervisor.\n` +
            `- resumen: una línea general.\n\n` +
            `CONVERSACIONES:\n${transcripts.join('\n\n')}`
          ).slice(0, 12000)
        }
      ]
    }));

    const texto = r.choices[0].message.content || '';
    const match = texto.match(/\{[\s\S]*\}/);
    const datos = match ? JSON.parse(match[0]) : null;
    if (!datos) throw new Error('la IA no devolvió JSON válido');

    const notasNuevas = Array.isArray(datos.notas) ? datos.notas.slice(0, 6) : [];
    const previo = leerJson(RUTA_NOTAS, { notas: [] });
    // Conserva notas anteriores (máx 15), nuevas primero, sin duplicados.
    const combinadas = [...new Set([...notasNuevas, ...(previo.notas || [])])].slice(0, 15);
    escribirJson(RUTA_NOTAS, { actualizado: new Date().toISOString(), notas: combinadas });
    escribirJson(RUTA_ESTADO, { ultimaCorrida: hoyNegocio() });

    const preguntas = Array.isArray(datos.preguntas_sin_respuesta) ? datos.preguntas_sin_respuesta : [];
    await notificarDueno(
      sock,
      `📊 *Resumen diario de Angela* 🤖\n` +
      `💬 Conversaciones analizadas: ${transcripts.length}\n` +
      (datos.resumen ? `🧾 ${datos.resumen}\n` : '') +
      (preguntas.length ? `❓ No supe responder:\n${preguntas.map((p) => `• ${p}`).join('\n')}\n` : '') +
      (notasNuevas.length ? `📝 Notas nuevas que aprendí:\n${notasNuevas.map((n) => `• ${n}`).join('\n')}\n` : '') +
      `(editables en config/aprendizaje.json)`
    );
    console.log(`[aprendizaje] Análisis completado: ${notasNuevas.length} nota(s) nueva(s), ${preguntas.length} pregunta(s) sin respuesta.`);
    return true;
  } catch (err) {
    console.error(`[aprendizaje] Error en el análisis: ${err.message}`);
    return false;
  }
}

let schedulerIniciado = false;

/**
 * Programa el análisis diario (a las 19:00 hora del negocio, revisa cada hora).
 */
export function iniciarAprendizaje(sock) {
  if (schedulerIniciado) return;
  schedulerIniciado = true;

  const revisar = async () => {
    try {
      if (horaNegocio() < HORA_DIARIA) return;
      const estado = leerJson(RUTA_ESTADO, {});
      if (estado.ultimaCorrida === hoyNegocio()) return;
      await ejecutarAprendizaje(sock);
    } catch (err) {
      console.error(`[aprendizaje] Error en el programador: ${err.message}`);
    }
  };

  setInterval(revisar, 60 * 60 * 1000).unref();
  console.log('[aprendizaje] Auto-mejora programada (diaria a las 7 p.m. hora del negocio).');
}
