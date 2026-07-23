// Concurrencia para alto volumen de clientes:
// - Cola por chat: los mensajes de un mismo cliente se procesan en orden.
// - Paralelismo entre chats: 50 clientes no se bloquean entre sí.
// - Semáforo global de IA: limita llamadas simultáneas a la API para no
//   reventar la cuota (429) ni colgar el proceso.

const colas = new Map(); // jid -> Promise (cadena de tareas)

/**
 * Encola una tarea para un chat. Las tareas del mismo chat corren en serie;
 * las de chats distintos, en paralelo. Los errores quedan aislados por chat.
 */
export function encolar(jid, tarea) {
  const anterior = colas.get(jid) || Promise.resolve();
  const actual = anterior.then(tarea).catch((err) => {
    console.error(`[cola] Error procesando mensaje de ${jid}: ${err.message}`);
  });
  colas.set(jid, actual);
  // Limpieza: cuando la cadena termina, liberar la entrada del mapa.
  actual.finally(() => {
    if (colas.get(jid) === actual) colas.delete(jid);
  });
  return actual;
}

/** Número de chats con tareas en cola o en proceso (diagnóstico). */
export function chatsEnCola() {
  return colas.size;
}

function crearSemaforo(max) {
  let activos = 0;
  const esperando = [];
  return {
    usar: async function (fn) {
      if (activos >= max) {
        await new Promise((resolve) => esperando.push(resolve));
      }
      activos++;
      try {
        return await fn();
      } finally {
        activos--;
        const siguiente = esperando.shift();
        if (siguiente) siguiente();
      }
    },
    // Slots libres en este instante (para el modo silencioso: si no hay,
    // el cliente no ve ni "leído" ni "escribiendo" hasta que se desocupe).
    libres: () => Math.max(0, max - activos)
  };
}

// Llamadas concurrentes a la API de IA (Kimi). Configurable con
// IA_CONCURRENCIA en .env (8 en producción).
const semaforoIA = crearSemaforo(Number(process.env.IA_CONCURRENCIA) || 8);
export const usarIA = semaforoIA.usar;

// true si hay al menos un "agente" (slot de IA) libre ahora mismo.
export function slotsIALibres() {
  return semaforoIA.libres() > 0;
}
