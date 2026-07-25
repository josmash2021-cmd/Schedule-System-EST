// Vista de formulario a página completa (reemplaza los modales): botón
// "Volver" arriba y el contenido en una tarjeta centrada.
export default function FormPage({ title, onBack, children, max = 640 }) {
  return (
    <>
      <div className="section-head">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Volver</button>
      </div>
      <div className="card" style={{ maxWidth: max, margin: '0 auto' }}>
        <h3>{title}</h3>
        {children}
      </div>
    </>
  );
}
