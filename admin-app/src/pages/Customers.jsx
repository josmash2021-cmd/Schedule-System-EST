import './Customers.css';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiRoot } from '../api.js';
import PageHead from '../components/PageHead.jsx';
import Tabs from '../components/Tabs.jsx';
import { statusLabel } from '../components/RepairDetail.jsx';
import { fechaCorta, diaKey, iniciales } from '../fechas.js';

/* Clientes (diseño nuevo, 2026-11-26): lista a la izquierda y ficha del
   cliente elegido a la derecha (en teléfono la ficha reemplaza la lista, con
   "← Volver"). La base sale de /customers (agregado desde las facturas) y se
   completa EN EL CLIENTE con las facturas, reparaciones y citas — así también
   aparecen quienes solo trajeron un equipo o hicieron una cita. No hay nada
   que dar de alta a mano. */

// "Frecuente" = 3 o más compras + reparaciones + citas en total. Para no
// contar dos veces la misma visita: la factura de una reparación va con su
// reparación, y una cita del mismo día en que entró un equipo no suma aparte.
// Las citas canceladas no cuentan.
const FRECUENTE_MIN = 3;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Teléfono en formato US (mismo criterio que en Órdenes).
function fmtPhone(p) {
  if (!p) return '—';
  let digits = String(p).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length > 11) digits = digits.slice(-10);
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return p;
}

/* ---------- Claves para juntar al mismo cliente ---------- */
const normEmail = (s) => String(s || '').trim().toLowerCase();
// Solo dígitos, sin el 1 de EE. UU. delante; menos de 7 dígitos no identifica a nadie.
function normTel(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length > 10) d = d.slice(-10);
  return d.length >= 7 ? d : '';
}
const normNombre = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();
// Número para wa.me / tel: (10 dígitos de EE. UU. → con 1 delante).
function telIntl(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 ? '1' + d : d;
}
const ts = (v) => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const equipoDe = (t) => [t.device_brand, t.device_model].filter(Boolean).join(' ') || 'equipo';

/* Junta todo por email; si no, por teléfono (solo dígitos); si no, por nombre
   normalizado (y solo si el correo/teléfono no contradicen al que ya existe). */
