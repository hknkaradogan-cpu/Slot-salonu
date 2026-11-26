const { chromium } = require('playwright');
const fx = require('./fixtures.json'); const fs = require('fs');
const shot = (p, n) => p.screenshot({ path: `./shots/${n}.png` });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { window.__demo = true; });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(1000);
  await p.evaluate(() => { SLOT_CONFIG.demo = true; });
  await shot(p, '01_login');
  await p.click('#tabReg'); await p.fill('[name=email]', 'ayse@ornek.com'); await p.fill('[name=username]', 'Ayse_K'); await p.fill('[name=password]', 'Sifre1234'); await p.fill('[name=password2]', 'Sifre1234'); await p.check('[name=age]');
  await p.click('#fReg button[type=submit]'); await p.waitForTimeout(1200);
  await shot(p, '02_verify_modal');
  const code = /Doğrulama kodun: ([A-Z0-9]{8})/.exec(fs.readFileSync('./server.log', 'utf8'))[1];
  await p.fill('#vCode', code); await p.click('#vGo'); await p.waitForTimeout(1200);
  await p.waitForSelector('#dClaim'); await shot(p, '03_daily'); await p.click('#dClaim'); await p.waitForTimeout(1500);
  await shot(p, '04_lobby');
  for (const g of ['zeus', 'peri', 'misir', 'vegas', 'ejderha', 'korsan', 'altin']) {
    await p.evaluate(() => UI.closeModal());
    await p.evaluate(id => Games.open(id), g); await p.waitForTimeout(600);
    const list = [fx[g].cascade, fx[g].big, fx[g].feature].filter(Boolean);
    await p.evaluate(l => Games.queueDemo(l), list);
    for (let k = 0; k < list.length; k++) {
      await p.evaluate(() => { Games.spin(); });
      for (let t = 0; t < 120; t++) {
        await p.waitForTimeout(700);
        if (t % 3 === 1 && k === list.length - 1 && t < 40) await shot(p, `g_${g}_${String(t).padStart(2, '0')}`);
        const st = await p.evaluate(() => ({ busy: !!document.querySelector('.spinbtn.busy'), big: !!document.querySelector('.bigwin') }));
        if (st.big && t % 4 === 3) await p.evaluate(() => document.querySelector('.bigwin') && document.querySelector('.bigwin').click());
        if (!st.busy && !st.big) break;
      }
    }
    await shot(p, `g_${g}_end`);
    await p.evaluate(() => Games.close()); await p.waitForTimeout(300);
  }
  // mağaza (test modu satın alma)
  await p.evaluate(() => Screens.go('shop')); await p.waitForTimeout(800); await shot(p, '05_shop');
  await p.click('[data-buy=coins_small]'); await p.waitForTimeout(400); await p.click('#overlay [data-close="1"]'); await p.waitForTimeout(1500); await shot(p, '06_purchase');
  console.log('after purchase balance', await p.evaluate(() => App.me.balance));
  await p.evaluate(() => Screens.go('quests')); await p.waitForTimeout(800); await shot(p, '07_quests');
  await p.evaluate(() => Screens.go('profile')); await p.waitForTimeout(500); await shot(p, '08_profile');
  await p.evaluate(() => Screens.levelRewardsModal()); await p.waitForTimeout(500); await shot(p, '09_levelrewards'); await p.evaluate(() => UI.closeModal());
  // yönetici
  await p.evaluate(() => Screens.logout()); await p.waitForTimeout(600);
  await p.fill('[name=identifier]', 'yonetici'); await p.fill('[name=password]', 'Admin12345'); await p.click('#fLogin button'); await p.waitForTimeout(1500);
  await p.evaluate(() => UI.closeModal()); await p.waitForTimeout(400);
  await p.evaluate(() => Admin.open()); await p.waitForTimeout(800); await shot(p, '10_admin_stats');
  await p.click('[data-t=users]'); await p.waitForTimeout(800); await p.click('[data-u]'); await p.waitForTimeout(800); await shot(p, '11_admin_user');
  await p.fill('#cAmt', '250000'); await p.fill('#cWhy', 'Turnuva ödülü'); await p.click('#cGo'); await p.waitForTimeout(1200);
  await p.evaluate(() => UI.closeModal()); await p.click('[data-t=audit]'); await p.waitForTimeout(800); await shot(p, '12_admin_audit');
  console.log(errs.filter(e => !e.includes('404')).join('\n') || 'no errors');
  await b.close();
})();
