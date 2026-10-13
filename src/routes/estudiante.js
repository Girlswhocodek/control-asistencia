const express = require('express');
const { db } = require('../db');
const { hoy, ahora } = require('../services/fechas');
const { asistenciasDelModulo, totales, registrarActividad } = require('../services/modulo');
const { soloEstudiante } = require('../middleware/auth');

const router = express.Router();
router.use(soloEstudiante);

// RF-05: historial personal con resumen
router.get('/historial', (req, res) => {
  const filas = asistenciasDelModulo(req.modulo.id, { estudianteId: req.estudiante.id });
  const hoyStr = hoy();
  const claseHoy = filas.find((f) => f.fecha === hoyStr) || null;
  res.json({
    estudiante: { nro_registro: req.estudiante.nro_registro, nombre: req.estudiante.nombre, correo: req.estudiante.correo },
    modulo: { nombre: req.modulo.nombre },
    hoy: hoyStr,
    claseHoy,
    puedeMarcar: claseHoy?.estado === 'PENDIENTE',
    fechas: filas.map(({ fecha, hora_inicio, hora_fin, estado, marcado_en, origen }) =>
      ({ fecha, hora_inicio, hora_fin, estado, marcado_en, origen })),
    resumen: totales(filas),
  });
});

// RF-03: marcar asistencia solo el día de clase y una sola vez
router.post('/marcar', (req, res) => {
  const hoyStr = hoy();
  const clase = db.prepare('SELECT * FROM fechas_clase WHERE modulo_id = ? AND fecha = ?').get(req.modulo.id, hoyStr);
  if (!clase) return res.status(400).json({ error: 'Hoy no hay clase programada.' });

  const existe = db.prepare('SELECT * FROM asistencias WHERE estudiante_id = ? AND fecha_clase_id = ?')
    .get(req.estudiante.id, clase.id);
  if (existe) return res.status(409).json({ error: 'Ya tienes un registro para la clase de hoy.' });

  const momento = ahora();
  try {
    db.prepare(`INSERT INTO asistencias (estudiante_id, fecha_clase_id, estado, marcado_en, origen, actualizado_en)
                VALUES (?, ?, 'PRESENTE', ?, 'ESTUDIANTE', ?)`)
      .run(req.estudiante.id, clase.id, momento, momento);
  } catch (e) {
    // Dos clics casi simultáneos: la restricción UNIQUE evita el duplicado
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Ya tienes un registro para la clase de hoy.' });
    throw e;
  }
  registrarActividad({ moduloId: req.modulo.id, usuario: req.estudiante.nro_registro, rol: 'estudiante',
    accion: 'MARCA_ASISTENCIA', detalle: `Clase ${clase.fecha} · ${req.estudiante.nombre}`, estudianteId: req.estudiante.id });
  res.json({ ok: true, marcado_en: momento });
});

module.exports = router;
