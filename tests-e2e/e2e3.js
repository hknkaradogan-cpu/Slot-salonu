const { chromium } = require('playwright');
const fx = require('./fixtures.json');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 412, height: 915 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:8080/'); await p.waitForTimeout(800);
  await p.fill('[name=identifier]', 'Ayse_K'); await p.fill('[name=password]', 'Sifre1234'); await p.click('#fLogin button'); await p.waitForTimeout(1500);
  await p.evaluate(() => { SLOT_CONFIG.demo = true; UI.closeModal(); });
  for (const g of (process.argv[2] || 'zeus,peri,misir,vegas,ejderha,korsan,altin').split(',')) {
    await p.evaluate(id => Games.open(id), g); await p.waitForTimeout(500);
    await p.evaluate(l => Games.queueDemo(l), [fx[g].feature]);
    await p.evaluate(() => { Games.spin(); });
    for (let t = 0; t < 70; t++) { await p.waitForTimeout(1000); await p.screenshot({ path: `./shots/f_${g}_${String(t).padStart(2, '0')}.png` }); const busy = await p.evaluate(() => !!document.querySelector('.spinbtn.busy') || !!document.querySelector('.bigwin')); if (!busy) break; }
    await p.evaluate(() => { document.querySelector('.bigwin') && document.querySelector('.bigwin').click(); Games.close(); }); await p.waitForTimeout(400);
  }
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
