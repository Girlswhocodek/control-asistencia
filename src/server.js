// Punto de entrada: levanta el servidor web.
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const session = require('express-session');
const { crearAdminInicial } = require('./db');
const { ZONA } = require('./services/fechas');

crearAdminInicial();

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'cambia-este-secreto',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
}));

// API (lo que llaman las pantallas con fetch)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/estudiante', require('./routes/estudiante'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Pantallas (HTML, CSS y JS de la carpeta public)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Manejo de errores: nunca mostrar detalles internos al usuario
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'El archivo supera los 5 MB.' });
  if (err.status && err.expose) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error en el servidor.' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}  (zona horaria: ${ZONA})`);
  if (process.env.FECHA_PRUEBA) console.log(`⚠  Modo prueba: el sistema cree que hoy es ${process.env.FECHA_PRUEBA}`);
});
