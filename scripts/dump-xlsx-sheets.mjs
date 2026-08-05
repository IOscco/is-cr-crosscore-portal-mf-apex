import XLSX from 'xlsx';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'src', 'data', '_raw');
mkdirSync(outDir, { recursive: true });

const files = [
  {
    path: String.raw`C:\Users\dipelaez\Downloads\Q2 2026 - Program Board (PB)_TPO's, TL's y Agilistas (2).xlsx`,
    prefix: 'pb',
  },
  {
    path: String.raw`C:\Users\dipelaez\Downloads\Mapeo y análisis de Incidentes_Querys.xlsx`,
    prefix: 'incidents',
  },
];

for (const { path, prefix } of files) {
  const wb = XLSX.readFile(path, { cellDates: true });
  const summary = {};
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
    summary[name] = {
      rowCount: rows.length,
      columns: rows[0] ? Object.keys(rows[0]) : [],
      sample: rows.slice(0, 3),
    };
    const safeName = name.replace(/[^\w.-]+/g, '_');
    writeFileSync(
      join(outDir, `${prefix}__${safeName}.json`),
      JSON.stringify(rows, null, 0),
      'utf8',
    );
  }
  writeFileSync(join(outDir, `${prefix}__summary.json`), JSON.stringify(summary, null, 2), 'utf8');
}
console.log('OK', outDir);
