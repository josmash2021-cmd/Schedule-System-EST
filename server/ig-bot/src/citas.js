// Almacenamiento simple de citas en un archivo JSON (data/citas.json).
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import config from './config.js';

function leerCitas(ruta) {
  if (!existsSync(ruta)) return [];
  try {
    const data = JSON.parse(readFileSync(ruta, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[citas] No se pudo leer ${ruta}: ${err.message}`);
    return [];
  }
}

function escribirCitas(ruta, citas) {
  mkdirSync(path.dirname(ruta), { recursive: true });
  // Escritura atómica: se escribe a un archivo temporal y se renombra,
  // para no dejar el JSON corrupto si el proceso se interrumpe a medias.
  const tmp = `${ruta}.tmp`;
  writeFileSync(tmp, JSON.stringify(citas, null, 2), 'utf8');
  renameSync(tmp, ruta);
}

/**
 * Guarda una cita nueva y devuelve el objeto creado.
 * @param {{nombre: string, servicio: string, fecha: string, hora: string, notas?: string, telefono: string, correo?: string, registradaWeb?: boolean}} cita
 * @param {string} [ruta] - Ruta del archivo JSON (por defecto data/citas.json).
 */
export function guardarCita(cita, ruta = config.citasPath) {
  const citas = leerCitas(ruta);
  const nueva = {
    id: randomUUID(),
    creadaEn: new Date().toISOString(),
    nombre: cita.nombre,
    servicio: cita.servicio,
    fecha: cita.fecha,
    hora: cita.hora,
    notas: cita.notas || '',
    telefono: cita.telefono,
    correo: cita.correo || '',
    registradaWeb: cita.registradaWeb === true
  };
  citas.push(nueva);
  escribirCitas(ruta, citas);
  return nueva;
}

/**
 * Lista todas las citas guardadas.
 * @param {string} [ruta] - Ruta del archivo JSON (por defecto data/citas.json).
 */
export function listarCitas(ruta = config.citasPath) {
  return leerCitas(ruta);
}
