const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { moduloActivo, registrarActividad } = require('../services/modulo');

const router = express.Router();

// RF-01: el estudiante entra con correo o número de registro
router.post('/estudiante', (req, res) => {
  const id = String(req.body?.identificador ?? '').trim();
  if (!id) return res.status(400).json({ error: 'Ingresa tu correo o número de registro.' });
  const modulo = moduloActivo();
  if (!modulo) return res.status(400).json({ error: 'No hay un módulo activo en este momento.' });

  const est = db.prepare(`SELECT * FROM estudiantes
                          WHERE modulo_id = ? AND (nro_registro = ? OR correo = lower(?))`)
    .get(modulo.id, id, id);
  if (!est) return res.status(401).json({ error: 'No encontramos un estudiante activo con esos datos.' });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
    req.session.usuario = { rol: 'estudiante', id: est.id, nombre: est.nombre, usuario: est.nro_registro };
    registrarActividad({ moduloId: modulo.id, usuario: est.nro_registro, rol: 'estudiante',
      accion: 'INGRESO', detalle: est.nombre, estudianteId: est.id });
    res.json({ rol: 'estudiante', nombre: est.nombre });
  });
});

// RF-02: el administrador entra con usuario y contraseña
router.post('/admin', (req, res) => {
  const usuario = String(req.body?.usuario ?? '').trim();
  const password = String(req.body?.password ?? '');
  const admin = db.prepare('SELECT * FROM administradores WHERE usuario = ?').get(usuario);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'No se pudo iniciar sesión.' });
    req.session.usuario = { rol: 'admin', id: admin.id, nombre: admin.nombre, usuario: admin.usuario };
    registrarActividad({ moduloId: moduloActivo()?.id, usuario: admin.usuario, rol: 'admin', accion: 'INGRESO' });
    res.json({ rol: 'admin', nombre: admin.nombre });
  });
});

router.post('/logout', (req, res) => {
  const u = req.session.usuario;
  if (u) {
    registrarActividad({ moduloId: moduloActivo()?.id, usuario: u.usuario, rol: u.rol, accion: 'SALIDA',
      estudianteId: u.rol === 'estudiante' ? u.id : null });
  }
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  res.json({ usuario: req.session.usuario || null });
});

module.exports = router;
