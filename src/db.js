// Conexión a la base de datos SQLite y creación de tablas.
// SQLite guarda todo en un solo archivo (data/asistencia.db), así que no
// necesitas instalar ningún servidor de base de datos.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { ahora } = require('./services/fechas');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'asistencia.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS administradores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  creado_en     TEXT NOT NULL
);

-- Cada carga de Excel crea un módulo. Solo uno tiene activo = 1 (RN-01).
CREATE TABLE IF NOT EXISTS modulos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre     TEXT NOT NULL,
  activo     INTEGER NOT NULL DEFAULT 0,
  creado_en  TEXT NOT NULL,
  creado_por TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_un_modulo_activo ON modulos(activo) WHERE activo = 1;

CREATE TABLE IF NOT EXISTS estudiantes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id    INTEGER NOT NULL REFERENCES modulos(id),
  nro_registro TEXT NOT NULL,
  nombre       TEXT NOT NULL,
  correo       TEXT NOT NULL,
  UNIQUE (modulo_id, nro_registro),          -- RN-02
  UNIQUE (modulo_id, correo)
);

CREATE TABLE IF NOT EXISTS fechas_clase (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id   INTEGER NOT NULL REFERENCES modulos(id),
  fecha       TEXT NOT NULL,   -- YYYY-MM-DD
  hora_inicio TEXT NOT NULL,   -- HH:MM (informativo)
  hora_fin    TEXT NOT NULL,
  UNIQUE (modulo_id, fecha)
);

-- Una fila por estudiante y fecha cuando hay marca o corrección.
-- Si no hay fila y la fecha ya pasó, el estado se calcula como FALTA (RN-05).
CREATE TABLE IF NOT EXISTS asistencias (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  estudiante_id   INTEGER NOT NULL REFERENCES estudiantes(id),
  fecha_clase_id  INTEGER NOT NULL REFERENCES fechas_clase(id),
  estado          TEXT NOT NULL CHECK (estado IN ('PRESENTE','FALTA')),
  marcado_en      TEXT,        -- fecha y hora real de la marca del estudiante
  origen          TEXT NOT NULL CHECK (origen IN ('ESTUDIANTE','ADMIN')),
  actualizado_en  TEXT NOT NULL,
  UNIQUE (estudiante_id, fecha_clase_id)     -- RN-03
);

-- Auditoría de cambios hechos por el administrador (RF-07, RN-07).
CREATE TABLE IF NOT EXISTS auditoria_asistencia (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  estudiante_id   INTEGER NOT NULL REFERENCES estudiantes(id),
  fecha_clase_id  INTEGER NOT NULL REFERENCES fechas_clase(id),
  valor_anterior  TEXT NOT NULL,
  valor_nuevo     TEXT NOT NULL,
  usuario         TEXT NOT NULL,
  creado_en       TEXT NOT NULL
);

-- Historial general de acciones (RF-09).
CREATE TABLE IF NOT EXISTS actividades (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  modulo_id         INTEGER REFERENCES modulos(id),
  usuario           TEXT NOT NULL,
  rol               TEXT NOT NULL,
  accion            TEXT NOT NULL,
  detalle           TEXT,
  estudiante_id     INTEGER REFERENCES estudiantes(id),
  creado_en         TEXT NOT NULL
);
`);

// Ejecuta varias operaciones como una sola: o se guardan todas o ninguna.
function transaccion(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Crea el administrador inicial usando los datos del archivo .env
function crearAdminInicial() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM administradores').get();
  if (n > 0) return;
  const usuario = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO administradores (usuario, password_hash, nombre, creado_en) VALUES (?, ?, ?, ?)')
    .run(usuario, hash, process.env.ADMIN_NAME || 'Administrador', ahora());
  console.log(`Administrador inicial creado: usuario "${usuario}"`);
}

module.exports = { db, transaccion, crearAdminInicial };
