// Gráfico de barras SVG simple (sin dependencias). Las barras crecen con
// animación escalonada. Cada columna puede ser clicable (onDay recibe la
// clave del punto, p. ej. YYYY-MM-DD). `highlight` resalta una clave (hoy).
export default function BarChart({ data, keys, labels, format, onDay, highlight, height }) {
  const W = 560;
  const H = height || 150;
  const TOP = 24;
  const BOTTOM = 24;
  const max = Math.max(...data, 1);
  const slot = W / data.length;
  // Velas delgadas: la gráfica ocupa todo el ancho sin verse gigante.
  const bw = Math.min(26, slot * 0.4);
  // Radio proporcional: las velas delgadas (vista de mes) quedan casi
  // cuadradas, no redondas como píldoras.
  const rx = Math.min(6, Math.max(2, bw * 0.28));
  // Con muchas barras (vista de mes) el valor va con letra más chica para
  // que no se amontone; el tooltip <title> siempre está disponible.
  const valSize = slot >= 44 ? 11 : 9.5;
  // Los números del eje caben todos (máx. 31 días); solo se saltan si hay
  // una cantidad extrema de barras.
  const lblEvery = data.length > 40 ? 2 : 1;
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
              <rect className={'bar' + (isHi ? ' bar-today' : '')} x={x} y={y} width={bw} height={h} rx={rx}
                style={{ animationDelay: `${i * 45}ms` }} />
            )}
            {v > 0 && (
              <text className="bar-val" x={x + bw / 2} y={y - 7} textAnchor="middle"
                style={{ fontSize: valSize, animationDelay: `${i * 45 + 200}ms` }}>{format(v)}</text>
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
