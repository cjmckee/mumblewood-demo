// Renders every goods and building icon to dist/icons.html: at UI size and enlarged, on the game's panel colour and on light.
// Usage: npx tsx tools/icon-sheet.ts [buildings|goods]   (then open dist/icons.html, or screenshot it)
import { writeFileSync, mkdirSync } from 'node:fs';
import { icon, ICON_IDS, BUILDING_ICON_IDS } from '../src/ui/icons';
import { RESOURCES, BUILDING_BY_ID } from '../src/sim/content';
const name = (id: string) => RESOURCES.find(r => r.id === id)?.name ?? BUILDING_BY_ID[id]?.name ?? id;
const IDS = process.argv[2] === 'buildings' ? BUILDING_ICON_IDS : process.argv[2] === 'goods' ? ICON_IDS : [...BUILDING_ICON_IDS, ...ICON_IDS];
const cell = (id: string) => `<figure>${icon(id, 'big')}<div class="row">${icon(id)}${icon(id, 'mid')}</div><figcaption>${name(id)}</figcaption></figure>`;
const html = `<!doctype html><meta charset="utf-8"><title>Mumblewood icons</title><style>
body{margin:0;font:13px system-ui;background:#161a16;color:#d9d4c4}
section{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;padding:16px}
section.light{background:#efe9da;color:#3a342a}
figure{margin:0;display:grid;justify-items:center;gap:4px;padding:8px;border-radius:10px;background:rgba(255,255,255,.04)}
.ico{width:16px;height:16px}.ico.mid{width:24px;height:24px}.ico.big{width:72px;height:72px}
.row{display:flex;gap:6px;align-items:center}figcaption{font-size:12px;opacity:.8}
</style><section>${IDS.map(cell).join('')}</section><section class="light">${IDS.map(cell).join('')}</section>`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/icons.html', html);
console.log(`dist/icons.html: ${IDS.length} icons`);
