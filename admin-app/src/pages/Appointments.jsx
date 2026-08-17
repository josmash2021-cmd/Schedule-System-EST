import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRoot } from '../api.js';
import CitaForm from '../components/CitaForm.jsx';
import FormPage from '../components/FormPage.jsx';
import BarChart from '../components/BarChart.jsx';

const ESTADOS = ['pendiente', 'confirmada', 'atendida', 'cancelada'];

// De dónde vino la cita (columna `origen`; las viejas son 'web').
const ORIGENES = { web: 'Página web', whatsapp: 'WhatsApp', instagram: 'Instagram', mostrador: 'Mostrador' };
const ORIGEN_BADGE = { web: 'badge-on', whatsapp: 'badge-confirmada', instagram: 'badge-atendida', mostrador: 'badge-off' };
const origenLabel = (o) => ORIGENES[o] || ORIGENES.web;

// Filtro de estado: activas (pendiente + confirmada) / completadas / todas.
const GRUPOS = [
  { v: 'activas', l: 'Activas', match: (c) => c.estado === 'pendiente' || c.estado === 'confirmada' },
  { v: 'completadas', l: 'Completadas', match: (c) => c.estado === 'atendida' },
  { v: 'todas', l: 'Todas', match: () => true },
];

const PERIODS = [
  { v: 'dia', l: 'Hoy' },
  { v: 'semana', l: 'Semana' },
  { v: 'mes', l: 'Mes' },
  { v: 'ano', l: 'Año' },
];

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function todayChicago() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
}

