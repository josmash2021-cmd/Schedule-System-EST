/* Encabezado común de las páginas del panel (diseño nuevo, 2026-11-26):
   título + frase corta de cómo va ("2 por enviar · 1 en camino") a la
   izquierda; a la derecha el buscador (opcional) y las acciones (un solo
   botón negro principal + <MoreMenu> para lo peligroso). */
export default function PageHead({ title, sub, search, onSearch, searchPlaceholder = 'Buscar…', children }) {
  return (
    <div className="ph">
      <div className="ph-txt">
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      <div className="ph-act">
        {onSearch && (
          <input className="ph-search" type="search" value={search || ''} placeholder={searchPlaceholder}
            onChange={(e) => onSearch(e.target.value)} aria-label={searchPlaceholder} />
        )}
        {children}
      </div>
    </div>
  );
}
