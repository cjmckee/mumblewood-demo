// A playable review page that opens directly on the recruit card. Build first.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export function previewRecruits() {
  const g = window.__game;
  g.setSpeed(0); g.ui.resumeOpen = false; g.world.named = true; g.world.gold = 10; g.world.res.banquet = 1;
  const wants = [['sweetTooth', 'homebody'], ['musicLover', 'tippler'], ['greenThumb', 'gourmand']];
  const traits = [['sunny', 'glutton'], ['diligent', 'picky'], ['stoic', 'drama']];
  const names = ['Prudence Kettle', 'Silas Ashby', 'Cuthbert Pottsworth'];
  g.world.decisions = [{ kind: 'recruit', options: g.world.colonists.slice(0, 3).map((c, i) => ({ ...structuredClone(c), name: names[i], id: 1000 + i, wants: wants[i], traits: traits[i], fee: i === 2 ? 25 : 0 })) }];
  g.ui.render(true);
}

if (process.argv[1]?.endsWith('recruit-prototype.mjs')) {
  const html = readFileSync('dist/site/index.html', 'utf8');
  const preview = `<script>function openRecruitPreview(){if(!window.__game){requestAnimationFrame(openRecruitPreview);return;}(${previewRecruits.toString()})();}openRecruitPreview();</script>`;
  mkdirSync('dist/recruit-prototype', { recursive: true });
  writeFileSync('dist/recruit-prototype/index.html', html.replace('</body>', `${preview}</body>`));
  console.log('dist/recruit-prototype/index.html — opens directly on option A with help chips');
}
