// Utilidades de fecha y hora en la zona horaria del sistema (por defecto Bolivia).
// Todo se maneja como texto: fechas 'YYYY-MM-DD' y fecha-hora 'YYYY-MM-DD HH:MM:SS'.
const ZONA = process.env.ZONA_HORARIA || 'America/La_Paz';

function partes(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

// Fecha de hoy. Si en .env pones FECHA_PRUEBA=2026-10-05 puedes simular otro día
// para probar la marca de asistencia (déjalo vacío en uso real).
function hoy() {
  if (process.env.FECHA_PRUEBA) return process.env.FECHA_PRUEBA;
  const p = partes();
  return `${p.year}-${p.month}-${p.day}`;
}

function ahora() {
  const p = partes();
  const fecha = process.env.FECHA_PRUEBA || `${p.year}-${p.month}-${p.day}`;
  return `${fecha} ${p.hour}:${p.minute}:${p.second}`;
}

// Estado de un estudiante en una fecha:
//  - si hay registro guardado, ese manda (PRESENTE / FALTA)
//  - si no hay y la fecha ya pasó  -> FALTA (RN-05)
//  - si es hoy                     -> PENDIENTE (aún puede marcar)
//  - si es futura                  -> PROGRAMADA
function estadoDe(registro, fecha, hoyStr = hoy()) {
  if (registro) return registro.estado;
  if (fecha < hoyStr) return 'FALTA';
  if (fecha === hoyStr) return 'PENDIENTE';
  return 'PROGRAMADA';
}

module.exports = { hoy, ahora, estadoDe, ZONA };
