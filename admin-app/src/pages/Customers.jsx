import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

/* Clientes: base de datos de los compradores. Las fichas se generan solas a
   partir de las facturas emitidas (ventas de mostrador, reparaciones,
   órdenes web/FB) — no hay nada que dar de alta a mano. */

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function fmtFecha(iso) {
  if (!iso) return '—';
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso)).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.day}/${p.month}/${p.year}`;
}

// Teléfono en formato US (mismo criterio que en Órdenes).
function fmtPhone(p) {
  if (!p) return '—';
  let digits = String(p).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length > 11) digits = digits.slice(-10);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return p;
}

export default function Customers() {
  const [customers, setCustomers] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/customers')
      .then((d) => setCustomers(d.customers || []))
      .catch((e) => { setErr(e.message); setCustomers([]); });
  }, []);

  const filtrados = useMemo(() => {
    const lista = customers || [];
    const t = q.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((c) =>
      [c.name, c.email, c.phone, c.address].some((v) => v && String(v).toLowerCase().includes(t)));
  }, [customers, q]);

  return (
    <div className="customers-page">
      {err && <div className="alert alert-error">{err}</div>}

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="muted" style={{ fontSize: 14 }}>
          {customers == null ? '' : `${customers.length} cliente${customers.length === 1 ? '' : 's'} · se agregan solos al emitir facturas`}
        </div>
        <input
          style={{ width: 260 }}
          placeholder="Buscar por nombre, correo o teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card">
        <h3>Clientes</h3>
        {customers == null ? <span className="spinner" />
          : filtrados.length === 0 ? (
            <div className="empty">
              {customers.length === 0
                ? 'No hay clientes todavía. Aparecen solos al emitir facturas.'
                : 'Ningún cliente coincide con la búsqueda.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="hide-sm">Teléfono</th>
                    <th className="hide-sm">Dirección</th>
                    <th style={{ textAlign: 'center' }}>Facturas</th>
                    <th style={{ textAlign: 'right' }}>Total comprado</th>
                    <th className="hide-sm">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((c, i) => (
                    <tr key={(c.email || c.name || '') + i}>
                      <td>
                        <strong>{c.name || '—'}</strong>
                        {c.email && <div className="muted" style={{ fontSize: 12 }}>{c.email}</div>}
                      </td>
                      <td className="muted hide-sm">{fmtPhone(c.phone)}</td>
                      <td className="muted hide-sm" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={c.address || ''}>
                        {c.address || '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>{c.facturas}</td>
                      <td style={{ textAlign: 'right' }}><strong>{usd.format(Number(c.total) || 0)}</strong></td>
                      <td className="muted hide-sm">{fmtFecha(c.ultima)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