// Claves YYYY-MM-DD de la semana actual (lunes–domingo, America/Chicago).
function weekKeys() {
  const [y, m, d] = todayChicago().split('-').map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

// "10:30:00" → "10:30 am"; "15:15:00" → "3:15 pm"
function fmtHora(h) {
  const [hh = 0, mm = 0] = String(h).split(':').map(Number);
  const am = hh < 12;
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${am ? 'am' : 'pm'}`;
}

// "2026-07-25" → "25/07/2026"
const fmtFecha = (f) => String(f).slice(0, 10).split('-').reverse().join('/');

// Número que cuenta hacia arriba al cambiar el valor (animación de los KPIs).
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
  const n = useCountUp(count);
  return (
    <div className="stat-card">
      <div className="stat-top"><div className="k">{label}</div></div>
      <div className="v">{Math.round(n)}</div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>cita{Math.round(n) === 1 ? '' : 's'}</div>
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
  const [searchParams] = useSearchParams();
  const paramFecha = searchParams.get('fecha');
  const fechaParam = /^\d{4}-\d{2}-\d{2}$/.test(paramFecha || '') ? paramFecha : null;
  const hoy = todayChicago();

  const [citas, setCitas] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null); // cita abierta en detalle
  const [tick, setTick] = useState(0); // fuerza recarga

  // Período y selectores: día (fecha), mes (mes+año) y año.
  const [period, setPeriod] = useState('dia');
  const [day, setDay] = useState(fechaParam || hoy);
  const [month, setMonth] = useState(hoy.slice(0, 7));
  const [year, setYear] = useState(Number(hoy.slice(0, 4)));
  const [grupo, setGrupo] = useState('activas');

  // Se cargan TODAS las citas una vez; los filtros son en cliente, así los
  // KPIs, la gráfica y la lista siempre están sincronizados.
  const load = useCallback(() => {
    setErr('');
    apiRoot('/api/appointments')
      .then((d) => setCitas(d.citas || []))
      .catch((e) => setErr(e.message));
  }, [tick]);
  useEffect(() => { load(); }, [load]);

  const wk = useMemo(weekKeys, []);
  const curYear = Number(hoy.slice(0, 4));
  const curMonthKey = hoy.slice(0, 7);
  const [selY, selM] = month.split('-').map(Number);
  const monthLabel = `${MONTH_LABELS[selM - 1]} ${selY}`;

  // Años con citas (más el actual) para el selector de año.
  const years = useMemo(() => {
    const s = new Set([curYear]);
    for (const c of citas || []) s.add(Number(String(c.fecha).slice(0, 4)));
    return [...s].sort((a, b) => b - a);
  }, [citas, curYear]);

  const inPeriod = useCallback((c, p) => {
    const f = String(c.fecha).slice(0, 10);
    if (p === 'dia') return f === day;
    if (p === 'semana') return wk.includes(f);
    if (p === 'mes') return f.slice(0, 7) === month;
    return Number(f.slice(0, 4)) === year;
  }, [day, wk, month, year]);

  // KPIs: cuántas citas (sin contar canceladas) hay hoy / esta semana /
  // este mes / este año.
  const kpis = useMemo(() => {
    if (!citas) return null;
    const ok = citas.filter((c) => c.estado !== 'cancelada');
    return {
      dia: ok.filter((c) => String(c.fecha).slice(0, 10) === hoy).length,
      semana: ok.filter((c) => wk.includes(String(c.fecha).slice(0, 10))).length,
      mes: ok.filter((c) => String(c.fecha).slice(0, 7) === curMonthKey).length,
      ano: ok.filter((c) => Number(String(c.fecha).slice(0, 4)) === curYear).length,
    };
  }, [citas, hoy, wk, curMonthKey, curYear]);

  // Lista y gráfica salen del MISMO conjunto: período + grupo de estado.
  const grupoDef = GRUPOS.find((g) => g.v === grupo) || GRUPOS[0];
  const shown = useMemo(() => (citas || [])
    .filter((c) => inPeriod(c, period) && grupoDef.match(c))
    .sort((a, b) => (String(a.fecha) + a.hora < String(b.fecha) + b.hora ? -1 : 1)),
  [citas, inPeriod, period, grupoDef]);

  // Gráfica del período: hoy → por hora; semana → por día; mes → por semana
  // del mes (Sem 1 = días 1-7, etc.); año → por mes.
  let chart = null;
  if (citas) {
    if (period === 'dia') {
      const keys = []; const labels = [];
      for (let h = 8; h <= 20; h++) { keys.push(String(h)); labels.push(h + 'h'); }
      const data = keys.map(() => 0);
      for (const c of shown) {
        const i = keys.indexOf(String(Number(String(c.hora).split(':')[0])));
        if (i >= 0) data[i] += 1;
      }
      chart = { data, keys, labels, highlight: null, title: `Citas del ${fmtFecha(day)} (por hora)` };
    } else if (period === 'semana') {
      const data = wk.map(() => 0);
      for (const c of shown) data[wk.indexOf(String(c.fecha).slice(0, 10))] += 1;
      chart = { data, keys: wk, labels: DAY_LABELS, highlight: hoy, title: 'Citas por día (esta semana)' };
    } else if (period === 'mes') {
      const days = new Date(Date.UTC(selY, selM, 0)).getUTCDate();
      const nSem = Math.ceil(days / 7);
      const keys = []; const labels = [];
      for (let s = 1; s <= nSem; s++) { keys.push(String(s)); labels.push('Sem ' + s); }
      const data = keys.map(() => 0);
      for (const c of shown) data[Math.ceil(Number(String(c.fecha).slice(8, 10)) / 7) - 1] += 1;
      chart = {
        data, keys, labels, title: `Citas por semana (${monthLabel})`,
        highlight: month === curMonthKey ? String(Math.ceil(Number(hoy.slice(8, 10)) / 7)) : null,
      };
    } else {
      const keys = []; const labels = MONTH_LABELS.slice();
      for (let m = 1; m <= 12; m++) keys.push(String(m));
      const data = keys.map(() => 0);
      for (const c of shown) data[Number(String(c.fecha).slice(5, 7)) - 1] += 1;
      chart = {
        data, keys, labels, title: `Citas por mes (${year})`,
        highlight: year === curYear ? String(Number(hoy.slice(5, 7))) : null,
      };
    }
  }

  // Tocar una barra baja al nivel de detalle correspondiente.
  const onBar = (k) => {
    if (period === 'semana') { setDay(k); setPeriod('dia'); }
    else if (period === 'mes') { setDay(`${month}-${String((Number(k) - 1) * 7 + 1).padStart(2, '0')}`); setPeriod('dia'); }
    else if (period === 'ano') { setMonth(`${year}-${k.padStart(2, '0')}`); setPeriod('mes'); }
  };

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
            if (cita && cita.fecha) { setDay(String(cita.fecha).slice(0, 10)); setPeriod('dia'); }
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
    return (
      <FormPage title="Detalle de la cita" onBack={() => setSelected(null)} max={760}>
        <div className="cita-grid">
          <Info k="Fecha" v={fmtFecha(c.fecha)} />
          <Info k="Hora" v={fmtHora(c.hora)} />
          <Info k="Estado" v={<span className={'badge badge-' + c.estado}>{c.estado}</span>} />
          <Info k="Origen" v={<span className={'badge ' + (ORIGEN_BADGE[c.origen] || 'badge-on')}>{origenLabel(c.origen)}</span>} />
          <Info k="Cliente" v={c.nombre} />
          <Info k="Teléfono" v={c.telefono || '—'} />
          <Info k="Correo" v={c.correo || '—'} />
          <Info k="Servicio" v={c.servicio} />
        </div>
        <div className="row" style={{ marginTop: 20, flexWrap: 'wrap' }}>
          <select value={c.estado} disabled={!!busy} onChange={(e) => changeEstado(c, e.target.value)} style={{ width: 'auto' }}>
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
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

  return (
    <>
      <div className="section-head">
        <div className="spacer" />
        {citas && citas.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={deleteAll}>Eliminar todas</button>
        )}
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Nueva cita</button>
      </div>

      {err && <div className="alert alert-error">{err}</div>}

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        {kpis == null
          ? PERIODS.map((p) => <div key={p.v} className="stat-card"><div className="stat-top"><div className="k">{p.l}</div></div><div className="v"><span className="spinner" /></div></div>)
          : (
            <>
              <Kpi label="Hoy" count={kpis.dia} />
              <Kpi label="Esta semana" count={kpis.semana} />
              <Kpi label="Este mes" count={kpis.mes} />
              <Kpi label="Este año" count={kpis.ano} />
            </>
          )}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        {PERIODS.map((p) => (
          <button key={p.v} className={'btn btn-sm ' + (period === p.v ? 'btn-primary' : 'btn-secondary')}
            onClick={() => { setPeriod(p.v); if (p.v === 'dia') setDay(hoy); }}>
            {p.l}
          </button>
        ))}
        {period === 'dia' && (
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)}
            style={{ width: 'auto', marginLeft: 6 }} />
        )}
        {period === 'mes' && (
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
            style={{ width: 'auto', marginLeft: 6 }} />
        )}
        {period === 'ano' && (
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto', marginLeft: 6 }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        <div className="spacer" />
        <button className="btn btn-secondary btn-sm" onClick={load}>Actualizar</button>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {GRUPOS.map((g) => (
          <button key={g.v} className={'btn btn-sm ' + (grupo === g.v ? 'btn-primary' : 'btn-secondary')}
            onClick={() => setGrupo(g.v)}>
            {g.l}
          </button>
        ))}
        <div className="spacer" />
        {citas && (
          <strong style={{ fontSize: 15 }}>
            {shown.length} cita{shown.length === 1 ? '' : 's'} en el período
          </strong>
        )}
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3>{chart ? chart.title : ''}</h3>
        {chart == null ? <span className="spinner" />
          : <BarChart data={chart.data} keys={chart.keys} labels={chart.labels} highlight={chart.highlight}
              format={(v) => String(v)} onDay={period === 'dia' ? null : onBar} />}
        {period !== 'dia' && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Toca una barra para ver el detalle.</div>}
      </div>

      {citas == null ? <span className="spinner spinner-lg" />
        : shown.length === 0 ? <div className="card"><div className="empty">No hay citas en este filtro.</div></div>
          : (
            <div className="cita-list">
              {shown.map((c) => (
                <div key={c.id} className="cita-row" onClick={() => setSelected(c)}>
                  <div className="cita-hora">{fmtHora(c.hora)}</div>
                  {period !== 'dia' && <div className="cita-fecha muted">{fmtFecha(c.fecha)}</div>}
                  <div className="cita-cliente">{c.nombre}</div>
                  <div className="cita-tel muted">{c.telefono || '—'}</div>
                  <div className="cita-servicio muted">{c.servicio}</div>
                  <span className={'badge hide-sm ' + (ORIGEN_BADGE[c.origen] || 'badge-on')}>{origenLabel(c.origen)}</span>
                  <select className="estado-select" value={c.estado} disabled={!!busy}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => changeEstado(c, e.target.value)}>
                    {ESTADOS.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
                  </select>
                  <svg className="cita-go" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              ))}
            </div>
          )}

    </>
  );
}

function EditPage({ cita, onBack, onSaved }) {
  const [nombre, setNombre] = useState(cita.nombre || '');
  const [telefono, setTelefono] = useState(cita.telefono || '');
  const [correo, setCorreo] = useState(cita.correo || '');
  const [servicio, setServicio] = useState(cita.servicio || '');
  const [fecha, setFecha] = useState(cita.fecha || '');
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
            {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
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
