const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const p = await ctx.newPage();
  const out = [];
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(800);
  await p.fill('[name=identifier]', 'ayse@ornek.com'); await p.fill('[name=password]', 'Sifre1234'); await p.click('#fLogin button'); await p.waitForTimeout(1500);
  await p.evaluate(() => UI.closeModal());
  const bal0 = await p.evaluate(() => App.me.balance);
  // 1) kapat-aç: sayfayı yeniden yükle -> oturum ve bakiye korunur
  await p.reload(); await p.waitForTimeout(1800);
  out.push(['yeniden açılışta oturum korunuyor', await p.evaluate(() => !!App.me && App.me.username === 'Ayse_K')]);
  out.push(['yeniden açılışta bakiye aynı', (await p.evaluate(() => App.me.balance)) === bal0]);
  // 2) çevrimdışı spin
  await p.evaluate(() => { UI.closeModal(); Games.open('vegas'); }); await p.waitForTimeout(600);
  await ctx.setOffline(true);
  await p.evaluate(() => { Games.spin(); }); await p.waitForTimeout(4500);
  out.push(['çevrimdışı uyarı çubuğu görünüyor', await p.evaluate(() => !document.querySelector('#netbar').classList.contains('hidden'))]);
  await p.screenshot({ path: './shots/13_offline.png' });
  out.push(['çevrimdışı spin sonrası buton tekrar aktif', await p.evaluate(() => !document.querySelector('.spinbtn.busy'))]);
  await ctx.setOffline(false); await p.waitForTimeout(6500);
  out.push(['bağlantı gelince uyarı kalkıyor', await p.evaluate(() => document.querySelector('#netbar').classList.contains('hidden'))]);
  out.push(['bağlantı gelince bakiye sunucuyla aynı', (await p.evaluate(() => App.me.balance)) === bal0]);
  await p.evaluate(() => { Games.spin(); }); await p.waitForTimeout(5000);
  out.push(['bağlantı sonrası spin çalışıyor', (await p.evaluate(() => App.me.xp)) > 0]);
  // 3) oturumu olmayan kullanıcı yönetici API'sine erişemez (tarayıcıdan)
  const st = await p.evaluate(async () => (await fetch('/api/admin/users', { headers: { Authorization: 'Bearer ' + localStorage.getItem('slot_token') } })).status);
  out.push(['oyuncu hesabıyla /api/admin -> 403', st === 403]);
  console.log(JSON.stringify(out)); await b.close();
})();
