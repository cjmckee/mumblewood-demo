// Build first, then generate review pages for both nonfinal charter transitions.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

export function previewCharterCompletion(tier = 1) {
  const g = window.__game, w = g.world;
  g.setSpeed(0); g.ui.resumeOpen = false; w.name = 'Little Lantern'; w.named = true;
  w.chartersDone = tier === 1 ? ['settled'] : ['settled', 'bread'];
  w.charterTier = tier + 1; w.charter = null; w.draftsFrom = 1;
  w.gold = tier === 1 ? 40 : 90; w.strain = 14;
  w.decisions = [
    { kind: 'charter-complete', charter: tier === 1 ? 'settled' : 'bread', tier, gold: tier === 1 ? 30 : 50, strainBefore: 20, strainAfter: 14 },
    { kind: 'charter', tier: tier + 1, options: tier === 1 ? ['bread', 'roof', 'hearty'] : ['hall', 'longtable'] },
    { kind: 'perk', options: ['saintsDay', 'homesteaders'], why: 'charter' },
  ];
  g.ui.render(true);
}

if (process.argv[1]?.endsWith('charter-prototype.mjs')) {
  const source = readFileSync('src/index.html', 'utf8');
  const styles = source.match(/<style>([\s\S]*?)<\/style>/)[1];
  const result = await build({ entryPoints: ['tools/charter-preview-entry.ts'], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  mkdirSync('dist/charter-prototype', { recursive: true });
  for (const [name, tier] of [['index', 1], ['settlement', 1], ['village', 2]]) {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mumblewood · Charter celebration preview</title><style>${styles}
      html,body { height:auto; min-height:100%; margin:0; overflow:auto; }
      #game { height:auto; min-height:100svh; overflow:visible; }
      #modal { position:relative; overflow:visible; background:none; align-content:start; }
      .preview-tools { max-width:560px; margin:0 auto; padding:18px 16px 0; display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
      .preview-tools p { width:100%; margin:0 0 4px; font-size:13px; color:var(--muted); }
      .preview-tools button { border:1px solid var(--line); border-radius:8px; padding:8px 12px; background:var(--panel-solid); font-size:12px; min-height:40px; }
      .preview-tools button[aria-pressed=true] { border-color:var(--accent); color:var(--accent); }
      #preview-status { max-width:540px; padding:0 16px 20px; margin:0 auto; color:var(--good); font-size:13px; }
      </style></head><body data-tier="${tier}"><div id="game"><nav class="preview-tools" aria-label="Preview controls"><p>Mumblewood · Charter celebration preview</p><button type="button" data-preview-tier="1">Settlement</button><button type="button" data-preview-tier="2">Village</button><button type="button" data-preview-replay>Replay</button><button type="button" data-preview-calm>Reduce motion</button></nav><main id="modal"></main><p id="preview-status" role="status"></p></div><script>${script}</script></body></html>`;
    writeFileSync(`dist/charter-prototype/${name}.html`, html);
  }
  console.log('Standalone previews: dist/charter-prototype/{index,settlement,village}.html (no game renderer or external assets)');
}
