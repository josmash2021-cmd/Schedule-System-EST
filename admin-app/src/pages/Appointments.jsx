import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { apiRoot } from '../api.js';
import CitaForm from '../components/CitaForm.jsx';
import FormPage from '../components/FormPage.jsx';
import PageHead from '../components/PageHead.jsx';
import Tabs from '../components/Tabs.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import { phoneIntl, saludo } from '../components/RepairDetail.jsx';
import { hoyKey, diaCorto, fechaCorta } from '../fechas.js';
import './Appointments.css';

const ESTADOS = ['pendiente', 'confirmada', 'atendida', 'cancelada'];
// Estado como texto de color (sin píldora): "Por confirmar" dorado, "Confirmada" negro.
const ESTADO_INFO = {
  pendiente: { l: 'Por confirmar', cls: 'st-warn' },
  confirmada: { l: 'Confirmada', cls: 'st-strong' },
  atendida: { l: 'Atendida', cls: 'st-ok' },
  cancelada: { l: 'Cancelada', cls: 'st-muted cit2-tachado' },
};
const estadoInfo = (e) => ESTADO_INFO[e] || { l: e, cls: '' };

// De dónde vino la cita (columna `origen`; las viejas son 'web').
const ORIGENES = { web: 'Página web', whatsapp: 'WhatsApp', instagram: 'Instagram', mostrador: 'Mostrador' };
const ORIGEN_BADGE = { web: 'badge-on', whatsapp: 'badge-confirmada', instagram: 'badge-atendida', mostrador: 'badge-off' };
const ORIGEN_FRASE = { web: 'desde la página web', whatsapp: 'por WhatsApp', instagram: 'por Instagram', mostrador: 'en el mostrador' };
const origenLabel = (o) => ORIGENES[o] || ORIGENES.web;

// Filtro de estado (vista "Todas"): activas (pendiente + confirmada) / completadas / todas.
const GRUPOS = [
  { v: 'activas', l: 'Activas', match: (c) => c.estado === 'pendiente' || c.estado === 'confirmada' },
  { v: 'completadas', l: 'Completadas', match: (c) => c.estado === 'atendida' },
  { v: 'todas', l: 'Todas', match: () => true },
];

const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// Horario de la agenda del día (se estira si hay citas fuera de él).
const HORA_INI = 8;
const HORA_FIN = 20;

const fechaDe = (c) => String(c.fecha).slice(0, 10);
const horaDe = (c) => Number(String(c.hora).split(':')[0]) || 0;
const minDe = (c) => Number(String(c.hora).split(':')[1]) || 0;

// Suma n días a una clave YYYY-MM-DD.
function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const dowDe = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