function juntarClientes({ base, facturas, reparaciones, citas }) {
  const lista = [];
  const porEmail = new Map(); const porTel = new Map(); const porNombre = new Map();

  const buscar = (k) => {
    if (k.email && porEmail.has(k.email)) return porEmail.get(k.email);
    if (k.tel && porTel.has(k.tel)) return porTel.get(k.tel);
    if (k.nombre && porNombre.has(k.nombre)) {
      const c = porNombre.get(k.nombre);
      const choca = (k.email && c.emails.size && !c.emails.has(k.email)) || (k.tel && c.tels.size && !c.tels.has(k.tel));
      if (!choca) return c;
    }
    return null;
  };
  const tomar = (rec, cuando) => {
    const k = { email: normEmail(rec.email), tel: normTel(rec.phone), nombre: normNombre(rec.name) };
    if (!k.email && !k.tel && !k.nombre) return null;
    let c = buscar(k);
    if (!c) {
      c = {
        id: lista.length + 1, name: '', email: '', phone: '', address: '', _ts: {},
        emails: new Set(), tels: new Set(),
        comprasBase: 0, totalBase: 0, facturas: [], reparaciones: [], citas: [], ultima: 0,
      };
      lista.push(c);
    }
    if (k.email) { c.emails.add(k.email); if (!porEmail.has(k.email)) porEmail.set(k.email, c); }
    if (k.tel) { c.tels.add(k.tel); if (!porTel.has(k.tel)) porTel.set(k.tel, c); }
    if (k.nombre && !porNombre.has(k.nombre)) porNombre.set(k.nombre, c);
    // Datos de contacto: el más reciente que tenga cada dato.
    for (const f of ['name', 'email', 'phone', 'address']) {
      const v = rec[f] && String(rec[f]).trim();
      if (v && (!c[f] || cuando >= (c._ts[f] || 0))) { c[f] = v; c._ts[f] = cuando; }
    }
    if (cuando > c.ultima) c.ultima = cuando;
    return c;
  };

  for (const r of base) {
    const c = tomar(r, ts(r.ultima));
    if (c) { c.comprasBase += Number(r.facturas) || 0; c.totalBase += Number(r.total) || 0; }
  }
  // Como en el server: solo cuentan las facturas con nombre de comprador.
  for (const inv of facturas) {
    if (!inv.buyer_name || !String(inv.buyer_name).trim()) continue;
    const c = tomar({ name: inv.buyer_name, email: inv.buyer_email, phone: inv.buyer_phone, address: inv.buyer_address }, ts(inv.created_at));
    if (c) c.facturas.push(inv);
  }
  for (const t of reparaciones) {
    const c = tomar({ name: t.customer_name, email: t.customer_email, phone: t.customer_phone }, ts(t.delivered_at || t.created_at));
    if (c) c.reparaciones.push(t);
  }
  for (const ci of citas) {
    const cuando = ts(`${ci.fecha}T${String(ci.hora || '12:00').slice(0, 5)}:00`);
    const c = tomar({ name: ci.nombre, email: ci.correo, phone: ci.telefono, address: ci.direccion }, cuando);
    if (c) c.citas.push(ci);
  }

  // Facturas por reparación (para no contar dos veces la misma reparación).
  const factPorRep = {};
  for (const inv of facturas) if (inv.repair_id) (factPorRep[inv.repair_id] = factPorRep[inv.repair_id] || []).push(inv);

  return lista.map((c) => {
    // Las cifras salen de /customers; si la lista de facturas trae más (no
    // debería), manda la lista.
    const totalFact = c.facturas.reduce((a, i) => a + (Number(i.total) || 0), 0);
    const masFacturas = c.facturas.length > c.comprasBase;
    const compras = masFacturas ? c.facturas.length : c.comprasBase;
    let total = masFacturas ? totalFact : c.totalBase;
    const repsSinFactura = c.reparaciones.filter((t) => !t.invoice_number && !factPorRep[t.id]);
    for (const t of repsSinFactura) if (t.status === 'entregado') total += Number(t.final_price) || 0;

    // Compras = facturas que no son de una reparación de este cliente (esas
    // van con su reparación); una factura de reparación "suelta" cuenta como reparación.
    const repIds = new Set(c.reparaciones.map((t) => t.id));
    const factDeSusReps = c.facturas.filter((i) => i.repair_id && repIds.has(i.repair_id)).length;
    const factRepSueltas = c.facturas.filter((i) => i.repair_id && !i.sale_id && !repIds.has(i.repair_id)).length;
    const comprasSolas = Math.max(0, compras - factDeSusReps - factRepSueltas);
    const numReparaciones = c.reparaciones.length + factRepSueltas;
    const diasConEquipo = new Set(c.reparaciones.map((t) => diaKey(t.created_at)));
    const citasActivas = c.citas.filter((x) => x.estado !== 'cancelada');
    const citasSueltas = citasActivas.filter((x) => !diasConEquipo.has(x.fecha)).length;
    const visitas = comprasSolas + numReparaciones + citasSueltas;

    // Historial: compras/facturas, reparaciones y citas, del más nuevo al más viejo.
    const hist = [];
    for (const inv of c.facturas) {
      if (inv.repair_id && repIds.has(inv.repair_id)) continue; // va junto a su reparación
      const its = (inv.items || []).filter((i) => i.description);
      const desc = its.length ? its[0].description + (its.length > 1 ? ` y ${its.length - 1} más` : '') : 'Factura';
      const esOrden = inv.order_id && !inv.sale_id && !inv.repair_id;
      hist.push({
        k: 'f' + inv.id, t: ts(inv.created_at), fecha: inv.created_at,
        texto: inv.repair_id && !inv.sale_id ? `Reparación: ${desc}` : `${esOrden ? 'Orden en línea' : 'Compra'}: ${desc}`,
        detalle: `Factura ${inv.invoice_number || '#' + inv.id}`,
        monto: usd.format(Number(inv.total) || 0), to: `/facturas?ver=${inv.id}`,
      });
    }
    for (const t of c.reparaciones) {
      const fs = factPorRep[t.id] || [];
      const precio = t.final_price != null ? Number(t.final_price) : t.quoted_price != null ? Number(t.quoted_price) : null;
      hist.push({
        k: 'r' + t.id, t: ts(t.delivered_at || t.created_at), fecha: t.delivered_at || t.created_at,
        texto: `Reparación ${equipoDe(t)}`,
        detalle: [statusLabel(t.status), fs.length ? `Factura ${fs.map((i) => i.invoice_number || '#' + i.id).join(', ')}` : t.invoice_number ? `Factura ${t.invoice_number}` : null,
          t.final_price == null && t.quoted_price != null ? 'cotizado' : null].filter(Boolean).join(' · '),
        monto: precio == null ? '—' : usd.format(precio),
        to: fs.length ? `/facturas?ver=${fs[0].id}` : '/reparaciones',
      });
    }
    for (const ci of c.citas) {
      hist.push({
        k: 'c' + ci.id, t: ts(`${ci.fecha}T${String(ci.hora || '12:00').slice(0, 5)}:00`), fecha: ci.fecha,
        texto: `Cita: ${ci.servicio || 'sin servicio'}`,
        detalle: [String(ci.hora || '').slice(0, 5), ci.estado].filter(Boolean).join(' · '),
        cancelada: ci.estado === 'cancelada',
        monto: '—', to: ci.fecha ? `/citas?fecha=${ci.fecha}` : '/citas',
      });
    }
    hist.sort((a, b) => b.t - a.t);

    return {
      ...c, compras: comprasSolas, total, visitas, hist, numReparaciones, numCitas: citasActivas.length,
      frecuente: visitas >= FRECUENTE_MIN,
      desde: hist.length ? hist[hist.length - 1].fecha : null,
    };
  }).sort((a, b) => b.ultima - a.ultima);
}

