// Lógica del panel de administración.
const $ = (id) => document.getElementById(id);
let resumen = null;

function opciones(select, items, etiquetaTodos) {
  const actual = select.value;
  select.innerHTML = `<option value="">${etiquetaTodos}</option>` +
    items.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  if ([...select.options].some((o) => o.value === actual)) select.value = actual;
}

async function cargarResumen() {
  resumen = await api('/api/admin/resumen');
  const m = resumen.modulo;
  $('sin-modulo').classList.toggle('hidden', !!m);
  $('btn-exportar').classList.toggle('hidden', !m);
  $('modulo-nombre').textContent = m ? m.nombre : 'Panel de administración';
  $('modulo-info').textContent = m ? `Módulo activo desde ${fechaCorta(m.creado_en.slice(0, 10))} · Hoy: ${fechaLarga(resumen.hoy)}` : `Hoy: ${fechaLarga(resumen.hoy)}`;
  $('s-est').textContent = resumen.totalEstudiantes ?? 0;
  $('s-fec').textContent = resumen.fechas?.length ?? 0;
  $('s-pres').textContent = resumen.totales?.presentes ?? 0;
  $('s-falt').textContent = resumen.totales?.faltas ?? 0;

  opciones($('f-fecha'), (resumen.fechas || []).map((f) => [f.id, fechaLarga(f.fecha)]), 'Todas');
  const ests = m ? await api('/api/admin/estudiantes') : [];
  const lista = ests.map((e) => [e.id, `${e.nro_registro} · ${e.nombre}`]);
  opciones($('f-est'), lista, 'Todos');
  opciones($('h-est'), lista, 'Todos');
}

