// Genera Excel de ejemplo en la carpeta ejemplos/ para probar la importación.
// Uso: npm run ejemplos
// Las fechas se arman alrededor de HOY (2 clases pasadas, hoy y 3 futuras)
// para que puedas probar enseguida la marca de asistencia.
const path = require('path');
const ExcelJS = require('exceljs');

const carpeta = path.join(__dirname, '..', 'ejemplos');

async function estudiantes() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Estudiantes');
  ws.columns = [
    { header: 'Número de registro', key: 'nro', width: 20 },
    { header: 'Nombre completo', key: 'nombre', width: 30 },
    { header: 'Correo electrónico', key: 'correo', width: 30 },
  ];
  [
    [1001, 'Juan Pérez', 'juan@gmail.com'],
    [1002, 'María López', 'maria@gmail.com'],
    [1003, 'Carlos Rojas', 'carlos@gmail.com'],
    [1004, 'Ana Gutiérrez', 'ana@gmail.com'],
    [1005, 'Luis Mamani', 'luis@gmail.com'],
  ].forEach(([nro, nombre, correo]) => ws.addRow({ nro, nombre, correo }));
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(path.join(carpeta, 'estudiantes.xlsx'));
}

async function fechas() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fechas');
  ws.columns = [
    { header: 'Fecha', key: 'fecha', width: 14, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Hora inicio', key: 'ini', width: 12 },
    { header: 'Hora fin', key: 'fin', width: 12 },
  ];
  const hoy = new Date();
  for (const delta of [-5, -2, 0, 2, 5, 7]) {
    const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + delta));
    ws.addRow({ fecha: d, ini: '18:00', fin: '21:00' });
  }
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(path.join(carpeta, 'fechas.xlsx'));
}

Promise.all([estudiantes(), fechas()])
  .then(() => console.log('Listo: ejemplos/estudiantes.xlsx y ejemplos/fechas.xlsx'))
  .catch((e) => { console.error(e); process.exit(1); });
