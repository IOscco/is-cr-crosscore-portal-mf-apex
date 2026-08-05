/**
 * Lee exportaciones en src/data/_raw (generadas con dump-xlsx-sheets.mjs)
 * y escribe JSON compactos en src/data/poc para la PoC en el bundle.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawDir = join(__dirname, '..', 'src', 'data', '_raw');
const outDir = join(__dirname, '..', 'src', 'data', 'poc');
mkdirSync(outDir, { recursive: true });

function firstKey(row) {
  return Object.keys(row)[0];
}

/** Cabecera dinámica: G1/G2/Soporte incluyen Alerta; G3 usa «Días de Resolución» y sin Alerta. */
function parseIncidentSheet(rows) {
  const k0 = firstKey(rows[0] ?? {});
  const out = [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const c0 = String(r[k0] ?? '').trim();
    const c1 = String(r.__EMPTY ?? '').trim();
    if (c0 === 'GTI' && c1 === 'Subcategoría') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    return out;
  }
  const header = rows[headerIdx];
  const labelToKey = {};
  for (const key of Object.keys(header)) {
    const lab = String(header[key] ?? '').trim();
    if (lab) {
      labelToKey[lab] = key;
    }
  }
  const get = (r, ...labels) => {
    for (const lab of labels) {
      const k = labelToKey[lab];
      if (k !== undefined && r[k] != null && String(r[k]).trim() !== '') {
        return String(r[k]).trim();
      }
    }
    return '';
  };
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const gti = String(r[k0] ?? '').trim();
    if (!/^\d+$/.test(gti)) {
      continue;
    }
    out.push({
      gti,
      subcategoria: get(r, 'Subcategoría'),
      sistema: get(r, 'Sistema'),
      estado: get(r, 'Estado Actual'),
      usuarioActual: get(r, 'Usuario Actual'),
      usuarioResolutor: get(r, 'Usuario Resolutor'),
      squad: get(r, 'Squad'),
      tpo: get(r, 'TPO'),
      fecRegistro: get(r, 'Fecha Registro'),
      fecUltimoEstado: get(r, 'Fecha Último Estado'),
      diasEnEstado: get(r, 'Días en Estado', 'Días de Resolución'),
      alerta: get(r, 'Alerta'),
      area: get(r, 'Área'),
      titulo: get(r, 'Título'),
    });
  }
  return out;
}

function loadJson(name) {
  const p = join(rawDir, name);
  return JSON.parse(readFileSync(p, 'utf8'));
}

const pb = loadJson('pb__PB_V1.json');
const programBoard = pb.map((r) => ({
  squad: r['SQUAD'] ?? '',
  epica: r['EPICA (INICIATIVA)'] ?? '',
  estatusGeneral: r['Estatus General'] ?? '',
  faseActual: r['Fase Actual'] ?? '',
  fechaPap: r['Fecha planificada de PaP 🚀'] ?? '',
  ticketGti: r['# Ticket'] ?? '',
  tl: r['TL Encargado'] ?? '',
  dev: r['Dev Encargado'] ?? '',
  priorizacion: r['Priorización'] ?? '',
  hitoQ2: r['Hito de Compromiso Q2'] ?? '',
  sprintCompromiso: r['Sprint de Compromiso'] ?? '',
  sistema: r['Sistema / Componente Impactado'] ?? '',
  tipoIniciativa: r['Tipo de Iniciativa'] ?? '',
}));

const g1 = parseIncidentSheet(loadJson('incidents___G1-Ratificacion.json'));
const g2 = parseIncidentSheet(loadJson('incidents___G2-Desarrollo.json'));
const g3 = parseIncidentSheet(loadJson('incidents___G3-CerradoRechazado.json'));
const soporte = parseIncidentSheet(loadJson('incidents___Soporte-Negocio.json'));

/** El listado del módulo Proyectos en la app no precarga Excel: solo registros manuales (localStorage). */
const proyectosBundle = [];

const dashboard = {
  fuente: 'Mapeo y análisis de Incidentes_Querys.xlsx (pestañas G1–G3 y Soporte)',
  generado: new Date().toISOString().slice(0, 10),
  conteos: {
    g1Ratificacion: g1.length,
    g2Desarrollo: g2.length,
    g3Cerrados: g3.length,
    soporteNegocio: soporte.length,
  },
  iniciativasPb: programBoard.length,
  proyectosSueltos: 0,
  proyectosNota:
    'En la app el módulo Proyectos inicia vacío; los ítems se crean con HU-ITP-025 y se guardan en el navegador (localStorage).',
};

writeFileSync(join(outDir, 'program-board.json'), JSON.stringify(programBoard, null, 2), 'utf8');
writeFileSync(join(outDir, 'incidents-g1.json'), JSON.stringify(g1, null, 2), 'utf8');
writeFileSync(join(outDir, 'incidents-g2.json'), JSON.stringify(g2, null, 2), 'utf8');
writeFileSync(join(outDir, 'incidents-g3.json'), JSON.stringify(g3, null, 2), 'utf8');
writeFileSync(join(outDir, 'incidents-soporte.json'), JSON.stringify(soporte, null, 2), 'utf8');
writeFileSync(join(outDir, 'incidents-dashboard.json'), JSON.stringify(dashboard, null, 2), 'utf8');
writeFileSync(join(outDir, 'proyectos.json'), JSON.stringify(proyectosBundle, null, 2), 'utf8');

console.log('poc json ok', {
  programBoard: programBoard.length,
  proyectosBundle: proyectosBundle.length,
  g1: g1.length,
  g2: g2.length,
  g3: g3.length,
  soporte: soporte.length,
});