// ---------- Asistencias ----------
async function cargarAsistencias() {
  const qs = new URLSearchParams({ fechaId: $('f-fecha').value, estudianteId: $('f-est').value });
  const { filas, totales: t } = await api(`/api/admin/asistencias?${qs}`);
  $('a-totales').textContent = `${filas.length} registros · ${t.presentes} presentes · ${t.faltas} faltas` +
    (t.pendientes ? ` · ${t.pendientes} pendientes hoy` : '') + (t.programadas ? ` · ${t.programadas} programadas` : '');
  $('a-tabla').innerHTML = filas.length ? filas.map((f) => `
    <tr class="${f.fecha === resumen.hoy ? 'today' : ''}">
      <td>${esc(fechaCorta(f.fecha))}</td>
      <td>${esc(f.nro_registro)}</td>
      <td>${esc(f.nombre)}</td>
      <td>${badge(f.estado)}${f.origen === 'ADMIN' ? ' <span class="small muted">(corregido)</span>' : ''}</td>
      <td>${esc(horaDe(f.marcado_en))}</td>
      <td>
        <select data-est="${f.estudiante_id}" data-fecha="${f.fecha_clase_id}" data-actual="${f.estado}" aria-label="Cambiar estado">
          <option value="" selected disabled>—</option>
          <option value="PRESENTE" ${f.estado === 'PRESENTE' ? 'disabled' : ''}>Presente</option>
          <option value="FALTA" ${f.estado === 'FALTA' ? 'disabled' : ''}>Falta</option>
        </select>
      </td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">No hay datos para mostrar.</td></tr>';
}

$('a-tabla').addEventListener('change', async (ev) => {
  const s = ev.target;
  if (s.tagName !== 'SELECT') return;
  const nuevo = s.value;
  if (!confirm(`¿Cambiar de ${ETIQUETA[s.dataset.actual]} a ${ETIQUETA[nuevo]}? El cambio quedará registrado.`)) { s.value = ''; return; }
  try {
    await api('/api/admin/asistencias', { method: 'PUT', body: { estudianteId: +s.dataset.est, fechaClaseId: +s.dataset.fecha, estado: nuevo } });
    toast('Asistencia actualizada.');
  } catch (e) { toast(e.message, 'error'); }
  await cargarResumen();
  cargarAsistencias();
});
$('f-fecha').onchange = cargarAsistencias;
$('f-est').onchange = cargarAsistencias;

// ---------- Estudiantes ----------
let buscarTimer;
async function cargarEstudiantes() {
  const lista = await api(`/api/admin/estudiantes?q=${encodeURIComponent($('buscar').value)}`);
  $('e-tabla').innerHTML = lista.length ? lista.map((e) => `
    <tr><td>${esc(e.nro_registro)}</td><td>${esc(e.nombre)}</td><td>${esc(e.correo)}</td>
      <td><button type="button" class="small" data-ver="${e.id}">Ver asistencias</button></td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">Sin resultados.</td></tr>';
}
$('buscar').oninput = () => { clearTimeout(buscarTimer); buscarTimer = setTimeout(cargarEstudiantes, 250); };
$('e-tabla').addEventListener('click', (ev) => {
  const id = ev.target.dataset?.ver;
  if (!id) return;
  $('f-fecha').value = ''; $('f-est').value = id;
  abrirTab('asistencias');
});

// ---------- Actividades ----------
const ACCIONES = {
  INGRESO: 'Ingreso', SALIDA: 'Cierre de sesión', MARCA_ASISTENCIA: 'Marcó asistencia',
  MODIFICA_ASISTENCIA: 'Modificó asistencia', ACTIVA_MODULO: 'Activó módulo', EXPORTA_EXCEL: 'Exportó Excel',
};
async function cargarActividades() {
  const qs = new URLSearchParams({ estudianteId: $('h-est').value, fecha: $('h-fecha').value });
  const lista = await api(`/api/admin/actividades?${qs}`);
  $('h-tabla').innerHTML = lista.length ? lista.map((a) => `
    <tr><td>${esc(fechaCorta(a.creado_en.slice(0, 10)))} ${esc(a.creado_en.slice(11, 16))}</td>
      <td>${esc(a.usuario)}</td><td>${a.rol === 'admin' ? 'Admin' : 'Estudiante'}</td>
      <td>${esc(ACCIONES[a.accion] || a.accion)}</td><td>${esc(a.detalle)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No hay actividades registradas.</td></tr>';
}
$('h-est').onchange = cargarActividades;
$('h-fecha').onchange = cargarActividades;
$('h-limpiar').onclick = () => { $('h-est').value = ''; $('h-fecha').value = ''; cargarActividades(); };

// ---------- Nuevo módulo ----------
$('form-subir').onsubmit = async (ev) => {
  ev.preventDefault();
  const fd = new FormData();
  fd.append('estudiantes', $('x-est').files[0]);
  fd.append('fechas', $('x-fec').files[0]);
  let r;
  try { r = await api('/api/admin/modulo/previsualizar', { method: 'POST', body: fd }); }
  catch (e) { toast(e.message, 'error'); return; }

  $('vp').classList.remove('hidden');
  const errs = [...r.errores.estudiantes.map((e) => `Estudiantes · ${e}`), ...r.errores.fechas.map((e) => `Fechas · ${e}`)];
  $('vp-errores').innerHTML = errs.length
    ? `<div class="alert error"><b>Corrige estos errores en el Excel y vuelve a subirlo:</b><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`
    : `<div class="alert ok">Archivos correctos: ${r.estudiantes.length} estudiantes y ${r.fechas.length} fechas listos para activar.</div>`;
  $('vp-est-t').textContent = `Estudiantes (${r.estudiantes.length})`;
  $('vp-fec-t').textContent = `Fechas (${r.fechas.length})`;
  $('vp-est').innerHTML = r.estudiantes.map((e) => `<tr><td>${e.fila}</td><td>${esc(e.nro_registro)}</td><td>${esc(e.nombre)}</td><td>${esc(e.correo)}</td></tr>`).join('');
  $('vp-fec').innerHTML = r.fechas.map((f) => `<tr><td>${f.fila}</td><td>${f.fecha ? esc(fechaLarga(f.fecha)) : '<span class="badge FALTA">inválida</span>'}</td><td>${esc(f.hora_inicio ?? '—')}</td><td>${esc(f.hora_fin ?? '—')}</td></tr>`).join('');
  $('vp-activar').classList.toggle('hidden', !r.valido);
};

$('btn-activar').onclick = async () => {
  const actual = resumen?.modulo;
  const msg = actual
    ? `Se desactivará "${actual.nombre}" y el nuevo módulo empezará sin asistencias.\nLos datos anteriores se conservan en la base de datos pero ya no se verán aquí.\n\n¿Continuar?`
    : '¿Activar este módulo?';
  if (!confirm(msg)) return;
  try {
    await api('/api/admin/modulo/activar', { method: 'POST', body: { nombre: $('nombre-modulo').value } });
    toast('Nuevo módulo activado.');
    $('form-subir').reset(); $('vp').classList.add('hidden'); $('nombre-modulo').value = '';
    await cargarResumen();
    abrirTab('asistencias');
  } catch (e) { toast(e.message, 'error'); }
};

// ---------- Pestañas ----------
const cargadores = { asistencias: cargarAsistencias, estudiantes: cargarEstudiantes, actividades: cargarActividades, modulo: () => {} };
function abrirTab(nombre) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === nombre));
  Object.keys(cargadores).forEach((t) => $(`tab-${t}`).classList.toggle('hidden', t !== nombre));
  Promise.resolve(cargadores[nombre]()).catch((e) => toast(e.message, 'error'));
}
document.querySelectorAll('.tabs button').forEach((b) => { b.onclick = () => abrirTab(b.dataset.tab); });

exigirSesion('admin').then(async (u) => {
  $('who').textContent = u.nombre;
  await cargarResumen();
  abrirTab(resumen.modulo ? 'asistencias' : 'modulo');
});
