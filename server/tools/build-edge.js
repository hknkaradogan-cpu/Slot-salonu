#!/usr/bin/env node
// Supabase paketleri:
//  - supabase/functions/slot-api/index.ts : başlatıcı (bir kez kurulur)
//  - dist/server-bundle.js                 : asıl sunucu (CI her main gönderiminde yükler)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const R = (p) => new URL(p, import.meta.url);
fs.writeFileSync(R('../edge/calibration.gen.js'), '// Otomatik: src/games/calibration.json\nexport default ' + fs.readFileSync(R('../src/games/calibration.json'), 'utf8').trim() + ';\n');
const fn = R('../../supabase/functions/slot-api/');
fs.rmSync(fn, { recursive: true, force: true }); fs.mkdirSync(fn, { recursive: true });
fs.copyFileSync(R('../edge/bootstrap.ts'), new URL('index.ts', fn));
fs.mkdirSync(R('../dist/'), { recursive: true });
const esb = process.env.ESBUILD || new URL('../node_modules/.bin/esbuild', import.meta.url).pathname;
execFileSync(esb, [R('../edge/entry.js').pathname, '--bundle', '--format=iife', '--global-name=SlotServer', '--platform=neutral', '--minify',
  '--external:node:crypto', '--external:node:buffer', '--external:@electric-sql/pglite', '--external:postgres',
  '--outfile=' + R('../dist/server-bundle.js').pathname], { stdio: 'inherit' });
console.log('dist/server-bundle.js', fs.statSync(R('../dist/server-bundle.js')).size, 'bayt');
