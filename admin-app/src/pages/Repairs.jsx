import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import RepairDetail, { REPAIR_STATUS } from '../components/RepairDetail.jsx';

const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

// Fecha de negocio (America/Chicago) como clave YYYY-MM-DD.
function chicagoKey(date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

function FilterPill({ v, cur, set, label }) {
  return <button className={'btn btn-sm ' + (cur === v ? 'btn-primary' : 'btn-secondary')} onClick={() => set(v)}>{label}</button>;
}

export default function Repairs() {
  const navigate = useNavigate();
  // Permite llegar con ?entregado=YYYY-MM-DD (desde el gráfico de ventas del Dashboard).
  const [searchParams] = useSearchParams();
  const dayParam = searchParams.get('entregado');
  const dayFilter = /^\d{4}-\d{2}-\d{2}$/.test(dayParam || '') ? dayParam : null;
  const [tickets, setTickets] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState(dayFilter ? 'entregado' : 'activos');
  const [detail, setDetail] = useState(null); // { id } | { id: null }
  const [sel, setSel] = useState(() => new Set()); // ids marcados para borrar
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false); // el formulario se despide animado

  const load = useCallback(() => {
    setErr('');
    api('/repairs').then((d) => setTickets(d.tickets)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    api('/users').then((d) => setWorkers(d.users.filter((u) => u.active))).catch(() => {});
  }, [load]);

  const shown = tickets ? tickets.filter((t) => {
    if (dayFilter && chicagoKey(new Date(t.delivered_at || 0)) !== dayFilter) return false;
    if (filter === 'todos') return true;
    if (filter === 'activos') return t.status !== 'entregado';
    return t.status === filter;
  }) : [];

  // Al cambiar de filtro se limpia la selección: así nunca se borra algo que
  // ya no está a la vista.
  useEffect(() => { setSel(new Set()); }, [filter, dayFilter]);

  const toggle = (id) => setSel((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allShownSelected = shown.length > 0 && shown.every((t) => sel.has(t.id));
  const toggleAllShown = () => setSel((prev) => {
    const n = new Set(prev);
    for (const t of shown) { if (allShownSelected) n.delete(t.id); else n.add(t.id); }
    return n;
  });

  const removeSelected = async () => {
    const ids = [...sel];
    if (!ids.length) return;
    if (!window.confirm(`¿Eliminar ${ids.length} reparación${ids.length === 1 ? '' : 'es'}? También se borran sus fotos. No se puede deshacer.`)) return;
    setBusy(true); setErr('');
    try {
      await api('/repairs', { method: 'DELETE', body: { ids } });
      setSel(new Set());
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Cambiar el estado directo desde la lista (mismas opciones que la ficha).
  const setEstado = async (t, status) => {
    setErr('');
    try {
      await api('/repairs/' + t.id, { method: 'PATCH', body: { status } });
      setTickets((list) => list.map((x) => (x.id === t.id
        ? { ...x, status, delivered_at: status === 'entregado' ? new Date().toISOString() : null }
        : x)));
    } catch (e) { setErr(e.message); }
  };

  const removeAll = async () => {
    const n = tickets ? tickets.length : 0;
    if (!n) return;
    if (!window.confirm(`¿Eliminar TODAS las reparaciones (${n})?\n\nSe borran también sus fotos y las ventas de la página de Ventas, que salen de las reparaciones entregadas. No se puede deshacer.`)) return;
    if (!window.confirm('Última confirmación: se van a borrar TODAS las reparaciones.')) return;
    setBusy(true); setErr('');
    try {
      await api('/repairs', { method: 'DELETE', body: { all: true } });
      setSel(new Set());
      load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Formulario a página completa (sin modal). Al guardar o cerrar, la página
  // del formulario se desvanece y la lista entra con su animación de siempre.
  if (detail) {
    const back = () => { setDetail(null); setExiting(false); load(); };
    const animBack = () => { setExiting(true); setTimeout(back, 260); };
    return (
      <div className={exiting ? 'page-exit' : undefined}>
        <FormPage title={detail.id ? 'Reparación' : 'Nueva reparación'} onBack={animBack}>
          <RepairDetail ticketId={detail.id} workers={workers} isAdmin
            onClose={animBack} onSaved={load} onCreated={animBack} />
        </FormPage>
      </div>
    );
  }

  return (
    <>
      <div className="section-head">
        <div className="spacer" />
        {tickets != null && tickets.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={removeAll} disabled={busy}>Eliminar todas</button>
        )}
        <button className="btn btn-primary" onClick={() => setDetail({ id: null })}>+ Nueva reparación</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <FilterPill v="activos" cur={filter} set={setFilter} label="Activas" />
        {REPAIR_STATUS.map((s) => <FilterPill key={s.v} v={s.v} cur={filter} set={setFilter} label={s.l} />)}
        <FilterPill v="todos" cur={filter} set={setFilter} label="Todas" />
      </div>

      {dayFilter && (
        <div className="row" style={{ gap: 10, marginBottom: 16 }}>
          <span className="badge badge-on">Entregadas el {dayFilter}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/reparaciones')}>Quitar filtro de fecha</button>
        </div>
      )}

      {sel.size > 0 && (
        <div className="row" style={{ gap: 10, marginBottom: 16, alignItems: 'center' }}>
          <strong style={{ fontSize: 14 }}>{sel.size} seleccionada{sel.size === 1 ? '' : 's'}</strong>
          <button className="btn btn-danger btn-sm" onClick={removeSelected} disabled={busy}>
            {busy ? <span className="spinner" /> : 'Eliminar seleccionadas'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSel(new Set())} disabled={busy}>Quitar selección</button>
        </div>
      )}

      {tickets == null ? <span className="spinner spinner-lg" />
        : shown.length === 0 ? <div className="card"><div className="empty">No hay reparaciones{filter !== 'todos' ? ' en este filtro' : ''}.</div></div>
          : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 34 }}>
                    <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown}
                      title="Seleccionar todas las de la lista" style={{ cursor: 'pointer' }} />
                  </th>
                  <th>Equipo</th><th>Cliente</th><th>Estado</th><th className="hide-sm">Técnico</th><th>Precio</th><th className="hide-sm">Fotos</th>
                </tr></thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetail({ id: t.id })}>
                      <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                        <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td><strong>{[t.device_brand, t.device_model].filter(Boolean).join(' ') || '—'}</strong>{t.device_serial && <div className="muted" style={{ fontSize: 12 }}>{t.device_serial}</div>}</td>
                      <td>{t.customer_name || '—'}{t.customer_phone && <div className="muted" style={{ fontSize: 12 }}>{t.customer_phone}</div>}</td>
                      <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                        <select className="estado-select" value={t.status} onChange={(e) => setEstado(t, e.target.value)}>
                          {REPAIR_STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                        </select>
                      </td>
                      <td className="muted hide-sm">{t.assignee_username || '—'}</td>
                      <td>{money(t.final_price != null ? t.final_price : t.quoted_price)}</td>
                      <td className="muted hide-sm">{t.photo_count > 0 ? `📷 ${t.photo_count}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </>
  );
}
