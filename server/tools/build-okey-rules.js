#!/usr/bin/env node
// 101 Okey kurallarını istemci için paketler (sunucuyla birebir aynı kod): client/js/okey-rules.js
import fs from 'node:fs';
let src = fs.readFileSync(new URL('../src/okey/rules.js', import.meta.url), 'utf8');
const names = [...src.matchAll(/^export (?:const|function) (\w+)/gm)].map(m => m[1]);
src = src.replace(/^export (const|function) /gm, '$1 ');
const out = `/* OTOMATİK ÜRETİLDİ: server/tools/build-okey-rules.js — elle düzenlemeyin */\n(function () {\n${src}\n  window.OkeyRules = { ${names.join(', ')} };\n})();\n`;
fs.writeFileSync(new URL('../../client/js/okey-rules.js', import.meta.url), out);
console.log('client/js/okey-rules.js yazıldı', names.length, 'fonksiyon');
