/* Pestañas con número (diseño nuevo): filtran con un toque.
   tabs: [{ v: 'pendiente', l: 'Por enviar', n: 2 }] — n opcional (se oculta si es 0/null). */
export default function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={'tabs ' + className} role="tablist">
      {tabs.map((t) => (
        <button key={t.v} type="button" role="tab" aria-selected={value === t.v}
          className={'tab' + (value === t.v ? ' on' : '')} onClick={() => onChange(t.v)}>
          {t.l}{t.n ? <b>{t.n}</b> : null}
        </button>
      ))}
    </div>
  );
}
