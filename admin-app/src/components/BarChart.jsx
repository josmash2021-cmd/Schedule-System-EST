// Gráfico de barras SVG simple (sin dependencias). Las barras crecen con
// animación escalonada. Cada columna puede ser clicable (onDay recibe la
// clave del punto, p. ej. YYYY-MM-DD). `highlight` resalta una clave (hoy).
export default function BarChart({ data, keys, labels, format, onDay, highlight }) {
  const W = 560;
  const H = 150;
  const TOP = 24;
  const BOTTOM = 24;
  const max = Math.max(...data, 1);
  const slot = W / data.length;
  // Velas delgadas: la gráfica ocupa todo el ancho sin verse gigante.
  const bw = Math.min(26, slot * 0.4);
  // Con muchas barras las etiquetas chocan: los valores por barra solo se
  // muestran si hay espacio suficiente (si no, el tooltip <title> los da),
  // y las etiquetas del eje se saltan para que no se amontonen.
  const showVals = slot >= 44;
  const lblEvery = Math.max(1, Math.ceil(data.length / 14));
  return (
    <svg className="bar-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de barras">
      {data.map((v, i) => {
        const h = v > 0 ? Math.max(4, ((H - TOP - BOTTOM) * v) / max) : 0;
        const x = slot * i + (slot - bw) / 2;
        const y = H - BOTTOM - h;
        const isHi = keys[i] === highlight;
        return (
          <g key={i} className="bar-col" onClick={() => onDay && onDay(keys[i])}>
            <title>{`${labels[i]}: ${format(v)}`}</title>
            {v > 0 && (
              <rect className={'bar' + (isHi ? ' bar-today' : '')} x={x} y={y} width={bw} height={h} rx="6"
                style={{ animationDelay: `${i * 45}ms` }} />
            )}
            {v > 0 && showVals && (
              <text className="bar-val" x={x + bw / 2} y={y - 7} textAnchor="middle"
                style={{ animationDelay: `${i * 45 + 200}ms` }}>{format(v)}</text>
            )}
            {i % lblEvery === 0 && (
              <text className={'bar-lbl' + (isHi ? ' bar-lbl-today' : '')} x={slot * i + slot / 2} y={H - 8} textAnchor="middle">
                {labels[i]}
              </text>
            )}
            {onDay && <rect className="bar-hit" x={slot * i} y={0} width={slot} height={H} />}
          </g>
        );
      })}
      <line className="bar-axis" x1="0" y1={H - BOTTOM} x2={W} y2={H - BOTTOM} />
    </svg>
  );
}
