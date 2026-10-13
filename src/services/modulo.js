const { db } = require('../db');
const { hoy, ahora, estadoDe } = require('./fechas');

function moduloActivo() {
  return db.prepare('SELECT * FROM modulos WHERE activo = 1').get() || null;
}

function registrarActividad({ moduloId, usuario, rol, accion, detalle = null, estudianteId = null }) {
  db.prepare(`INSERT INTO actividades (modulo_id, usuario, rol, accion, detalle, estudiante_id, creado_en)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(moduloId ?? null, usuario, rol, accion, detalle, estudianteId, ahora());
}

// Devuelve todas las combinaciones estudiante × fecha del módulo con su estado calculado.
function asistenciasDelModulo(moduloId, { fechaId = null, estudianteId = null } = {}) {
  const hoyStr = hoy();
  const filtros = ['e.modulo_id = ?'];
  const params = [moduloId];
  if (fechaId) { filtros.push('f.id = ?'); params.push(fechaId); }
  if (estudianteId) { filtros.push('e.id = ?'); params.push(estudianteId); }

  const filas = db.prepare(`
    SELECT e.id AS estudiante_id, e.nro_registro, e.nombre, e.correo,
           f.id AS fecha_clase_id, f.fecha, f.hora_inicio, f.hora_fin,
           a.estado, a.marcado_en, a.origen
    FROM estudiantes e
    JOIN fechas_clase f ON f.modulo_id = e.modulo_id
    LEFT JOIN asistencias a ON a.estudiante_id = e.id AND a.fecha_clase_id = f.id
    WHERE ${filtros.join(' AND ')}
    ORDER BY f.fecha, e.nombre
  `).all(...params);

  return filas.map((r) => ({
    ...r,
    estado: estadoDe(r.estado ? { estado: r.estado } : null, r.fecha, hoyStr),
  }));
}

function totales(filas) {
  const t = { presentes: 0, faltas: 0, pendientes: 0, programadas: 0 };
  for (const f of filas) {
    if (f.estado === 'PRESENTE') t.presentes++;
    else if (f.estado === 'FALTA') t.faltas++;
    else if (f.estado === 'PENDIENTE') t.pendientes++;
    else t.programadas++;
  }
  return t;
}

module.exports = { moduloActivo, registrarActividad, asistenciasDelModulo, totales };
