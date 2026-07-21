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
  return async function usar(fn) {
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
  };
}

// Llamadas concurrentes a la API de IA (Kimi). Conservador: 4 por defecto,
// configurable con IA_CONCURRENCIA en .env.
export const usarIA = crearSemaforo(Number(process.env.IA_CONCURRENCIA) || 4);
