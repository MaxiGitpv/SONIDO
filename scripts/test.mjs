// Compila las pruebas TypeScript con esbuild y las ejecuta con el corredor de pruebas de Node.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';

mkdirSync('.tmp', { recursive: true });
const files = readdirSync('tests').filter((f) => f.endsWith('.test.ts'));
for (const f of files) {
  await build({ entryPoints: [`tests/${f}`], outfile: `.tmp/${f.replace(/\.ts$/, '.mjs')}`, bundle: true, platform: 'node', format: 'esm', target: 'node18', logLevel: 'error' });
}
const r = spawnSync(process.execPath, ['--test', ...files.map((f) => `.tmp/${f.replace(/\.ts$/, '.mjs')}`)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
