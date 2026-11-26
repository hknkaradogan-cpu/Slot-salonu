#!/usr/bin/env node
// Tavla kurallarını istemci için paketler (sunucuyla birebir aynı kod): client/js/tavla-rules.js
import fs from 'node:fs';
let src = fs.readFileSync(new URL('../src/tavla/rules.js', import.meta.url), 'utf8');
const names = [...src.matchAll(/^export (?:const|function) (\w+)/gm)].map(m => m[1]);
src = src.replace(/^export (const|function) /gm, '$1 ');
const out = `/* OTOMATİK ÜRETİLDİ: server/tools/build-tavla-rules.js — elle düzenlemeyin */\n(function () {\n${src}\n  window.TavlaRules = { ${names.join(', ')} };\n})();\n`;
fs.writeFileSync(new URL('../../client/js/tavla-rules.js', import.meta.url), out);
console.log('client/js/tavla-rules.js yazıldı', names.length, 'fonksiyon');
