// Reporte de consumo de la API de IA: lee data/uso-api.json (lo escribe src/ai.js
// en cada llamada) y muestra totales por día. Uso: npm run uso
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const USO_PATH = path.join(ROOT, 'data', 'uso-api.json');

if (!existsSync(USO_PATH)) {
  console.log('Todavía no hay registros de uso (se crean cuando el bot responde mensajes).');
  process.exit(0);
}

const registros = JSON.parse(readFileSync(USO_PATH, 'utf8'));
const porDia = {};
for (const r of registros) {
  const dia = String(r.t).slice(0, 10);
  porDia[dia] ??= { llamadas: 0, prompt: 0, completion: 0, razonamiento: 0 };
  porDia[dia].llamadas++;
  porDia[dia].prompt += r.prompt || 0;
  porDia[dia].completion += r.completion || 0;
  porDia[dia].razonamiento += r.razonamiento || 0;
}

console.log('Consumo de API del bot (tokens):\n');
let tL = 0, tP = 0, tC = 0;
for (const [dia, d] of Object.entries(porDia).sort()) {
  const total = (d.prompt + d.completion).toLocaleString('en-US');
  console.log(`${dia}  ${d.llamadas} llamadas | ${total} tokens (entrada ${d.prompt.toLocaleString('en-US')} + salida ${d.completion.toLocaleString('en-US')})`);
  tL += d.llamadas; tP += d.prompt; tC += d.completion;
}
console.log(`\nTOTAL: ${tL} llamadas | ${(tP + tC).toLocaleString('en-US')} tokens`);
console.log('\nCon tu membresía Kimi Code este consumo NO tiene costo en dólares:');
console.log('descuenta de la cuota semanal del plan (revísala en kimi.com/code/console).');
