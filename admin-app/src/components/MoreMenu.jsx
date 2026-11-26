import { useEffect, useRef, useState } from 'react';

/* Botón "⋯" con acciones secundarias o peligrosas ("Eliminar todas",
   "Borrar todas las ventas"): nunca al lado del botón principal.
   items: [{ label, onClick, danger?, disabled? }] */
export default function MoreMenu({ items, title = 'Más opciones' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [open]);
  const visibles = (items || []).filter(Boolean);
  if (!visibles.length) return null;
  return (
    <div className="more" ref={ref}>
      <button type="button" className="more-btn" aria-label={title} title={title} aria-expanded={open}
        onClick={() => setOpen((v) => !v)}>⋯</button>
      {open && (
        <div className="more-menu" role="menu">
          {visibles.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled}
              className={'more-item' + (it.danger ? ' more-danger' : '')}
              onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
