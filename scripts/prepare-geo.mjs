// Genera los datos geográficos ligeros que usa la app (se ejecuta una sola vez).
// Uso: node scripts/prepare-geo.mjs <ne_50m_admin_0_countries.geojson>
// Fuente: Natural Earth (dominio público) – https://www.naturalearthdata.com/
import { readFileSync, writeFileSync } from 'node:fs';

const ne50 = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ne110 = JSON.parse(
  readFileSync('node_modules/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson', 'utf8'),
);

const iso = (p) => {
  const v = [p.ISO_A2_EH, p.ISO_A2, p.WB_A2].find((x) => x && x !== '-99');
  return v ? v.toUpperCase() : null;
};

// Recorta la precisión de las coordenadas para reducir el tamaño del archivo.
const round = (c) => (typeof c[0] === 'number' ? [+c[0].toFixed(2), +c[1].toFixed(2)] : c.map(round));

function bboxOf(geometry) {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]);
      minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]);
    } else c.forEach(walk);
  };
  walk(geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

const centroids = {};
const byA3 = {};
for (const f of ne50.features) {
  const p = f.properties;
  const code = iso(p);
  byA3[p.ADM0_A3] = { code, p };
  if (!code || centroids[code]) continue;
  // Usa el polígono que contiene el punto de etiqueta (evita territorios de ultramar).
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  const boxes = polys.map((c) => bboxOf({ coordinates: c }));
  const main =
    boxes.find(([a, b, c, d]) => p.LABEL_X >= a && p.LABEL_X <= c && p.LABEL_Y >= b && p.LABEL_Y <= d) ??
    boxes.sort((x, y) => (y[2] - y[0]) * (y[3] - y[1]) - (x[2] - x[0]) * (x[3] - x[1]))[0];
  const [minX, minY, maxX, maxY] = main;
  // Tamaño aproximado del país en grados (se usa para elegir la altitud de la cámara).
  const span = Math.min(60, Math.max(maxY - minY, (maxX - minX) * Math.cos((p.LABEL_Y * Math.PI) / 180)));
  centroids[code] = {
    name: p.NAME_ES || p.NAME,
    lat: +p.LABEL_Y.toFixed(3),
    lng: +p.LABEL_X.toFixed(3),
    span: +span.toFixed(2),
  };
}

const features = ne110.features
  .map((f) => {
    const meta = byA3[f.properties.ADM0_A3];
    const code = meta?.code ?? iso(f.properties);
    if (!code) return null;
    return {
      type: 'Feature',
      properties: { code, name: centroids[code]?.name ?? f.properties.NAME },
      geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
    };
  })
  .filter(Boolean);

writeFileSync('public/data/countries.geojson', JSON.stringify({ type: 'FeatureCollection', features }));
writeFileSync('src/data/countryCentroids.json', JSON.stringify(centroids));
console.log(`polígonos: ${features.length}, centroides: ${Object.keys(centroids).length}`);
