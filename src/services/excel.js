// Lectura y validación de los Excel de estudiantes y fechas (RF-11, RF-12).
const ExcelJS = require('exceljs');

// "Número de registro" -> "numeroderegistro" para comparar encabezados sin tildes ni espacios
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

const COLUMNAS_ESTUDIANTES = {
  nro_registro: ['numeroderegistro', 'numeroregistro', 'nroderegistro', 'nroregistro', 'registro', 'nro'],
  nombre: ['nombrecompleto', 'nombre', 'nombres'],
  correo: ['correoelectronico', 'correo', 'email', 'mail'],
};
const COLUMNAS_FECHAS = {
  fecha: ['fecha', 'fechadeclase'],
  hora_inicio: ['horainicio', 'horadeinicio', 'inicio'],
  hora_fin: ['horafin', 'horadefin', 'fin'],
};

// ExcelJS devuelve a veces objetos (texto enriquecido, fórmulas, hipervínculos)
function valorCelda(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return valorCelda(v.result);
    if ('text' in v) return valorCelda(v.text);
    return null;
  }
  return v;
}

async function leerHoja(buffer, columnas) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw Object.assign(new Error('El archivo no es un Excel válido (.xlsx).'), { status: 400, expose: true });
  }
  const ws = wb.worksheets[0];
  if (!ws) throw Object.assign(new Error('El Excel no tiene hojas.'), { status: 400, expose: true });

  // Mapear cada columna requerida a su número de columna en el Excel
  const encabezados = {};
  ws.getRow(1).eachCell((cell, col) => { encabezados[normalizar(valorCelda(cell.value))] = col; });
  const mapa = {};
  const faltantes = [];
  for (const [campo, alias] of Object.entries(columnas)) {
    const encontrado = alias.find((a) => encabezados[a]);
    if (encontrado) mapa[campo] = encabezados[encontrado];
    else faltantes.push(alias[0]);
  }
  if (faltantes.length) {
    return { filas: [], errores: [`Faltan columnas en la fila 1: ${faltantes.join(', ')}`] };
  }

  const filas = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const datos = {};
    let vacia = true;
    for (const [campo, col] of Object.entries(mapa)) {
      const v = valorCelda(row.getCell(col).value);
      datos[campo] = v;
      if (v !== null && String(v).trim() !== '') vacia = false;
    }
    if (!vacia) filas.push({ fila: n, datos });
  });
  return { filas, errores: [] };
}

const texto = (v) => (v == null ? '' : String(v).trim());
const pad = (n) => String(n).padStart(2, '0');

// Acepta Date de Excel, número de serie, "dd/mm/yyyy" o "yyyy-mm-dd"
function aFecha(v) {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'number') return aFecha(new Date(Math.round((v - 25569) * 86400000)));
  const s = texto(v);
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  let y, mo, d;
  if (m) [, d, mo, y] = m;
  else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, mo, d] = m;
  else return null;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null; // ej. 31/02
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// Acepta hora de Excel (Date o fracción del día) o texto "18:00"
function aHora(v) {
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const min = Math.round(v * 24 * 60);
    return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  }
  const m = texto(v).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${pad(m[1])}:${m[2]}`;
}

async function leerEstudiantes(buffer) {
  const { filas, errores } = await leerHoja(buffer, COLUMNAS_ESTUDIANTES);
  const estudiantes = [];
  const vistosNro = new Map();
  const vistosCorreo = new Map();
  for (const { fila, datos } of filas) {
    let nro = datos.nro_registro;
    nro = typeof nro === 'number' ? String(Math.trunc(nro)) : texto(nro);
    const nombre = texto(datos.nombre);
    const correo = texto(datos.correo).toLowerCase();
    const errs = [];
    if (!nro) errs.push('falta el número de registro');
    if (!nombre) errs.push('falta el nombre completo');
    if (!correo) errs.push('falta el correo');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) errs.push(`correo inválido "${correo}"`);
    if (nro && vistosNro.has(nro)) errs.push(`número de registro ${nro} repetido (ya está en la fila ${vistosNro.get(nro)})`);
    if (correo && vistosCorreo.has(correo)) errs.push(`correo ${correo} repetido (ya está en la fila ${vistosCorreo.get(correo)})`);
    if (errs.length) errores.push(`Fila ${fila}: ${errs.join('; ')}`);
    if (nro && !vistosNro.has(nro)) vistosNro.set(nro, fila);
    if (correo && !vistosCorreo.has(correo)) vistosCorreo.set(correo, fila);
    estudiantes.push({ fila, nro_registro: nro, nombre, correo });
  }
  if (!filas.length && !errores.length) errores.push('El archivo no tiene estudiantes.');
  return { estudiantes, errores };
}

async function leerFechas(buffer) {
  const { filas, errores } = await leerHoja(buffer, COLUMNAS_FECHAS);
  const fechas = [];
  const vistas = new Map();
  for (const { fila, datos } of filas) {
    const fecha = aFecha(datos.fecha);
    const hora_inicio = aHora(datos.hora_inicio);
    const hora_fin = aHora(datos.hora_fin);
    const errs = [];
    if (!fecha) errs.push('fecha vacía o inválida (usa dd/mm/aaaa)');
    if (!hora_inicio) errs.push('hora de inicio vacía o inválida (usa HH:MM)');
    if (!hora_fin) errs.push('hora de fin vacía o inválida (usa HH:MM)');
    if (hora_inicio && hora_fin && hora_fin <= hora_inicio) errs.push('la hora de fin debe ser mayor a la de inicio');
    if (fecha && vistas.has(fecha)) errs.push(`fecha repetida (ya está en la fila ${vistas.get(fecha)})`);
    if (errs.length) errores.push(`Fila ${fila}: ${errs.join('; ')}`);
    if (fecha && !vistas.has(fecha)) vistas.set(fecha, fila);
    fechas.push({ fila, fecha, hora_inicio, hora_fin });
  }
  if (!filas.length && !errores.length) errores.push('El archivo no tiene fechas de clase.');
  fechas.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return { fechas, errores };
}

module.exports = { leerEstudiantes, leerFechas };
