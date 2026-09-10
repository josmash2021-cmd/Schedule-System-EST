import { useEffect, useState, useCallback, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import FormPage from '../components/FormPage.jsx';
import RepairDetail, {
  REPAIR_STATUS, STATUS_BADGE, statusLabel, DEVICE_TYPES, deviceTypeLabel, serviceTypeLabel, phoneIntl,
} from '../components/RepairDetail.jsx';

const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));

// Fecha de negocio (America/Chicago) como clave YYYY-MM-DD.
function chicagoKey(date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

// Fecha + hora de negocio, como en Órdenes.
function fmtDay(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function FilterPill({ v, cur, set, label }) {
  return <button className={'btn btn-sm ' + (cur === v ? 'btn-primary' : 'btn-secondary')} onClick={() => set(v)}>{label}</button>;
}

// Plurales para los pills de categoría de equipo.
const DEVICE_PLURAL = { telefono: 'Teléfonos', tablet: 'Tablets', laptop: 'Laptops' };

/* Barra de progreso animada de la reparación (mismo diseño que la barra de
   envío de Órdenes): Recibido → En revisión → En laboratorio de reparación
   y mantenimiento → Listo para recoger. Entregado = barra completa. */
const REPAIR_STEPS = ['Recibido', 'En revisión', 'En laboratorio de reparación y mantenimiento', 'Listo para recoger'];
function repairStep(t) {
  if (t.status === 'entregado') return 5; // barra completa
  return { recibido: 1, diagnostico: 2, reparacion: 3, listo: 4 }[t.status] || 1;
}
function RepairBar({ ticket }) {
  const step = repairStep(ticket);
  // El relleno llega hasta el centro de la columna del paso actual (tope 100%).
  const pct = Math.min(((step - 0.5) / REPAIR_STEPS.length) * 100, 100);
  return (
    <div className="shipbar s4">
      <div className="shipbar-line">
        <div className="shipbar-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="shipbar-steps">
        {REPAIR_STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className={'shipbar-step' + (step >= n ? ' on' : '') + (step === n ? ' current' : '')}>
              <div className="shipbar-dot" />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
      {ticket.status === 'entregado' && (
        <div className="muted" style={{ fontSize: 12, marginTop: 6, textAlign: 'center' }}>Entregado al cliente.</div>
      )}
    </div>
  );
}

/* Estatus del número de rastreo del repuesto (misma barra que el envío de
   Órdenes): sale DEBAJO del estado de la reparación. */
const PART_STEPS = ['Label generado', 'Enviado', 'En tránsito', 'En reparto', 'Delivered'];
function PartShipBar({ ticket }) {
  const step = ticket.tracking_number ? 2 : 1;
  const pct = ((step - 0.5) / PART_STEPS.length) * 100;
  return (
    <div className="shipbar">
      <div className="shipbar-line">
        <div className="shipbar-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="shipbar-steps">
        {PART_STEPS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className={'shipbar-step' + (step >= n ? ' on' : '') + (step === n ? ' current' : '')}>
              <div className="shipbar-dot" />
              <span>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Repairs() {
  // Permite llegar con ?entregado=YYYY-MM-DD (desde el gráfico de ventas del Dashboard).
  const [searchParams] = useSearchParams();
  const dayParam = searchParams.get('entregado');
  const dayFilter = /^\d{4}-\d{2}-\d{2}$/.test(dayParam || '') ? dayParam : null;
  const [tickets, setTickets] = useState(null);
  const [workers, setWorkers] = useState([]);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState(dayFilter ? 'entregado' : 'activos');
  const [deviceFilter, setDeviceFilter] = useState('todas'); // categoría de equipo
  const [detail, setDetail] = useState(null); // { id } | { id: null }
  const [sel, setSel] = useState(() => new Set()); // ids marcados para borrar
  const [busy, setBusy] = useState(false);
  const [exiting, setExiting] = useState(false); // el formulario se despide animado
  const [ok, setOk] = useState('');
  const [invBusy, setInvBusy] = useState(null); // id de ticket con factura en proceso

  // Factura de la reparación: VER el PDF (link público con el track_token) o
  // reenviarla por correo / WhatsApp. Si no existe, el server la crea al
  // vuelo con los datos del ticket.
  const marcarFactura = (t, num) => {
    if (!t.invoice_number && num) {
      setTickets((list) => list.map((x) => (x.id === t.id ? { ...x, invoice_number: num } : x)));
    }
  };
  const verFactura = async (t) => {
    setErr(''); setOk(''); setInvBusy(t.id);
    try {
      const d = await api('/repairs/' + t.id + '/invoice-link', { method: 'POST' });
      marcarFactura(t, d.invoice_number);
      window.open(window.location.origin + d.path, '_blank', 'noopener');
    } catch (e) { setErr(e.message); }
    setInvBusy(null);
  };
  const facturaCorreo = async (t) => {
    setErr(''); setOk(''); setInvBusy(t.id);
    try {
      const d = await api('/repairs/' + t.id + '/send-invoice', { method: 'POST' });
      marcarFactura(t, d.invoice_number);
      setOk(`Factura ${d.invoice_number} enviada a ${t.customer_email}.`);
    } catch (e) { setErr(e.message); }
    setInvBusy(null);
  };
  const facturaWhatsApp = async (t) => {
    setErr(''); setOk(''); setInvBusy(t.id);
    try {
      const d = await api('/repairs/' + t.id + '/invoice-link', { method: 'POST' });
      marcarFactura(t, d.invoice_number);
      const device = [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'equipo';
      const link = window.location.origin + d.path;
      const msg = `Hola${t.customer_name ? ' ' + t.customer_name : ''}, aquí tienes tu factura ${d.invoice_number} de ElectronicST por la reparación de tu ${device} (PDF): ${link}`;
      window.open('https://wa.me/' + phoneIntl(t.customer_phone) + '?text=' + encodeURIComponent(msg), '_blank');
      setOk('Se abrió WhatsApp con el link de la factura listo para enviar.');
    } catch (e) { setErr(e.message); }
    setInvBusy(null);
  };

  const load = useCallback(() => {
    setErr('');
    api('/repairs').then((d) => setTickets(d.tickets)).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    api('/users').then((d) => setWorkers(d.users.filter((u) => u.active))).catch(() => {});
  }, [load]);

  // Filtro por categoría de equipo (teléfonos / tablets / laptops).
  const byDevice = tickets ? tickets.filter((t) => deviceFilter === 'todas' || t.device_type === deviceFilter) : [];

  const shown = byDevice.filter((t) => {
    if (dayFilter && chicagoKey(new Date(t.delivered_at || 0)) !== dayFilter) return false;
    if (filter === 'todos') return true;
    if (filter === 'activos') return t.status !== 'entregado';
    return t.status === filter;
  });

  // Al cambiar de filtro se limpia la selección: así nunca se borra algo que
  // ya no está a la vista.
  useEffect(() => { setSel(new Set()); }, [filter, deviceFilter, dayFilter]);

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
    <div className="orders-page">
      {err && <div className="alert alert-error">{err}</div>}
      {ok && <div className="alert alert-ok">{ok}</div>}

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="muted" style={{ fontSize: 14 }}>
          {tickets == null ? '' : `${tickets.length} reparación${tickets.length === 1 ? '' : 'es'} · ${tickets.filter((t) => t.status !== 'entregado').length} activa${tickets.filter((t) => t.status !== 'entregado').length === 1 ? '' : 's'}`}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {tickets != null && tickets.length > 0 && (
            <button className="btn btn-danger btn-sm" onClick={removeAll} disabled={busy}>Eliminar todas</button>
          )}
          <button className="btn btn-primary" onClick={() => setDetail({ id: null })}>+ Nueva reparación</button>
        </div>
      </div>

      {/* Categoría de equipo */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <FilterPill v="todas" cur={deviceFilter} set={setDeviceFilter} label="Todos los equipos" />
        {DEVICE_TYPES.map((s) => <FilterPill key={s.v} v={s.v} cur={deviceFilter} set={setDeviceFilter} label={DEVICE_PLURAL[s.v]} />)}
      </div>

      {/* Estado */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <FilterPill v="activos" cur={filter} set={setFilter} label="Activas" />
        <FilterPill v="entregado" cur={filter} set={setFilter} label="Entregadas" />
        <FilterPill v="todos" cur={filter} set={setFilter} label="Todas" />
      </div>

      {dayFilter && (
        <div className="row" style={{ gap: 10, marginBottom: 16 }}>
          <span className="badge badge-on">Entregadas el {dayFilter}</span>
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

      {/* Lista con el MISMO diseño que Órdenes: fila + detalle siempre abierto
          y la barra de progreso animada con las etapas de la reparación. */}
      <div className="card">
        <h3>Reparaciones</h3>
        {tickets == null ? <span className="spinner" />
          : shown.length === 0 ? <div className="empty">No hay reparaciones{filter !== 'todos' ? ' en este filtro' : ''}.</div>
            : (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr>
                    <th style={{ width: 34 }}>
                      <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown}
                        title="Seleccionar todas las de la lista" style={{ cursor: 'pointer' }} />
                    </th>
                    <th>Fecha</th><th>Equipo</th><th>Cliente</th><th className="hide-sm">Técnico</th>
                    <th style={{ textAlign: 'right' }}>Precio</th><th>Estado</th>
                  </tr></thead>
                  <tbody>
                    {shown.map((t) => (
                      <Fragment key={t.id}>
                        <tr>
                          <td>
                            <input type="checkbox" checked={sel.has(t.id)} onChange={() => toggle(t.id)} style={{ cursor: 'pointer' }} />
                          </td>
                          <td className="muted">{fmtDay(t.created_at)}</td>
                          <td>
                            <strong>{[t.device_brand, t.device_model].filter(Boolean).join(' ') || '—'}</strong>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {[deviceTypeLabel(t.device_type), serviceTypeLabel(t.service_type)].join(' · ')}{t.device_serial ? ` · ${t.device_serial}` : ''}
                            </div>
                          </td>
                          <td>
                            {t.customer_name || '—'}
                            {t.customer_phone && <div className="muted" style={{ fontSize: 12 }}>{t.customer_phone}</div>}
                          </td>
                          <td className="muted hide-sm">{t.assignee_username || '—'}</td>
                          <td style={{ textAlign: 'right' }}><strong>{money(t.final_price != null ? t.final_price : t.quoted_price)}</strong></td>
                          <td><span className={'badge ' + (STATUS_BADGE[t.status] || '')}>{statusLabel(t.status)}</span></td>
                        </tr>
                        {/* Detalle siempre abierto: toda la info a la vista. */}
                        <tr>
                          <td colSpan="7" style={{ background: '#f8f9fb' }}>
                            <div className="order-detail">
                              <div className="od-col">
                                <div><span className="muted">Cliente:</span> <strong>{t.customer_name || '—'}</strong></div>
                                <div><span className="muted">Teléfono:</span> {t.customer_phone || '—'}</div>
                                <div><span className="muted">Correo:</span> {t.customer_email || '—'}</div>
                              </div>
                              <div className="od-col">
                                <div><span className="muted">Equipo:</span> <strong>{[t.device_brand, t.device_model].filter(Boolean).join(' ') || '—'}</strong></div>
                                <div><span className="muted">Tipo:</span> {deviceTypeLabel(t.device_type)} · {serviceTypeLabel(t.service_type)}</div>
                                <div><span className="muted">Serie / IMEI:</span> {t.device_serial || '—'}</div>
                                <div><span className="muted">Fotos:</span> {t.photo_count > 0 ? `📷 ${t.photo_count}` : 'sin fotos'}</div>
                              </div>
                              <div className="od-col">
                                <div><span className="muted">Problema:</span> {t.problem || '—'}</div>
                                <div><span className="muted">Diagnóstico:</span> {t.diagnosis || '—'}</div>
                                <div>
                                  <span className="muted">Cotizado:</span> {money(t.quoted_price)}
                                  {' · '}
                                  <span className="muted">Final:</span> <strong>{money(t.final_price)}</strong>
                                </div>
                              </div>
                              <div className="od-full" style={{ marginTop: 12 }}>
                                <RepairBar ticket={t} />
                              </div>
                              {/* Estatus del tracking del repuesto, debajo del
                                  estado de la reparación. */}
                              {t.tracking_number && (
                                <div className="od-full" style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 10 }}>
                                  <div className="muted" style={{ fontSize: 12.5, marginBottom: 2 }}>
                                    Repuesto: <strong>{t.tracking_number}</strong>{t.carrier ? ` (${String(t.carrier).toUpperCase()})` : ''}
                                  </div>
                                  <PartShipBar ticket={t} />
                                </div>
                              )}
                              <div className="od-full row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                <select className="estado-select" value={t.status} onChange={(e) => setEstado(t, e.target.value)}>
                                  {REPAIR_STATUS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                                </select>
                                <button className="btn btn-secondary btn-sm" onClick={() => setDetail({ id: t.id })}>Abrir ficha</button>
                                {t.invoice_number && <span className="muted" style={{ fontSize: 12 }}>Factura {t.invoice_number}</span>}
                                <button className="btn btn-secondary btn-sm" disabled={invBusy === t.id}
                                  title="Ver el PDF de la factura (si no existe, se crea al vuelo)"
                                  onClick={() => verFactura(t)}>
                                  {invBusy === t.id ? <span className="spinner" /> : 'Ver factura'}
                                </button>
                                <button className="btn btn-secondary btn-sm" disabled={invBusy === t.id || !t.customer_email}
                                  title={!t.customer_email ? 'El cliente no tiene correo guardado' : `Enviar la factura en PDF a ${t.customer_email}`}
                                  onClick={() => facturaCorreo(t)}>✉ Factura por correo</button>
                                <button className="btn btn-secondary btn-sm" disabled={invBusy === t.id || !t.customer_phone}
                                  title={!t.customer_phone ? 'El cliente no tiene teléfono guardado' : 'Enviar el link del PDF de la factura por WhatsApp'}
                                  onClick={() => facturaWhatsApp(t)}>Factura por WhatsApp</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </div>
  );
}