// Una línea corta: "2 compras · 1 reparación · $612.40" o "1 cita".
function resumenCorto(c) {
  return [
    c.compras > 0 && plural(c.compras, 'compra', 'compras'),
    c.numReparaciones > 0 && plural(c.numReparaciones, 'reparación', 'reparaciones'),
    c.numCitas > 0 && plural(c.numCitas, 'cita', 'citas'),
    c.total > 0 && usd.format(c.total),
  ].filter(Boolean).join(' · ') || 'Sin movimientos';
}

// ¿Pantalla angosta? (la ficha va en lugar de la lista).
function useAngosto(q = '(max-width: 900px)') {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

function Ficha({ c, onBack, navigate }) {
  const tel = c.phone ? telIntl(c.phone) : '';
  return (
    <div className="cli2-ficha">
      {onBack && <button type="button" className="btn btn-secondary btn-sm cli2-back" onClick={onBack}>← Volver</button>}
      <div className="cli2-top">
        <span className="av av-lg">{iniciales(c.name)}</span>
        <div className="cli2-top-txt">
          <div className="cli2-name">{c.name || 'Sin nombre'}</div>
          <div className="cli2-contact">{[c.phone && fmtPhone(c.phone), c.address].filter(Boolean).join(' · ') || 'Sin teléfono ni dirección'}</div>
          {c.email && <div className="cli2-contact">{c.email}</div>}
        </div>
        {c.frecuente && <span className="cli2-frec">Frecuente</span>}
      </div>

      {(tel || c.email) && (
        <div className="cli2-btns">
          {tel && <a className="btn btn-primary btn-sm" href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {tel && <a className="btn btn-secondary btn-sm" href={`tel:${tel.length >= 11 ? '+' + tel : tel}`}>Llamar</a>}
          {c.email && <a className="btn btn-secondary btn-sm" href={`mailto:${c.email}`}>Correo</a>}
        </div>
      )}

      <div className="cli2-stats">
        {[
          c.compras > 0 && plural(c.compras, 'compra', 'compras'),
          c.numReparaciones > 0 && plural(c.numReparaciones, 'reparación', 'reparaciones'),
          c.numCitas > 0 && plural(c.numCitas, 'cita', 'citas'),
          c.total > 0 && `${usd.format(c.total)} en total`,
          c.desde && `cliente desde ${fechaCorta(c.desde, { conHora: false })}`,
        ].filter(Boolean).join(' · ')}
      </div>

      <div className="cli2-sec">Historial</div>
      {c.hist.length === 0 ? <div className="cli2-empty">Sin compras, reparaciones ni citas registradas.</div> : (
        <div className="cli2-tl">
          {c.hist.map((h) => (
            <button key={h.k} type="button" className={'cli2-tl-row' + (h.cancelada ? ' cli2-cancel' : '')}
              onClick={() => navigate(h.to)} title="Abrir">
              <span className="cli2-tl-date">{fechaCorta(h.fecha, { conHora: false })}</span>
              <span className="cli2-tl-txt">
                <span className="cli2-tl-main">{h.texto}</span>
                {h.detalle && <span className="cli2-tl-det">{h.detalle}</span>}
              </span>
              <span className="cli2-tl-amt">{h.monto}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Customers() {
  const navigate = useNavigate();
  const angosto = useAngosto();
  const [datos, setDatos] = useState(null);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('todos');
  const [sel, setSel] = useState(null); // id del cliente abierto
  const [err, setErr] = useState('');

  useEffect(() => {
    // /customers es la base; facturas, reparaciones y citas completan el
    // historial (si alguna falla, la página sigue con lo que haya).
    const falla = (msg) => (e) => { setErr((x) => x || `${msg}: ${e.message}`); return []; };
    Promise.all([
      api('/customers').then((d) => d.customers || []).catch(falla('No se pudieron cargar los clientes')),
      api('/invoices').then((d) => d.invoices || []).catch(() => []),
      api('/repairs').then((d) => d.tickets || []).catch(() => []),
      apiRoot('/api/appointments').then((d) => d.citas || []).catch(() => []),
    ]).then(([base, facturas, reparaciones, citas]) => setDatos({ base, facturas, reparaciones, citas }));
  }, []);

  const clientes = useMemo(() => (datos ? juntarClientes(datos) : null), [datos]);
  const frecuentes = useMemo(() => (clientes || []).filter((c) => c.frecuente).length, [clientes]);

  const filtrados = useMemo(() => {
    let lista = clientes || [];
    if (tab === 'frecuentes') lista = lista.filter((c) => c.frecuente);
    const t = q.trim().toLowerCase();
    if (!t) return lista;
    const dig = t.replace(/\D/g, '');
    return lista.filter((c) =>
      [c.name, c.address, ...c.emails].some((v) => v && String(v).toLowerCase().includes(t))
      || normNombre(c.name).includes(normNombre(t))
      || (dig.length >= 3 && [...c.tels].some((x) => x.includes(dig))));
  }, [clientes, q, tab]);

  // En PC siempre hay una ficha abierta (la elegida o la primera de la lista).
  const elegido = (clientes || []).find((c) => c.id === sel) || null;
  const ficha = angosto ? elegido : (filtrados.find((c) => c.id === sel) || filtrados[0] || null);

  const abrir = (c) => {
    setSel(c.id);
    if (angosto) window.scrollTo(0, 0);
  };

  const sub = clientes == null ? ''
    : `${plural(clientes.length, 'cliente', 'clientes')} · ${plural(frecuentes, 'frecuente', 'frecuentes')}`;

  // Teléfono con ficha abierta: la ficha reemplaza a la lista.
  if (angosto && ficha) {
    return (
      <div className="customers-page cli2">
        <Ficha c={ficha} navigate={navigate} onBack={() => setSel(null)} />
      </div>
    );
  }

  return (
    <div className="customers-page cli2">
      <PageHead title="Clientes" sub={sub} search={q} onSearch={setQ} searchPlaceholder="Buscar nombre, correo o teléfono…" />
      {err && <div className="alert alert-error">{err}</div>}

      {clientes == null ? <span className="spinner spinner-lg" />
        : clientes.length === 0 ? (
          <div className="empty-state">No hay clientes todavía. Aparecen solos al emitir facturas, registrar reparaciones o agendar citas.</div>
        ) : (
          <>
            <Tabs tabs={[{ v: 'todos', l: 'Todos', n: clientes.length }, { v: 'frecuentes', l: 'Frecuentes', n: frecuentes }]}
              value={tab} onChange={setTab} />
            {filtrados.length === 0 ? (
              <div className="empty-state">{q ? 'Ningún cliente coincide con la búsqueda.' : 'Todavía no hay clientes frecuentes.'}</div>
            ) : (
              <div className="cli2-split">
                <div className="lcards cli2-list">
                  {filtrados.map((c) => (
                    <div key={c.id} className={'lcard click' + (ficha && ficha.id === c.id ? ' sel' : '')}
                      role="button" tabIndex={0} onClick={() => abrir(c)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(c); } }}>
                      <span className="av">{iniciales(c.name)}</span>
                      <div className="lcard-main">
                        <div className="lcard-title">{c.name || 'Sin nombre'}</div>
                        <div className="lcard-sub">{resumenCorto(c)}</div>
                      </div>
                      {c.frecuente && <span className="cli2-frec">Frecuente</span>}
                    </div>
                  ))}
                </div>
                {!angosto && ficha && (
                  <div className="cli2-panel">
                    <Ficha c={ficha} navigate={navigate} />
                  </div>
                )}
              </div>
            )}
          </>
        )}
    </div>
  );
}