// Claves YYYY-MM-DD de la semana (lunes–domingo) que contiene `key`.
function weekOf(key) {
  const lunes = addDays(key, -((dowDe(key) + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
}

// "Jueves 26 de noviembre" (+ año si no es el actual).
function tituloDia(key) {
  const [y, m, d] = key.split('-').map(Number);
  const anio = y !== Number(hoyKey().slice(0, 4)) ? ` de ${y}` : '';
  return `${DIAS_LARGOS[dowDe(key)]} ${d} de ${MESES_LARGOS[m - 1]}${anio}`;
}
// "Semana del 23 al 29 de noviembre" / "Semana del 30 nov al 6 dic".
function tituloSemana(keys) {
  const [y1, m1, d1] = keys[0].split('-').map(Number);
  const [y2, m2, d2] = keys[6].split('-').map(Number);
  const anio = y2 !== Number(hoyKey().slice(0, 4)) ? ` de ${y2}` : '';
  if (m1 === m2) return `Semana del ${d1} al ${d2} de ${MESES_LARGOS[m2 - 1]}${anio}`;
  return `Semana del ${d1} ${MONTH_LABELS[m1 - 1].toLowerCase()}${y1 !== y2 ? ' ' + y1 : ''} al ${d2} ${MONTH_LABELS[m2 - 1].toLowerCase()}${anio}`;
}

// "10:30:00" → "10:30" (agenda) y "10:30 am" (mensajes y detalle).
function horaCorta(h) {
  const [hh = 0, mm = 0] = String(h).split(':').map(Number);
  return `${hh}:${String(mm).padStart(2, '0')}`;
}
function fmtHora(h) {
  const [hh = 0, mm = 0] = String(h).split(':').map(Number);
  const am = hh < 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${am ? 'am' : 'pm'}`;
}
// "2026-07-25" → "25/07/2026" (confirmación de borrado).
const fmtFecha = (f) => String(f).slice(0, 10).split('-').reverse().join('/');

// Hora actual del negocio (America/Chicago), para la línea "Ahora".
function ahoraChicago() {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return { h: Number(p.hour) % 24, m: Number(p.minute) };
}

// Equipo mencionado en el servicio ("Cambio de pantalla iPhone 13" → "iPhone 13"),
// para que "Crear reparación" llegue con el equipo ya puesto.
const RE_EQUIPO = /\b(iPhone|iPad|MacBook|iMac|Apple Watch|AirPods|Galaxy|Pixel)\b(?:\s+(?:Pro|Air|Max|Mini|Plus|Ultra|SE|Tab|[A-Z]?\d+[a-z]*)){0,3}/i;
const equipoDeServicio = (s) => { const m = RE_EQUIPO.exec(String(s || '')); return m ? m[0].trim() : ''; };

// Número que cuenta hacia arriba al cambiar el valor (animación de los contadores).
function useCountUp(target, dur = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

function Kpi({ label, count }) {
  const n = Math.round(useCountUp(count));
  return (
    <div className="mini-kpi">
      <div className="k">{label}</div>
      <div className="v">{n}</div>
      <div className="s">cita{n === 1 ? '' : 's'}</div>
    </div>
  );
}

// Dato del detalle: etiqueta arriba, valor abajo (rejilla horizontal).
function Info({ k, v }) {
  return (
    <div className="cita-info">
      <div className="cita-info-k">{k}</div>
      <div className="cita-info-v">{v}</div>
    </div>
  );
}

export default function Appointments() {
  // Permite llegar con ?fecha=YYYY-MM-DD (p. ej. desde el gráfico del Dashboard).
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const paramFecha = searchParams.get('fecha');
  const fechaParam = /^\d{4}-\d{2}-\d{2}$/.test(paramFecha || '') ? paramFecha : null;
  const hoy = hoyKey();

  const [citas, setCitas] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  // Menú "+ Nuevo → Cita": /citas?nueva=1 abre el formulario.
  useEffect(() => {
    if (!searchParams.get('nueva')) return;
    setCreating(true);
    setSearchParams({}, { replace: true });
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState(null); // cita abierta en detalle
  const [tick, setTick] = useState(0); // fuerza recarga

  // Vista (pestaña): día (agenda por horas) / semana (7 columnas) / todas (lista).
  const [vista, setVista] = useState('dia');
  const [day, setDay] = useState(fechaParam || hoy);
  // Si llega ?fecha= con la página ya abierta, se abre ese día.
  useEffect(() => { if (fechaParam) { setDay(fechaParam); setVista('dia'); } }, [fechaParam]);
  const [grupo, setGrupo] = useState('activas');
  const [anio, setAnio] = useState('todos'); // filtro de la vista "Todas"
  const [mes, setMes] = useState('todos');
  const [q, setQ] = useState(''); // buscador

  // Reloj para la línea dorada "Ahora" (se mueve cada 30 s).
  const [ahora, setAhora] = useState(ahoraChicago);
  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraChicago()), 30000);
    return () => clearInterval(t);
  }, []);

  // Se cargan TODAS las citas una vez; los filtros son en cliente, así los
  // contadores, la agenda y la lista siempre están sincronizados.
  const load = useCallback(() => {
    setErr('');
    apiRoot('/api/appointments')
      .then((d) => setCitas(d.citas || []))
      .catch((e) => setErr(e.message));
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const wkHoy = useMemo(() => weekOf(hoy), [hoy]);
  const semana = useMemo(() => weekOf(day), [day]);
  const curYear = Number(hoy.slice(0, 4));
  const curMonthKey = hoy.slice(0, 7);
  const activa = (c) => c.estado !== 'cancelada';

  // Años con citas (más el actual) para el filtro de la vista "Todas".
  const years = useMemo(() => {
    const s = new Set([curYear]);
    for (const c of citas || []) s.add(Number(fechaDe(c).slice(0, 4)));
    return [...s].sort((a, b) => b - a);
  }, [citas, curYear]);

  // Contadores: cuántas citas (sin contar canceladas) hay hoy / esta semana /
  // este mes / este año.
  const kpis = useMemo(() => {
    if (!citas) return null;
    const ok = citas.filter(activa);
    return {
      dia: ok.filter((c) => fechaDe(c) === hoy).length,
      semana: ok.filter((c) => wkHoy.includes(fechaDe(c))).length,
      mes: ok.filter((c) => fechaDe(c).slice(0, 7) === curMonthKey).length,
      ano: ok.filter((c) => Number(fechaDe(c).slice(0, 4)) === curYear).length,
    };
  }, [citas, hoy, wkHoy, curMonthKey, curYear]);

  const ordenar = (a, b) => (fechaDe(a) + String(a.hora) < fechaDe(b) + String(b.hora) ? -1 : 1);
  const delDia = useMemo(() => (citas || []).filter((c) => fechaDe(c) === day).sort(ordenar), [citas, day]);
  const porDia = useMemo(() => {
    const m = new Map(semana.map((k) => [k, []]));
    for (const c of citas || []) { const k = fechaDe(c); if (m.has(k)) m.get(k).push(c); }
    for (const l of m.values()) l.sort(ordenar);
    return m;
  }, [citas, semana]);
  const nDia = delDia.filter(activa).length;
  const citasSemana = [...porDia.values()].flat();
  const nSem = citasSemana.filter(activa).length;

  // Vista "Todas": buscador + grupo de estado + año/mes. Activas: próximas
  // primero; completadas/todas: lo más reciente arriba.
  const texto = q.trim().toLowerCase();
  const digitos = texto.replace(/\D/g, '');
  const coincide = (c) => {
    if (!texto) return true;
    if ([c.nombre, c.servicio, c.correo].filter(Boolean).join(' ').toLowerCase().includes(texto)) return true;
    return digitos.length >= 3 && String(c.telefono || '').replace(/\D/g, '').includes(digitos);
  };
  const grupoDef = GRUPOS.find((g) => g.v === grupo) || GRUPOS[0];
  const enPeriodo = (c) => {
    const f = fechaDe(c);
    if (anio !== 'todos' && Number(f.slice(0, 4)) !== Number(anio)) return false;
    if (anio !== 'todos' && mes !== 'todos' && f.slice(5, 7) !== mes) return false;
    return true;
  };
  const baseLista = (citas || []).filter((c) => enPeriodo(c) && coincide(c));
  const lista = baseLista.filter(grupoDef.match).sort((a, b) => (grupo === 'activas' ? ordenar(a, b) : -ordenar(a, b)));
  const cuenta = (g) => baseLista.filter((GRUPOS.find((x) => x.v === g) || GRUPOS[2]).match).length;

  // Encabezado: título + frase de cómo va, según la vista.
  let titulo = 'Todas las citas';
  let sub = '';
  if (citas) {
    const pend = (l) => l.filter((c) => c.estado === 'pendiente').length;
    if (vista === 'dia') {
      const p = pend(delDia);
      const esSemanaHoy = semana[0] === wkHoy[0];
      titulo = tituloDia(day);
      sub = [
        `${nDia} cita${nDia === 1 ? '' : 's'} ${day === hoy ? 'hoy' : 'este día'}`,
        p > 0 && `${p} por confirmar`,
        `${nSem} ${esSemanaHoy ? 'esta semana' : 'en la semana'}`,
      ].filter(Boolean).join(' · ');
    } else if (vista === 'semana') {
      const p = pend(citasSemana);
      titulo = tituloSemana(semana);
      sub = [`${nSem} cita${nSem === 1 ? '' : 's'}`, p > 0 && `${p} por confirmar`].filter(Boolean).join(' · ');
    } else {
      const nAct = citas.filter(GRUPOS[0].match).length;
      const nComp = citas.filter(GRUPOS[1].match).length;
      sub = `${nAct} activa${nAct === 1 ? '' : 's'} · ${nComp} completada${nComp === 1 ? '' : 's'} · ${citas.length} en total`;
    }
  } else if (vista === 'dia') titulo = tituloDia(day);
  else if (vista === 'semana') titulo = tituloSemana(semana);

  const changeEstado = async (c, estado) => {
    setBusy(c.id + estado);
    try {
      await apiRoot('/api/appointments', { method: 'PATCH', body: { fecha: c.fecha, hora: c.hora, estado } });
      setCitas((list) => list.map((x) => (x.id === c.id ? { ...x, estado } : x)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`¿Eliminar la cita de ${c.nombre} (${fmtFecha(c.fecha)} ${fmtHora(c.hora)})?`)) return;
    setBusy(c.id + 'del');
    try {
      await apiRoot('/api/appointments/' + c.id, { method: 'DELETE' });
      setCitas((list) => list.filter((x) => x.id !== c.id));
      setSelected(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const deleteAll = async () => {
    if (!window.confirm('¿Eliminar TODAS las citas? Esta acción no se puede deshacer.')) return;
    try {
      await apiRoot('/api/appointments', { method: 'DELETE' });
      load();
    } catch (e) {
      setErr(e.message);
    }
  };

  // WhatsApp al cliente (mismo armado de wa.me con saludo() que Reparaciones).
  const whatsApp = (c) => {
    const cuando = fechaCorta(fechaDe(c), { conHora: false });
    const dia = ['hoy', 'mañana', 'ayer'].includes(cuando) ? 'de ' + cuando : 'del ' + cuando;
    const hola = `Hola${c.nombre ? ' ' + c.nombre : ''}, ${saludo()}.`;
    const msg = c.estado === 'pendiente'
      ? `${hola} Te escribimos de ElectronicST para confirmar tu cita ${dia} a las ${fmtHora(c.hora)} (${c.servicio}). ¿Nos confirmas que vienes?`
      : `${hola} Te escribimos de ElectronicST por tu cita ${dia} a las ${fmtHora(c.hora)} (${c.servicio}).`;
    window.open('https://wa.me/' + phoneIntl(c.telefono) + '?text=' + encodeURIComponent(msg), '_blank');
  };

  // "Crear reparación": abre Reparaciones con el formulario nuevo y los datos
  // del cliente ya puestos (nombre, teléfono, correo, equipo y problema).
  const crearReparacion = (c) => {
    const p = new URLSearchParams({ nueva: '1' });
    if (c.nombre) p.set('cliente', c.nombre);
    if (c.telefono) p.set('tel', c.telefono);
    if (c.correo) p.set('correo', c.correo);
    const eq = equipoDeServicio(c.servicio);
    if (eq) p.set('equipo', eq);
    if (c.servicio) p.set('problema', c.servicio);
    navigate('/reparaciones?' + p.toString());
  };

  // Botones de cada cita según su estado (no abren el detalle al tocarlos).
  const acciones = (c) => {
    const btn = (label, fn, cls = '', key = label, title) => (
      <button key={key} type="button" className={'cit2-btn ' + cls} disabled={!!busy} title={title}
        onClick={(e) => { e.stopPropagation(); fn(); }}>{label}</button>
    );
    const wa = c.telefono && btn('WhatsApp', () => whatsApp(c), '', 'wa', 'Escribirle por WhatsApp');
    const rep = btn('Crear reparación', () => crearReparacion(c), 'cit2-btn-au', 'rep', 'Abrir una reparación con estos datos');
    let items = [];
    if (c.estado === 'pendiente') items = [btn(busy === c.id + 'confirmada' ? '…' : 'Confirmar', () => changeEstado(c, 'confirmada'), 'cit2-btn-k', 'conf'), wa];
    else if (c.estado === 'confirmada') items = [btn(busy === c.id + 'atendida' ? '…' : 'Llegó', () => changeEstado(c, 'atendida'), 'cit2-btn-k', 'lleg'), wa, rep];
    else if (c.estado === 'atendida') items = [rep, wa];
    items = items.filter(Boolean);
    return items.length ? <div className="cit2-acts">{items}</div> : null;
  };

  const abrir = (c) => setSelected(c);
  const onKey = (c) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(c); } };

  // Alta de cita desde el mostrador (mismo formulario que usa el trabajador).
  if (creating) {
    return (
      <FormPage title="Nueva cita" onBack={() => setCreating(false)} max={640}>
        <CitaForm
          onCancel={() => setCreating(false)}
          onSaved={(cita) => {
            setCreating(false);
            // Saltar al día de la cita nueva. El tick fuerza la recarga aunque
            // la cita sea para el día ya seleccionado (setDay con el mismo
            // valor no re-dispara el efecto y la cita no aparecía).
            if (cita && cita.fecha) { setDay(String(cita.fecha).slice(0, 10)); setVista('dia'); }
            setTick((t) => t + 1);
          }}
        />
      </FormPage>
    );
  }

  if (editing) {
    return (
      <EditPage
        cita={editing}
        onBack={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    );
  }

  // Detalle de la cita (página completa, info en rejilla horizontal).
  if (selected) {
    const c = (citas && citas.find((x) => x.id === selected.id)) || selected;
    const info = estadoInfo(c.estado);
    return (
      <FormPage title="Detalle de la cita" onBack={() => setSelected(null)} max={760}>
        {err && <div className="alert alert-error">{err}</div>}
        <div className="cita-grid">
          <Info k="Fecha" v={diaCorto(fechaDe(c))} />
          <Info k="Hora" v={fmtHora(c.hora)} />
          <Info k="Estado" v={<span className={'st ' + info.cls}>{info.l}</span>} />
          <Info k="Origen" v={<span className={'badge ' + (ORIGEN_BADGE[c.origen] || 'badge-on')}>{origenLabel(c.origen)}</span>} />
          <Info k="Cliente" v={c.nombre} />
          <Info k="Teléfono" v={c.telefono || '—'} />
          <Info k="Correo" v={c.correo || '—'} />
          <Info k="Servicio" v={c.servicio} />
        </div>
        {acciones(c) && <div className="cit2-detail-acts">{acciones(c)}</div>}
        <div className="row" style={{ marginTop: 20, flexWrap: 'wrap' }}>
          <select value={c.estado} disabled={!!busy} onChange={(e) => changeEstado(c, e.target.value)} style={{ width: 'auto' }}
            aria-label="Estado de la cita">
            {ESTADOS.map((e) => <option key={e} value={e}>{estadoInfo(e).l}</option>)}
          </select>
          <div className="spacer" />
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)}>Editar</button>
          <button className="btn btn-danger btn-sm" disabled={busy === c.id + 'del'} onClick={() => remove(c)}>
            {busy === c.id + 'del' ? <span className="spinner" /> : 'Eliminar'}
          </button>
        </div>
      </FormPage>
    );
  }

  // Tarjeta de una cita en la agenda del día.
  const citaDia = (c) => {
    const info = estadoInfo(c.estado);
    return (
      <div key={c.id} className={'cit2-appt cit2-' + c.estado} role="button" tabIndex={0}
        onClick={() => abrir(c)} onKeyDown={onKey(c)}>
        <div className="cit2-appt-top">
          <span className="cit2-appt-t">{horaCorta(c.hora)} · {c.nombre}</span>
          <span className={'st ' + info.cls}>{info.l}</span>
        </div>
        <div className="cit2-appt-sub">
          {[c.servicio, ORIGEN_FRASE[c.origen] || ORIGEN_FRASE.web, c.telefono].filter(Boolean).join(' · ')}
        </div>
        {acciones(c)}
      </div>
    );
  };

  // Agenda del día: una fila por hora; la línea dorada "Ahora" va en su hora.
  const agenda = () => {
    const esHoy = day === hoy;
    const horasCitas = delDia.map(horaDe);
    const ini = Math.min(HORA_INI, ...horasCitas);
    const fin = Math.max(HORA_FIN, ...horasCitas);
    const ahoraTxt = `Ahora · ${ahora.h}:${String(ahora.m).padStart(2, '0')}`;
    const linea = <div key="ahora" className="cit2-now">{ahoraTxt}</div>;
    const filas = [];
    for (let h = ini; h <= fin; h++) {
      const enHora = delDia.filter((c) => horaDe(c) === h);
      const items = [];
      let puesta = false;
      for (const c of enHora) {
        if (esHoy && ahora.h === h && !puesta && minDe(c) > ahora.m) { items.push(linea); puesta = true; }
        items.push(citaDia(c));
      }
      if (esHoy && ahora.h === h && !puesta) items.push(linea);
      filas.push(
        <div key={h} className={'cit2-hour' + (esHoy && ahora.h === h ? ' cit2-hour-now' : '')}>
          <span className="cit2-hlabel">{h}:00</span>
          <div className="cit2-slot">{items}</div>
        </div>,
      );
    }
    return (
      <div className="cit2-day">
        {esHoy && ahora.h < ini && <div className="cit2-now cit2-now-edge">{ahoraTxt}</div>}
        {delDia.length === 0 && <div className="cit2-day-empty">Sin citas {esHoy ? 'hoy' : 'este día'}.</div>}
        {filas}
        {esHoy && ahora.h > fin && <div className="cit2-now cit2-now-edge">{ahoraTxt}</div>}
      </div>
    );
  };

  // Semana: 7 columnas lun–dom; tocar el encabezado abre ese día.
  const semanaVista = () => (
    <div className="cit2-week">
      {semana.map((k, i) => {
        const l = porDia.get(k) || [];
        const n = l.filter(activa).length;
        return (
          <div key={k} className={'cit2-wcol' + (k === hoy ? ' cit2-wcol-hoy' : '') + (k === day ? ' cit2-wcol-sel' : '')}>
            <button type="button" className="cit2-wcol-h" onClick={() => { setDay(k); setVista('dia'); }}
              title="Ver la agenda de este día">
              <span className="cit2-wd">{DIAS_SEMANA[i]}</span>
              <span className="cit2-wn">{Number(k.slice(8, 10))}</span>
              {n > 0 && <span className="cit2-wc">{n}</span>}
            </button>
            {l.length === 0 ? <div className="cit2-wempty">—</div> : l.map((c) => {
              const info = estadoInfo(c.estado);
              return (
                <div key={c.id} className={'cit2-wcard cit2-' + c.estado} role="button" tabIndex={0}
                  onClick={() => abrir(c)} onKeyDown={onKey(c)}>
                  <div className="cit2-wcard-t"><b>{horaCorta(c.hora)}</b> {c.nombre}</div>
                  <div className="cit2-wcard-s">{c.servicio}</div>
                  <span className={'st ' + info.cls}>{info.l}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  // Todas: contadores + filtros + lista para buscar citas viejas.
  const todasVista = () => (
    <>
      <div className="mini-kpis">
        {kpis == null
          ? ['Hoy', 'Esta semana', 'Este mes', 'Este año'].map((l) => <div key={l} className="mini-kpi"><div className="k">{l}</div><div className="v"><span className="spinner" /></div></div>)
          : (
            <>
              <Kpi label="Hoy" count={kpis.dia} />
              <Kpi label="Esta semana" count={kpis.semana} />
              <Kpi label="Este mes" count={kpis.mes} />
              <Kpi label="Este año" count={kpis.ano} />
            </>
          )}
      </div>
      <div className="cit2-bar">
        <Tabs tabs={GRUPOS.map((g) => ({ v: g.v, l: g.l, n: cuenta(g.v) }))} value={grupo} onChange={setGrupo} />
        <div className="cit2-filtros">
          <select value={anio} onChange={(e) => { setAnio(e.target.value); if (e.target.value === 'todos') setMes('todos'); }} aria-label="Año">
            <option value="todos">Todos los años</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={mes} onChange={(e) => setMes(e.target.value)} disabled={anio === 'todos'} aria-label="Mes">
            <option value="todos">Todos los meses</option>
            {MONTH_LABELS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
          </select>
        </div>
      </div>
      {lista.length === 0 ? <div className="empty-state">No hay citas con este filtro.</div> : (
        <div className="lcards">
          {lista.map((c) => {
            const info = estadoInfo(c.estado);
            return (
              <div key={c.id} className={'lcard click cit2-row cit2-' + c.estado} role="button" tabIndex={0}
                onClick={() => abrir(c)} onKeyDown={onKey(c)}>
                <div className="cit2-row-when">
                  <span>{fechaCorta(fechaDe(c), { conHora: false })}</span>
                  <b>{horaCorta(c.hora)}</b>
                </div>
                <div className="lcard-main">
                  <div className="lcard-title">{c.nombre}</div>
                  <div className="lcard-sub">{[c.servicio, c.telefono, origenLabel(c.origen)].filter(Boolean).join(' · ')}</div>
                </div>
                <span className={'st ' + info.cls}>{info.l}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );

  // Flechas: un día (Día) o una semana (Semana).
  const paso = vista === 'semana' ? 7 : 1;

  return (
    <div className="cit2">
      <PageHead title={titulo} sub={sub}
        search={q} searchPlaceholder="Buscar cliente, teléfono o servicio…"
        onSearch={(v) => { setQ(v); if (v.trim() && vista !== 'todas') { setVista('todas'); setGrupo('todas'); } }}>
        {vista !== 'todas' && (
          <div className="cit2-nav" role="group" aria-label="Cambiar de día">
            <button type="button" className="cit2-nav-b" aria-label={paso === 7 ? 'Semana anterior' : 'Día anterior'}
              onClick={() => setDay((d) => addDays(d, -paso))}>‹</button>
            <button type="button" className="cit2-nav-hoy" onClick={() => setDay(hoy)}>Hoy</button>
            <button type="button" className="cit2-nav-b" aria-label={paso === 7 ? 'Semana siguiente' : 'Día siguiente'}
              onClick={() => setDay((d) => addDays(d, paso))}>›</button>
          </div>
        )}
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nueva cita</button>
        <MoreMenu items={[
          { label: 'Actualizar', onClick: load },
          citas && citas.length > 0 && { label: 'Eliminar todas', danger: true, onClick: deleteAll },
        ]} />
      </PageHead>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="cit2-bar">
        <Tabs tabs={[
          { v: 'dia', l: 'Día', n: nDia },
          { v: 'semana', l: 'Semana', n: nSem },
          { v: 'todas', l: 'Todas' },
        ]} value={vista} onChange={setVista} />
        {vista === 'dia' && (
          <input type="date" className="cit2-date" value={day} aria-label="Elegir día"
            onChange={(e) => e.target.value && setDay(e.target.value)} />
        )}
      </div>

      {citas == null ? <div className="cit2-load"><span className="spinner spinner-lg" /></div>
        : vista === 'dia' ? agenda()
          : vista === 'semana' ? semanaVista()
            : todasVista()}
    </div>
  );
}

function EditPage({ cita, onBack, onSaved }) {
  const [nombre, setNombre] = useState(cita.nombre || '');
  const [telefono, setTelefono] = useState(cita.telefono || '');
  const [correo, setCorreo] = useState(cita.correo || '');
  const [servicio, setServicio] = useState(cita.servicio || '');
  const [fecha, setFecha] = useState(String(cita.fecha || '').slice(0, 10));
  const [hora, setHora] = useState(String(cita.hora || '').slice(0, 5));
  const [estado, setEstado] = useState(cita.estado || 'pendiente');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErr('');
    setSaving(true);
    try {
      await apiRoot('/api/appointments/' + cita.id, {
        method: 'PATCH',
        body: {
          nombre: nombre.trim(), telefono: telefono.trim(), correo: correo.trim() || null,
          servicio: servicio.trim(), fecha, hora, estado,
        },
      });
      onSaved();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <>
      <div className="section-head">
        <div className="spacer" />
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Volver</button>
      </div>
      {err && <div className="alert alert-error">{err}</div>}
      <div className="card" style={{ maxWidth: 640 }}>
        <h3>Datos de la cita</h3>
        <label className="field"><span>Cliente</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </label>
        <div className="rd-grid">
          <label className="field"><span>Teléfono</span>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          </label>
          <label className="field"><span>Correo (opcional)</span>
            <input type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </label>
        </div>
        <label className="field"><span>Servicio</span>
          <input value={servicio} onChange={(e) => setServicio(e.target.value)} />
        </label>
        <div className="rd-grid">
          <label className="field"><span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="field"><span>Hora</span>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </label>
        </div>
        <label className="field"><span>Estado</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map((e) => <option key={e} value={e}>{estadoInfo(e).l}</option>)}
          </select>
        </label>
        <div className="row" style={{ marginTop: 4 }}>
          <button className="btn btn-primary" onClick={save}
            disabled={saving || !nombre.trim() || !telefono.trim() || !servicio.trim() || !fecha || !hora}>
            {saving ? <span className="spinner" /> : 'Guardar cambios'}
          </button>
          <button className="btn btn-ghost" onClick={onBack}>Cancelar</button>
        </div>
      </div>
    </>
  );
}
