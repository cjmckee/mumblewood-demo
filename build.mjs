// Bundles the game into one self-contained HTML file: dist/mumblewood.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({ entryPoints: ['src/main.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/index.html', 'utf8').replace('/*BUNDLE*/', () => js);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/mumblewood.html', html);
console.log(`dist/mumblewood.html ${(html.length / 1024).toFixed(0)} KB`);

// A standalone page for GitHub Pages: the same game with its own document head.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Mumblewood: a comedic frontier colony sim. Draft buildings and settlers, keep everyone fed and happy, and finish three charters before the frontier wears you down.">
<meta name="theme-color" content="#1d241b">
<meta property="og:title" content="Mumblewood">
<meta property="og:description" content="A comedic frontier colony sim with roguelite drafting.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d241b"/><path d="M32 10 54 30H10z" fill="#e8a33d"/><rect x="16" y="30" width="32" height="22" fill="#8c6b4a"/><rect x="28" y="38" width="8" height="14" fill="#1d241b"/></svg>')}">
<style>html,body{margin:0}[hidden]{display:none!important}</style>
</head>
<body>
${html}
</body>
</html>
`;
mkdirSync('dist/site', { recursive: true });
writeFileSync('dist/site/index.html', page);
console.log(`dist/site/index.html ${(page.length / 1024).toFixed(0)} KB`);
