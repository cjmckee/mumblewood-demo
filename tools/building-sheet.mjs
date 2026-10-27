// Writes dist/buildings.html: every building model in all four turns. Open with ?night for lamps, ?only=a,b to filter.
// Usage: node tools/building-sheet.mjs
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
const res = await build({ entryPoints: ['tools/sheet/buildings-entry.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
mkdirSync('dist', { recursive: true });
writeFileSync('dist/buildings.html', `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#161a16"><script>${res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
console.log('dist/buildings.html');
