import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import RepairDetail, { STATUS_BADGE, statusLabel, REPAIR_STATUS } from '../components/RepairDetail.jsx';

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

  // Formulario a página completa (sin modal).
  if (detail) {
    const back = () => { setDetail(null); load(); };
    return (
      <FormPage title={detail.id ? 'Reparación' : 'Nueva reparación'} onBack={back}>
        <RepairDetail ticketId={detail.id} workers={workers} isAdmin onClose={back} onSaved={load} />
      </FormPage>
    );
  }

  return (
    <>
      <div className="section-head">
        <div className="spacer" />
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

      {tickets == null ? <span className="spinner spinner-lg" />
        : shown.length === 0 ? <div className="card"><div className="empty">No hay reparaciones{filter !== 'todos' ? ' en este filtro' : ''}.</div></div>
          : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Equipo</th><th>Cliente</th><th>Estado</th><th>Técnico</th><th>Precio</th><th>Fotos</th></tr></thead>
                <tbody>
                  {shown.map((t) => (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setDetail({ id: t.id })}>
                      <td><strong>{[t.device_brand, t.device_model].filter(Boolean).join(' ') || '—'}</strong>{t.device_serial && <div className="muted" style={{ fontSize: 12 }}>{t.device_serial}</div>}</td>
                      <td>{t.customer_name || '—'}{t.customer_phone && <div className="muted" style={{ fontSize: 12 }}>{t.customer_phone}</div>}</td>
                      <td><span className={'badge ' + STATUS_BADGE[t.status]}>{statusLabel(t.status)}</span></td>
                      <td className="muted">{t.assignee_username || '—'}</td>
                      <td>{money(t.final_price != null ? t.final_price : t.quoted_price)}</td>
                      <td className="muted">{t.photo_count > 0 ? `📷 ${t.photo_count}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </>
  );
}
