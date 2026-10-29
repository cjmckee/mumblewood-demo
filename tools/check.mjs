// Run every focused simulation check in its own process so mutable scenario settings stay isolated.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const checks = readdirSync(new URL('./', import.meta.url)).filter(name => name.endsWith('-check.ts')).sort();
for (const name of checks) {
  console.log(`\n${name}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', `tools/${name}`], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`\nAll ${checks.length} simulation check suites passed.`);
