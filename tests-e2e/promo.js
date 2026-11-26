const { chromium } = require('playwright');
const fx = require('./fixtures.json'); const fs = require('fs');
const BASE = 'http://localhost:8080';
const api = async (m, p, body, tok) => (await fetch(BASE + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
(async () => {
  const adm = (await api('POST', '/api/auth/login', { identifier: 'yonetici', password: 'Admin12345' })).token;
  const ayse = await api('POST', '/api/auth/login', { identifier: 'Ayse_K', password: 'Sifre1234' });
  await api('POST', `/api/admin/users/${ayse.user.id}/progress`, { xp: 300000 }, adm);
  const fresh = await api('POST', '/api/auth/register', { email: 'demo' + Date.now() % 1e6 + '@ornek.com', username: 'Mert_' + Date.now() % 1e5, password: 'Sifre1234' });
  for (const n of []) await api('POST', '/api/auth/register', { email: n.toLowerCase() + '@ornek.com', username: n, password: 'Sifre1234' });
  const b = await chromium.launch();
  const marks = [];
  async function scene(n, caption, token, fn) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, recordVideo: { dir: 'vid/s' + n, size: { width: 824, height: 1830 } } });
    if (token) await ctx.addInitScript(t => localStorage.setItem('slot_token', t), token);
    await ctx.addInitScript(c => { localStorage.setItem('slot_turbo', '1'); addEventListener('DOMContentLoaded', () => { const d = document.createElement('div'); d.id = 'cap'; d.textContent = c; d.style.cssText = 'position:fixed;left:0;right:0;bottom:118px;z-index:99;text-align:center;font:900 22px Rubik,sans-serif;color:#ffd34d;text-shadow:0 2px 0 #3b0a6e,0 0 12px #000;pointer-events:none;padding:8px;background:linear-gradient(90deg,transparent,rgba(30,5,70,.85),transparent)'; document.body.appendChild(d); }); }, caption);
    const p = await ctx.newPage(); const t0 = Date.now();
    await p.goto(BASE + '/'); await p.waitForFunction(() => window.App && (App.me || document.querySelector('#fLogin')), null, { timeout: 15000 });
    await p.evaluate(() => { SLOT_CONFIG.demo = true; if (window.App && App.daily) App.daily.available = false; UI.closeModal(); });
    const offset = await fn(p, () => (Date.now() - t0) / 1000);
    await p.waitForTimeout(500); await ctx.close();
    const file = fs.readdirSync('vid/s' + n).find(f => f.endsWith('.webm'));
    marks.push({ n, file: `vid/s${n}/${file}`, offset }); console.log('scene', n, offset.toFixed(2));
  }
  const tok = ayse.token;
  await scene(1, '7 EFSANE OYUN TEK UYGULAMADA', tok, async (p, t) => { await p.waitForTimeout(700); const o = t(); await p.evaluate(() => document.querySelector('#mainBody').scrollTo({ top: 260, behavior: 'smooth' })); await p.waitForTimeout(3300); return o; });
  await scene(2, '⚡ ZEUS: YILDIRIM ÇARPANLARI', tok, async (p, t) => { await p.evaluate(() => Games.open('zeus')); await p.waitForTimeout(500); await p.evaluate(l => Games.queueDemo(l), [fx.zeus.cascade]); const o = t(); await p.evaluate(() => { Games.spin(); }); await p.waitForTimeout(6000); return o + 0.4; });
  await scene(3, '🧚 ÇARPAN TOPLARI & PATLAYAN SEMBOLLER', tok, async (p, t) => { await p.evaluate(() => Games.open('peri')); await p.waitForTimeout(500); await p.evaluate(l => Games.queueDemo(l), [fx.peri.cascade]); const o = t(); await p.evaluate(() => { Games.spin(); }); await p.waitForTimeout(6000); return o + 0.4; });
  await scene(4, '💎 JETON MAĞAZASI', tok, async (p, t) => { await p.evaluate(() => Screens.go('shop')); await p.waitForTimeout(900); const o = t(); await p.evaluate(() => document.querySelector('#mainBody').scrollTo({ top: 200, behavior: 'smooth' })); await p.waitForTimeout(3300); return o; });
  await scene(5, 'GÜVENLİ ÜYELİK & GİRİŞ', null, async (p, t) => { await p.waitForTimeout(500); const o = t(); await p.type('[name=identifier]', 'Ayse_K', { delay: 90 }); await p.type('[name=password]', 'Sifre1234', { delay: 70 }); await p.waitForTimeout(400); await p.click('#fLogin button'); await p.waitForTimeout(2200); return o; });
  await scene(6, '🏆 100 SEVİYE · XP · SEVİYE ÖDÜLLERİ', tok, async (p, t) => { await p.evaluate(() => Screens.go('profile')); await p.waitForTimeout(700); const o = t(); await p.waitForTimeout(1000); await p.evaluate(() => Screens.levelRewardsModal()); await p.waitForTimeout(1200); await p.click('[data-lv="10"]').catch(() => {}); await p.waitForTimeout(2000); return o; });
  await scene(7, '🎁 GÜNLÜK GİRİŞ ÖDÜLÜ', fresh.token, async (p, t) => { await p.evaluate(() => { App.daily.available = true; Screens.dailyModal(); }); await p.waitForTimeout(600); const o = t(); await p.waitForTimeout(1100); await p.click('#dClaim'); await p.waitForTimeout(2500); return o; });
  await scene(8, '🛡️ YÖNETİCİ PANELİ', adm, async (p, t) => { await p.evaluate(() => Admin.open()); await p.waitForTimeout(500); await p.click('[data-t=users]'); await p.waitForTimeout(700); const o = t(); await p.waitForTimeout(900); await p.click('[data-u]'); await p.waitForTimeout(2600); return o; });
  await scene(9, '✨ ÜCRETSİZ DÖNÜŞLER & BONUSLAR', tok, async (p, t) => { await p.evaluate(() => Games.open('zeus')); await p.waitForTimeout(500); await p.evaluate(l => Games.queueDemo(l), [fx.zeus.feature]); await p.evaluate(() => { Games.spin(); }); const s0 = t(); await p.waitForSelector('.bigwin', { timeout: 15000 }).catch(async e => { await p.screenshot({ path: '/tmp/s9.png' }); throw e; }); const o = t(); await p.waitForTimeout(1300); await p.evaluate(() => document.querySelector('.bigwin') && document.querySelector('.bigwin').click()); await p.waitForTimeout(3000); return o - 0.2; });
  await scene(10, '🎰 SLOT SALONU · HEMEN OYNA!', tok, async (p, t) => { await p.evaluate(() => Games.open('altin')); await p.waitForTimeout(400); await p.evaluate(l => Games.queueDemo(l), [fx.altin.big]); await p.evaluate(() => { Games.spin(); }); await p.waitForSelector('.bigwin', { timeout: 15000 }); const o = t() - 0.2; await p.waitForTimeout(1700); await p.evaluate(() => document.querySelector('.bigwin') && document.querySelector('.bigwin').click()); await p.waitForTimeout(400); await p.evaluate(() => Games.close()); await p.waitForTimeout(2000); return o; });
  fs.writeFileSync('vid/marks.json', JSON.stringify(marks)); await b.close();
})();
