import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';
const styles = readFileSync('src/index.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const result = await build({ entryPoints: ['tools/final-preview-entry.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#1d241b"><title>Mumblewood · Final charter celebration</title><style>${styles}
html,body{height:auto;min-height:100%;margin:0;overflow:auto}#game{height:auto;min-height:100svh;overflow:visible}#modal{position:relative;overflow:visible;background:none;align-content:start}.preview-tools{max-width:560px;margin:0 auto;padding:18px 16px 0;display:flex;flex-wrap:wrap;gap:8px}.preview-tools p{width:100%;margin:0 0 4px;font-size:13px;color:var(--muted)}.preview-tools button{border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:var(--panel-solid);font-size:12px;min-height:44px}.preview-tools button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}#preview-status{max-width:540px;padding:0 16px 20px;margin:0 auto;color:var(--good);font-size:13px;line-height:1.5}
</style></head><body><div id="game"><nav class="preview-tools" aria-label="Preview controls"><p>Final charter celebration · sample settlement and stats</p><button type="button" data-route="hall">Crown’s Hall</button><button type="button" data-route="longtable">The Long Table</button><button type="button" data-replay>Replay</button><button type="button" data-calm>Reduce motion</button></nav><main id="modal"></main><p id="preview-status" role="status"></p></div><script>${script}</script></body></html>`;
mkdirSync('dist/final-prototype', { recursive: true });
writeFileSync('dist/final-prototype/index.html', html);
console.log('dist/final-prototype/index.html');
