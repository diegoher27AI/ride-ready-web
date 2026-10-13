// Prueba la conversion de zonas usando el codigo real de supabase/functions/intervals-sync.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'intervals-sync', 'index.ts'), 'utf8');

const start = src.indexOf('function toBands(');
const end = src.indexOf('async function fetchIntervals(');
const code = src.slice(start, end)
  .replace(/:\s*number\[\]\s*\|\s*null\s*\|\s*undefined/g, '')
  .replace(/:\s*number\s*\|\s*null/g, '')
  .replace(/:\s*string\[\]\s*\|\s*null\s*\|\s*undefined/g, '')
  .replace(/:\s*'power'\s*\|\s*'hr'/g, '')
  .replace(/const out:[^=]+=/, 'const out =')
  .replace(/\(ref as number\)/g, 'ref');

const toBands = eval('(function(){' + code + '\nreturn toBands;})()');

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log('  ok  ', name); }
  else { fail++; console.log('  FALLA', name, '\n    esperaba', JSON.stringify(want), '\n    obtuve  ', JSON.stringify(got)); }
};

console.log('Potencia en porcentaje del FTP (lo normal en intervals.icu):');
eq('5 zonas con FTP 250', toBands([55, 75, 90, 105, 120], 250, null, 'power'), [
  { label: 'Z1', min: 0, max: 138 },
  { label: 'Z2', min: 139, max: 188 },
  { label: 'Z3', min: 189, max: 225 },
  { label: 'Z4', min: 226, max: 263 },
  { label: 'Z5', min: 264, max: null },
]);
eq('usa los nombres si vienen', toBands([55, 150], 200, ['Recovery', 'Max'], 'power'), [
  { label: 'Recovery', min: 0, max: 110 },
  { label: 'Max', min: 111, max: null },
]);

console.log('\nPotencia ya en vatios (no la vuelve a convertir):');
eq('zonas grandes se toman tal cual', toBands([114, 152, 191, 229, 267, 310], 250, null, 'power'), [
  { label: 'Z1', min: 0, max: 114 },
  { label: 'Z2', min: 115, max: 152 },
  { label: 'Z3', min: 153, max: 191 },
  { label: 'Z4', min: 192, max: 229 },
  { label: 'Z5', min: 230, max: 267 },
  { label: 'Z6', min: 268, max: null },
]);

console.log('\nPulso:');
eq('en latidos se toma tal cual', toBands([127, 158, 174, 189], 196, null, 'hr'), [
  { label: 'Z1', min: 0, max: 127 },
  { label: 'Z2', min: 128, max: 158 },
  { label: 'Z3', min: 159, max: 174 },
  { label: 'Z4', min: 175, max: null },
]);
eq('en porcentaje usa el pulso maximo', toBands([65, 81, 89, 96], 200, null, 'hr'), [
  { label: 'Z1', min: 0, max: 130 },
  { label: 'Z2', min: 131, max: 162 },
  { label: 'Z3', min: 163, max: 178 },
  { label: 'Z4', min: 179, max: null },
]);

console.log('\nNo inventa cuando no puede:');
eq('porcentajes sin referencia', toBands([55, 75, 90], null, null, 'power'), null);
eq('porcentajes con referencia cero', toBands([55, 75, 90], 0, null, 'power'), null);
eq('lista vacia', toBands([], 250, null, 'power'), null);
eq('nada', toBands(null, 250, null, 'power'), null);
eq('basura', toBands([0, -3], 250, null, 'power'), null);

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
