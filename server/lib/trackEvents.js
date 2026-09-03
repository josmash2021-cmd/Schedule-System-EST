/* Bus en memoria para avisos de cambio de estado de órdenes.
   track.html abre un stream SSE por pedido; cuando el webhook de AfterShip
   (o el job, o el panel) actualiza la orden, se emite 'update' con el id y
   los clientes conectados se refrescan al instante. */
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(0); // muchos clientes SSE simultáneos, sin límite artificial

module.exports = bus;
