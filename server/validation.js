function sanitize(str) {
  return String(str ?? '').trim();
}

function validateCreate(data) {
  const errors = [];
  const nombre = sanitize(data.nombre);
  const telefono = sanitize(data.telefono);
  const correo = sanitize(data.correo);
  const servicio = sanitize(data.servicio);
  const fecha = sanitize(data.fecha);
  const hora = sanitize(data.hora);

  if (!nombre) errors.push('El nombre es obligatorio.');
  if (!telefono) errors.push('El teléfono es obligatorio.');
  if (!servicio) errors.push('El servicio es obligatorio.');
  if (!fecha) errors.push('La fecha es obligatoria.');
  if (!hora) errors.push('La hora es obligatoria.');

  return { errors, nombre, telefono, correo, servicio, fecha, hora };
}

module.exports = { validateCreate };
