# Sistema de Control de Asistencia

Aplicación web para registrar y consultar la asistencia de estudiantes. Tiene dos tipos de usuario:

- **Administrador**: importa estudiantes y fechas desde Excel, ve y corrige asistencias, revisa el historial de actividades, activa nuevos módulos y exporta a Excel.
- **Estudiante**: entra con su correo o número de registro, marca su asistencia **solo el día de clase** y ve su historial.

**Tecnologías:** Node.js + Express (servidor), SQLite (base de datos en un archivo, no hay que instalar nada aparte), HTML/CSS/JavaScript (pantallas).

Diagramas (casos de uso, base de datos, flujos y arquitectura): [`docs/diagramas.md`](docs/diagramas.md).

---

## 1. Requisitos

| Programa | Para qué | Cómo verificar |
|---|---|---|
| **Node.js 22.13 o superior** (recomendado: la versión LTS) | Ejecutar la app | `node -v` |
| **Git** | Subir a GitHub | `git --version` |
| VS Code | Editar el código | — |

Si `node -v` muestra una versión menor a 22.13, descarga la LTS desde https://nodejs.org e instálala.

## 2. Instalación (una sola vez)

Abre la terminal de VS Code (**Terminal → New Terminal**) dentro de la carpeta del proyecto y ejecuta:

```bash
npm install
```

Esto descarga las librerías en la carpeta `node_modules/` (no se sube a GitHub).

### Crear el archivo `.env`

El archivo `.env` guarda la configuración y contraseñas. **No viene en el repositorio** porque es privado. Créalo copiando la plantilla:

```bash
# Windows (PowerShell)
copy .env.example .env

# Mac / Linux
cp .env.example .env
```

Luego ábrelo y cambia al menos `SESSION_SECRET` y `ADMIN_PASSWORD`.

> El administrador se crea **automáticamente la primera vez** que arranca la app, con el usuario y contraseña del `.env`. Si después cambias la contraseña en el `.env`, no se actualiza sola: borra la carpeta `data/` (se pierden los datos) o cámbiala en la base.

## 3. Ejecutar

```bash
npm run dev     # modo desarrollo: se reinicia solo al guardar cambios
# o
npm start       # modo normal
```

Abre **http://localhost:3000** en el navegador.

La base de datos se crea sola en `data/asistencia.db`.

## 4. Primer uso (prueba rápida)

1. Entra como **Administrador** con el usuario y contraseña del `.env`.
2. Ve a **Nuevo módulo**, sube `ejemplos/estudiantes.xlsx` y `ejemplos/fechas.xlsx`, revisa la vista previa y presiona **Activar nuevo módulo**.
3. Cierra sesión y entra como **Estudiante** con `1001` o `juan@gmail.com`.
4. Si hoy es fecha de clase, el botón **Marcar asistencia** estará habilitado.

Para regenerar los Excel de ejemplo con fechas alrededor de hoy: `npm run ejemplos`.

Para probar otro día sin esperar, en `.env` pon `FECHA_PRUEBA=2026-10-15` y reinicia la app (quítalo después).

## 5. Formato de los Excel

La primera fila deben ser los encabezados (no importan mayúsculas ni tildes).

**Estudiantes**

| Número de registro | Nombre completo | Correo electrónico |
|---|---|---|
| 1001 | Juan Pérez | juan@gmail.com |

**Fechas de clase**

| Fecha | Hora inicio | Hora fin |
|---|---|---|
| 05/10/2026 | 18:00 | 21:00 |

Si hay errores (campos vacíos, registros o correos repetidos, fechas u horas inválidas) el sistema indica la fila y el problema, y no permite activar hasta corregirlos.

## 6. Estructura del proyecto

```
proyecto/
├── src/                     ← servidor (backend)
│   ├── server.js            ← punto de entrada
│   ├── db.js                ← conexión y creación de tablas
│   ├── middleware/auth.js   ← protege rutas por rol
│   ├── routes/              ← endpoints de la API
│   │   ├── auth.js          ← login / logout
│   │   ├── estudiante.js    ← historial y marcar
│   │   └── admin.js         ← estudiantes, asistencias, actividades, importar, exportar
│   └── services/            ← lógica reutilizable
│       ├── excel.js         ← lectura y validación de Excel
│       ├── modulo.js        ← módulo activo, estados, actividades
│       └── fechas.js        ← fecha de hoy y estados Presente/Falta
├── public/                  ← pantallas (frontend)
│   ├── index.html           ← login
│   ├── estudiante.html
│   ├── admin.html
│   ├── css/styles.css
│   └── js/ (comun.js, admin.js)
├── docs/diagramas.md        ← diagramas
├── ejemplos/                ← Excel de prueba
├── scripts/generar-ejemplos.js
├── .env.example             ← plantilla de configuración
└── package.json
```

## 7. Cómo se cumplen los requerimientos

| Requerimiento | Dónde |
|---|---|
| RF-01, RF-02 Acceso | `routes/auth.js`, `index.html` |
| RF-03 Marcar asistencia (solo el día, una vez) | `routes/estudiante.js` + `UNIQUE` en la tabla `asistencias` |
| RF-04, RN-05 Falta automática | `services/fechas.js` → `estadoDe()` |
| RF-05 Historial personal | `estudiante.html` |
| RF-06 Lista y búsqueda | pestaña *Estudiantes* |
| RF-07, RN-07 Modificar con auditoría | `PUT /api/admin/asistencias` + tabla `auditoria_asistencia` |
| RF-08 Vista general con filtros y totales | pestaña *Asistencias* |
| RF-09, RF-10 Actividades | tabla `actividades`, pestaña *Historial de actividades* |
| RF-11, RF-12 Importar Excel | `services/excel.js` |
| RF-13, RF-15, RN-08 Nuevo módulo sin borrar el anterior | `POST /api/admin/modulo/activar` |
| RF-14 Persistencia | SQLite en `data/asistencia.db` |
| RF-16 Vista previa | pestaña *Nuevo módulo* |
| RF-17 Exportar Excel | botón *Exportar a Excel* |
| RF-18 Mensajes | avisos en pantalla |

## 8. Notas

- Según el requerimiento, el estudiante entra **sin contraseña** (solo correo o número de registro).
- Las sesiones se guardan en memoria: al reiniciar el servidor todos deben volver a ingresar.
- Los horarios son informativos; la marca se habilita todo el día de clase (zona horaria configurable en `.env`).
