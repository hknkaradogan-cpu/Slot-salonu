#!/usr/bin/env node
// 101 Okey kurallarını istemci için paketler (sunucuyla birebir aynı kod): client/js/okey-rules.js
import fs from 'node:fs';
let src = fs.readFileSync(new URL('../src/okey/rules.js', import.meta.url), 'utf8');
const names = [...src.matchAll(/^export (?:const|function) (\w+)/gm)].map(m => m[1]);
src = src.replace(/^export (const|function) /gm, '$1 ');
// Düz Okey çözücüsü (sunucuyla aynı kod): bitirme butonunun etkinliği ve önerilen taş için
let duz = fs.readFileSync(new URL('../src/okey/duz.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '');
const dnames = [...duz.matchAll(/^export (?:const|function) (\w+)/gm)].map(m => m[1]);
duz = duz.replace(/^export (const|function) /gm, '$1 ');
src += '\nconst R = { analyze };\n' + duz; names.push(...dnames);
const out = `/* OTOMATİK ÜRETİLDİ: server/tools/build-okey-rules.js — elle düzenlemeyin */\n(function () {\n${src}\n  window.OkeyRules = { ${names.join(', ')} };\n})();\n`;
fs.writeFileSync(new URL('../../client/js/okey-rules.js', import.meta.url), out);
console.log('client/js/okey-rules.js yazıldı', names.length, 'fonksiyon');
