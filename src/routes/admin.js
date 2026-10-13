const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { db, transaccion } = require('../db');
const { hoy, ahora } = require('../services/fechas');
const { moduloActivo, registrarActividad, asistenciasDelModulo, totales } = require('../services/modulo');
const { leerEstudiantes, leerFechas } = require('../services/excel');
const { soloAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(soloAdmin);

const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const etiqueta = { PRESENTE: 'Presente', FALTA: 'Falta', PENDIENTE: 'Pendiente', PROGRAMADA: 'Programada' };

// Datos generales para la cabecera del panel
router.get('/resumen', (req, res) => {
  const modulo = moduloActivo();
  if (!modulo) return res.json({ modulo: null, hoy: hoy() });
  const nEst = db.prepare('SELECT COUNT(*) AS n FROM estudiantes WHERE modulo_id = ?').get(modulo.id).n;
  const fechas = db.prepare('SELECT id, fecha, hora_inicio, hora_fin FROM fechas_clase WHERE modulo_id = ? ORDER BY fecha').all(modulo.id);
  res.json({ modulo, hoy: hoy(), totalEstudiantes: nEst, fechas, totales: totales(asistenciasDelModulo(modulo.id)) });
});

// RF-06: lista de estudiantes con búsqueda
router.get('/estudiantes', (req, res) => {
  const modulo = moduloActivo();
  if (!modulo) return res.json([]);
  const q = `%${String(req.query.q ?? '').trim().toLowerCase()}%`;
  const lista = db.prepare(`SELECT id, nro_registro, nombre, correo FROM estudiantes
                            WHERE modulo_id = ? AND (lower(nombre) LIKE ? OR lower(nro_registro) LIKE ?)
                            ORDER BY nombre`).all(modulo.id, q, q);
  res.json(lista);
});

// RF-08: vista general con filtros por fecha o estudiante
router.get('/asistencias', (req, res) => {
  const modulo = moduloActivo();
  if (!modulo) return res.json({ filas: [], totales: totales([]) });
  const filas = asistenciasDelModulo(modulo.id, {
    fechaId: Number(req.query.fechaId) || null,
    estudianteId: Number(req.query.estudianteId) || null,
  });
  res.json({ filas, totales: totales(filas) });
});

// RF-07: el admin cambia Presente/Falta en cualquier fecha, con auditoría
router.put('/asistencias', (req, res) => {
  const modulo = moduloActivo();
  const estudianteId = Number(req.body?.estudianteId);
  const fechaClaseId = Number(req.body?.fechaClaseId);
  const nuevo = req.body?.estado;
  if (!['PRESENTE', 'FALTA'].includes(nuevo)) return res.status(400).json({ error: 'Estado inválido.' });

  const est = db.prepare('SELECT * FROM estudiantes WHERE id = ? AND modulo_id = ?').get(estudianteId, modulo?.id);
  const clase = db.prepare('SELECT * FROM fechas_clase WHERE id = ? AND modulo_id = ?').get(fechaClaseId, modulo?.id);
  if (!est || !clase) return res.status(404).json({ error: 'Estudiante o fecha no pertenecen al módulo activo.' });

  const actual = asistenciasDelModulo(modulo.id, { estudianteId, fechaId: fechaClaseId })[0];
  if (actual.estado === nuevo) return res.json({ ok: true, sinCambios: true });

  const admin = req.session.usuario.usuario;
  const momento = ahora();
  transaccion(() => {
    db.prepare(`INSERT INTO asistencias (estudiante_id, fecha_clase_id, estado, marcado_en, origen, actualizado_en)
                VALUES (?, ?, ?, NULL, 'ADMIN', ?)
                ON CONFLICT (estudiante_id, fecha_clase_id)
                DO UPDATE SET estado = excluded.estado, origen = 'ADMIN', actualizado_en = excluded.actualizado_en`)
      .run(estudianteId, fechaClaseId, nuevo, momento);
    db.prepare(`INSERT INTO auditoria_asistencia (estudiante_id, fecha_clase_id, valor_anterior, valor_nuevo, usuario, creado_en)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run(estudianteId, fechaClaseId, actual.estado, nuevo, admin, momento);
    registrarActividad({ moduloId: modulo.id, usuario: admin, rol: 'admin', accion: 'MODIFICA_ASISTENCIA',
      detalle: `${est.nro_registro} ${est.nombre} · clase ${clase.fecha}: ${etiqueta[actual.estado]} → ${etiqueta[nuevo]}`,
      estudianteId });
  });
  res.json({ ok: true });
});

// RF-10: historial de actividades del módulo activo
router.get('/actividades', (req, res) => {
  const modulo = moduloActivo();
  const filtros = [modulo ? 'a.modulo_id = ?' : 'a.modulo_id IS NULL'];
  const params = modulo ? [modulo.id] : [];
  if (Number(req.query.estudianteId)) { filtros.push('a.estudiante_id = ?'); params.push(Number(req.query.estudianteId)); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha ?? '')) { filtros.push('substr(a.creado_en, 1, 10) = ?'); params.push(req.query.fecha); }
  const lista = db.prepare(`SELECT a.*, e.nro_registro, e.nombre AS estudiante
                            FROM actividades a LEFT JOIN estudiantes e ON e.id = a.estudiante_id
                            WHERE ${filtros.join(' AND ')}
                            ORDER BY a.id DESC LIMIT 500`).all(...params);
  res.json(lista);
});

// RF-11, RF-12, RF-16: subir los dos Excel y ver la vista previa (todavía no guarda nada)
router.post('/modulo/previsualizar',
  subir.fields([{ name: 'estudiantes', maxCount: 1 }, { name: 'fechas', maxCount: 1 }]),
  async (req, res) => {
    const fEst = req.files?.estudiantes?.[0];
    const fFec = req.files?.fechas?.[0];
    if (!fEst || !fFec) return res.status(400).json({ error: 'Sube los dos archivos: estudiantes y fechas.' });

    const est = await leerEstudiantes(fEst.buffer);
    const fec = await leerFechas(fFec.buffer);
    const valido = est.errores.length === 0 && fec.errores.length === 0;

    req.session.vistaPrevia = valido ? { estudiantes: est.estudiantes, fechas: fec.fechas } : null;
    res.json({
      valido,
      estudiantes: est.estudiantes,
      fechas: fec.fechas,
      errores: { estudiantes: est.errores, fechas: fec.errores },
    });
  });

// RF-13, RF-15: activar el nuevo módulo. El anterior se desactiva pero NO se borra.
router.post('/modulo/activar', (req, res) => {
  const vp = req.session.vistaPrevia;
  if (!vp) return res.status(400).json({ error: 'Primero sube y revisa los archivos.' });
  const nombre = String(req.body?.nombre ?? '').trim() || `Módulo ${hoy()}`;
  const admin = req.session.usuario.usuario;
  const anterior = moduloActivo();

  const nuevoId = transaccion(() => {
    db.prepare('UPDATE modulos SET activo = 0 WHERE activo = 1').run();
    const { lastInsertRowid } = db.prepare('INSERT INTO modulos (nombre, activo, creado_en, creado_por) VALUES (?, 1, ?, ?)')
      .run(nombre, ahora(), admin);
    const id = Number(lastInsertRowid);
    const insEst = db.prepare('INSERT INTO estudiantes (modulo_id, nro_registro, nombre, correo) VALUES (?, ?, ?, ?)');
    for (const e of vp.estudiantes) insEst.run(id, e.nro_registro, e.nombre, e.correo);
    const insFec = db.prepare('INSERT INTO fechas_clase (modulo_id, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');
    for (const f of vp.fechas) insFec.run(id, f.fecha, f.hora_inicio, f.hora_fin);
    registrarActividad({ moduloId: id, usuario: admin, rol: 'admin', accion: 'ACTIVA_MODULO',
      detalle: `${nombre}: ${vp.estudiantes.length} estudiantes, ${vp.fechas.length} fechas` +
        (anterior ? ` (reemplaza a "${anterior.nombre}")` : '') });
    return id;
  });

  req.session.vistaPrevia = null;
  res.json({ ok: true, moduloId: nuevoId });
});

// RF-17: exportar asistencias del módulo activo a Excel
router.get('/exportar', async (req, res) => {
  const modulo = moduloActivo();
  if (!modulo) return res.status(400).json({ error: 'No hay módulo activo.' });
  const filas = asistenciasDelModulo(modulo.id);
  const fechas = [...new Set(filas.map((f) => f.fecha))];
  const porEst = new Map();
  for (const f of filas) {
    if (!porEst.has(f.estudiante_id)) porEst.set(f.estudiante_id, { f, estados: {} });
    porEst.get(f.estudiante_id).estados[f.fecha] = f.estado;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Asistencias');
  const fmt = (d) => d.split('-').reverse().join('/');
  ws.addRow(['Número de registro', 'Nombre completo', 'Correo', ...fechas.map(fmt), 'Presentes', 'Faltas']);
  ws.getRow(1).font = { bold: true };
  for (const { f, estados } of porEst.values()) {
    const vals = fechas.map((d) => etiqueta[estados[d]]);
    ws.addRow([f.nro_registro, f.nombre, f.correo, ...vals,
      vals.filter((v) => v === 'Presente').length, vals.filter((v) => v === 'Falta').length]);
  }
  ws.columns.forEach((c, i) => { c.width = i < 3 ? [18, 30, 30][i] : 12; });

  const detalle = wb.addWorksheet('Detalle');
  detalle.addRow(['Número de registro', 'Nombre', 'Fecha', 'Estado', 'Hora de marca', 'Origen']);
  detalle.getRow(1).font = { bold: true };
  for (const f of filas) detalle.addRow([f.nro_registro, f.nombre, fmt(f.fecha), etiqueta[f.estado], f.marcado_en?.slice(11) ?? '', f.origen ?? '']);

  registrarActividad({ moduloId: modulo.id, usuario: req.session.usuario.usuario, rol: 'admin', accion: 'EXPORTA_EXCEL' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="asistencias_${hoy()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
