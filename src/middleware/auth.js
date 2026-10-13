const { db } = require('../db');
const { moduloActivo } = require('../services/modulo');

function soloAdmin(req, res, next) {
  if (req.session.usuario?.rol === 'admin') return next();
  res.status(401).json({ error: 'Debes iniciar sesión como administrador.' });
}

// Además de revisar la sesión, confirma que el estudiante siga en el módulo activo
// (si el admin activó un módulo nuevo, la sesión anterior deja de valer).
function soloEstudiante(req, res, next) {
  const u = req.session.usuario;
  if (u?.rol !== 'estudiante') return res.status(401).json({ error: 'Debes iniciar sesión.' });
  const modulo = moduloActivo();
  const est = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(u.id);
  if (!modulo || !est || est.modulo_id !== modulo.id) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Tu sesión ya no corresponde al módulo activo. Vuelve a ingresar.' });
  }
  req.estudiante = est;
  req.modulo = modulo;
  next();
}

module.exports = { soloAdmin, soloEstudiante };
