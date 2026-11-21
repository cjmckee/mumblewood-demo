// Bundles the notables slice into one self-contained page: dist/slice/index.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const res = await build({ entryPoints: ['src/slice/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const body = readFileSync('src/slice/index.html', 'utf8').replace('/*BUNDLE*/', () => js);
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1d241b">
</head>
<body>
${body}
</body>
</html>
`;
mkdirSync('dist/slice', { recursive: true });
writeFileSync('dist/slice/index.html', page);
console.log(`dist/slice/index.html ${(page.length / 1024).toFixed(0)} KB`);
