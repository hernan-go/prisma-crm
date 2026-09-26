import ExcelJS from 'exceljs';
import console from 'node:console';
import { mkdir, writeFile } from 'node:fs/promises';

await mkdir('tmp/qa', { recursive: true });
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Personas');
sheet.addRow(['Nombre y apellido', 'Teléfono', 'Email']);
sheet.addRow(['Importada XLSX Ficticia', '0000033331', '']);
sheet.addRow(['QA Ficticia Noviembre', '0000026260', '']);
sheet.addRow(['Incompleta Ficticia', '', '']);
await workbook.xlsx.writeFile('tmp/qa/personas-qa.xlsx');
await writeFile(
  'tmp/qa/personas-qa.csv',
  'Nombre;Apellido;Teléfono;Email\nImportada CSV;Ficticia;0000033332;\n',
);
console.log('Fixtures ficticios XLSX y CSV listos en tmp/qa.');
