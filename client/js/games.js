/* Oyun ekranı ve 5 mekanik ailesinin animasyonları.
 * Tüm sonuçlar sunucudan gelir; istemci yalnızca gösterir. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, short, toast, modal, closeModal } = UI;
  // Oyun kapatılınca/yenisi açılınca süren animasyon iptal edilir (gen sayacı)
  const ABORT = new Error('aborted');
  const sleep = (ms) => { const gen = G.gen; return new Promise((r, j) => setTimeout(() => (gen === G.gen ? r() : j(ABORT)), ms * G.speed)); };
  const G = { gen: 0, demo: [], open: false, id: null, meta: null, th: null, betIdx: 0, spinning: false, auto: 0, turbo: false, speed: 1, boxes: [], cols: 0, rows: 0, step: 0, skip: false };
  const FAM = { tumble: [6, 5], egypt: [5, 3], gold: [5, 3], pirate: [5, 3], ways: [5, 3], vegas: [3, 3] };
  const RULES = {
    zeus: 'Aynı sembolden 8 veya daha fazlası ekranın herhangi bir yerinde kazandırır. Kazanan semboller patlar, yenileri düşer (zincirleme kazanç). Yıldırım çarpanları (x2–x500) dizinin sonunda toplanır ve toplam kazancı çarpar. 4+ ⚡ scatter = 15 ücretsiz dönüş; ücretsiz dönüşlerde çarpanlar birikir, 3+ scatter +5 dönüş verir.',
    peri: 'Aynı sembolden 8+ adet herhangi bir yerde kazandırır; semboller patlar ve zincirleme düşer. Çarpan topları (x2–x100) dizinin sonunda toplanır. 4+ 🧚 scatter = 15 ücretsiz dönüş; ücretsiz dönüşlerde hem çarpan topları hem her zincirleme kazanç (+1) toplam çarpana eklenir.',
    misir: '10 çizgi. 📖 Kitap hem wild hem scatter\'dır. 3+ kitap = 10 ücretsiz dönüş ve rastgele bir özel sembol seçilir; ücretsiz dönüşlerde özel sembol yeterli makarada çıkarsa tüm makarayı kaplayarak genişler ve tüm çizgilerde öder.',
    vegas: '5 çizgili klasik 3x3 makine. 7 wild\'dır ve her biri çizgi kazancını x2 yapar (iki 7 = x4). Ekranın tamamı aynı sembolse kazanç x10 (EKRAN DOLU). 3 ⭐ = Yıldız Çarkı bonusu.',
    ejderha: '243 yol: soldan sağa bitişik makaralarda aynı sembol kazandırır. 🔥 Ateş wild\'ları 2-4. makaralarda çıkar ve x1/x2/x3 (ücretsiz dönüşlerde x2/x3/x5) çarpan taşır. 3+ 🔮 inci = 8/12/20 ücretsiz dönüş; her kazançlı dönüşte çarpan +1 artar.',
    korsan: '10 çizgi. ☠️ bayrak wild\'dır. 6+ 🪙 altın sikke = Sandık Altını (Tut ve Döndür): sikkeler kilitlenir, 3 yeniden dönüş verilir ve her yeni sikke sayacı 3\'e sıfırlar. Sonunda tüm sikke değerleri ödenir; 15 hücrenin tamamı dolarsa GRAND ödül eklenir.',
    altin: '20 çizgi. 👑 Altın Taç wild\'dır ve katıldığı çizgi kazancını x2 yapar. 1., 3. ve 5. makaralarda 3 🎰 BONUS = Jackpot Çarkı (dilim büyüklüğü olasılığıyla orantılı).',
  };

  /* ---------- ekran ---------- */
  /** Slota giriş: mor kadife perde geçişi */
  /** Oyun açılışı: oyunun kendi canlı kartı ekranı doldurur (her oyunda farklı animasyon), oyun arkada hazırlanır */
  function open(id, fromEl) { return window.CardFX && !G.open ? CardFX.launch(fromEl || null, id, () => openRaw(id)) : openRaw(id); }
  function openRaw(id) {
    Sound.theme(id); Sound.startMusic();
    const meta = App.games.find(g => g.id === id); if (!meta) return;
    G.gen++; Object.assign(G, { open: true, id, meta, th: Sym.THEMES[id], auto: 0, spinning: false });
    G.turbo = localStorage.getItem('slot_turbo') === '1'; G.speed = G.turbo ? 0.5 : 1;
    const saved = +localStorage.getItem('slot_bet_' + id); G.betIdx = Math.max(0, App.bets.indexOf(saved));
    [G.cols, G.rows] = FAM[meta.family];
    const th = G.th;
    const hero = th.heroAlpha ? `<img class="heroimg alpha" src="assets/${th.heroImg}.webp" alt="">` : `<img class="heroimg" src="assets/${th.heroImg}.webp" alt="">`;
    const jpBars = id === 'korsan' ? `<div class="jpbars"><div class="jp major">MAJOR<b id="jpMajor"></b></div><div class="jp grand">GRAND<b id="jpGrand"></b></div></div>` : id === 'altin' ? `<div class="jpbars"><div class="jp grand" style="flex:1">JACKPOT ÇARKI<b id="jpGrand"></b></div></div>` : '';
    const buyC = meta.info.buyCost || {};
    const buyBtns = (buyC.fs ? `<button class="buybtn" id="buyFs"><small>FREE SPIN</small>SATIN AL<b id="buyFsC"></b></button>` : '') + (buyC.super ? `<button class="buybtn super" id="buySuper"><small>SÜPER</small>FREE SPIN<b id="buySuperC"></b></button>` : '');
    // REFERANS DÜZENİ (Okey Hall): üst bar · solda satın alma + kazanç kaydı · ortada altın çerçeveli makara · sağda tema karakteri · altta kontrol barı
    const s = UI.screen('game', `<div class="bgart"></div><div class="bglayer"></div>${id === 'peri' ? '<div class="pcrys"><i></i><i></i><i></i><i></i><i></i><i></i></div>' : ''}${id === 'zeus' ? '<div class="zclouds"></div>' : ''}
      <div class="gtopbar"><button class="gtb back" id="gBack">◀</button>
        <div class="gcoins" id="tCoins"><i class="hcoin"></i><b id="tBal"></b><span class="plus" id="gShop">+</span></div>
        <button class="gshop" id="gShop2">MAĞAZA</button>
        <div class="glvl"><span class="lvl" id="tLvl"></span><div class="xpbar"><i id="tXp"></i><em id="tXpT"></em></div><span class="nm" id="tName"></span></div>
        <div class="grow"></div><button class="gtb ${G.turbo ? 'on' : ''}" id="gTurbo" title="Hızlı mod">⏩<small>x${G.turbo ? 2 : 1}</small></button><button class="gtb" id="gAuto" title="Otomatik">A<span class="autoN"></span></button><button class="gtb" id="gInfo" title="Bilgi">☰</button></div>
      <div class="gleftcol">${buyBtns ? `<div class="buycol">${buyBtns}</div>` : ''}
        <div class="gboxes"><div class="sidebox" id="mL"><small>TOPLAM ÇARPAN</small><b>x0</b></div><div class="sidebox" id="mR"><small>KALAN FREE SPIN</small><b>—</b></div></div>
        ${jpBars}<div class="winlog" id="winLog"><span class="wlempty">💬</span></div></div>
      <div class="gcenter"><div class="machine" id="machine"><div class="reels" id="reels"></div><svg class="linesvg" id="lineSvg"></svg><div id="fsBar"></div></div><div class="twin" id="tWin"><small>TOPLAM KAZANÇ</small><b id="tWinV">0</b></div></div>
      <div class="gchar"><div class="hero">${hero}${id === 'peri' ? '<i class="wandstar"></i>' : ''}</div><div class="gtitle gold">${esc(meta.name)}</div><span class="gvol">${esc(meta.info.volatility || '')} · RTP %${(meta.info.rtp * 100).toFixed(1)}</span></div>
      <div class="gbottom">
        <button class="gbb info" id="gInfo2">OYUN<br>BİLGİ</button>
        <div class="betgrp"><button class="gb" id="bMinus">−</button><div class="betv"><b id="bVal"></b><small>TOPLAM BAHİS</small></div><button class="gb" id="bPlus">+</button></div>
        <div class="gplaque"><div class="winline"><div class="wlwin" id="winLine"><span class="muted small">${esc(meta.tag)}</span></div></div><span class="hidden" id="wBal"></span></div>
        <button class="gbb max" id="bMax">MAX<br>BET</button>
        <button class="spinpill" id="gSpin"><span class="t1">SPIN</span><span class="t2">OTOMATİK İÇİN BASILI TUT</span></button>
      </div>`, 'gscreen land ok');
    s.style.cssText = `--b1:${th.b1};--b2:${th.b2};--glow:${th.glow}`; s.dataset.g = id;
    if (G.rows <= 3) s.classList.add('tall');
    const bc = () => { const b = App.bets[G.betIdx]; if ($('#buyFsC')) $('#buyFsC').textContent = short(Math.round(b * buyC.fs)); if ($('#buySuperC')) $('#buySuperC').textContent = short(Math.round(b * buyC.super)); }; G.updBuy = bc;
    UI.show('game'); Screens.renderTop();
    if (window.CardFX) { G.amb && G.amb.destroy(); G.amb = CardFX.ambient(s, id); } // oyunun kendi canlı arka planı (şimşek, ateş, kelebek, altın…)
    meter('L'); meter('R'); sizeGrid(); buildGrid(); fitGrid(); initialFill(); renderBet();
    { const gb = $('#gBack'); let t = 0; const go = (e) => { e && e.preventDefault(); const n = Date.now(); if (n - t < 400) return; t = n; close(); }; gb.onclick = go; gb.addEventListener('pointerup', go); } $('#gShop').onclick = () => { close(); Screens.shop(); };
    $('#gInfo').onclick = info; $('#gInfo2').onclick = info; $('#gShop2').onclick = () => { close(); Screens.shop(); }; G.log = [];
    // SPIN: dokun = döndür, dönerken dokun = STOP (animasyonu hızlandır), basılı tut = otomatik menü
    let pressT = null, longFired = false;
    const sp = $('#gSpin');
    sp.addEventListener('pointerdown', () => { longFired = false; pressT = setTimeout(() => { longFired = true; if (!G.spinning) autoMenu(); }, 650); });
    sp.addEventListener('pointerup', () => clearTimeout(pressT)); sp.addEventListener('pointerleave', () => clearTimeout(pressT));
    sp.onclick = () => { if (longFired) return; if (G.auto) { G.auto = 0; renderAuto(); } else if (G.spinning) { G.skip = true; G.speed = 0.35; } else spin(); };
    $('#bMax').onclick = () => { if (!G.spinning) { G.betIdx = App.bets.length - 1; while (G.betIdx > 0 && !App.me.unlimited && App.bets[G.betIdx] > App.me.balance) G.betIdx--; renderBet(); Sound.play('click'); } };
    if ($('#buyFs')) $('#buyFs').onclick = () => buyBonus('fs');
    if ($('#buySuper')) $('#buySuper').onclick = () => buyBonus('super');
    $('#bMinus').onclick = () => { if (!G.spinning) { G.betIdx = Math.max(0, G.betIdx - 1); renderBet(); Sound.play('click'); } };
    $('#bPlus').onclick = () => { if (!G.spinning) { G.betIdx = Math.min(App.bets.length - 1, G.betIdx + 1); renderBet(); Sound.play('click'); } };
    $('#gTurbo').onclick = (e) => { G.turbo = !G.turbo; G.speed = G.turbo ? 0.5 : 1; e.currentTarget.classList.toggle('on', G.turbo); const sm = e.currentTarget.querySelector('small'); if (sm) sm.textContent = G.turbo ? 'x2' : 'x1'; document.documentElement.style.setProperty('--speed', G.speed); };
    $('#gAuto').onclick = autoMenu;
    document.documentElement.style.setProperty('--speed', G.speed);
  }
  // Oyundan çıkış her koşulda çalışmalı: animasyon, modal veya hata çıkışı engelleyemez
  function close() {
    Sound.theme('slot'); if (G.amb) { G.amb.destroy(); G.amb = null; }
    G.gen++; G.open = false; G.auto = 0; G.skip = true; G.spinning = false;
    try { $$('.bigwin,.multbadge,.bolt,.flash,.zcharge,.zimpact,.zring,.flymult,.fxi,.flyorb,.expandcol').forEach(e => e.remove()); } catch (e) { /* yoksay */ }
    try { UI.closeModal(true); } catch (e) { /* yoksay */ }
    try { const cur = window.Platform && Platform.current(); Screens.go(cur && cur !== 'game' ? cur : 'home'); }
    catch (e) { window.reportError && window.reportError(e); try { UI.show('main'); } catch (e2) { /* yoksay */ } }
  }
  function renderBet() {
    const b = App.bets[G.betIdx]; $('#bVal').textContent = short(b); localStorage.setItem('slot_bet_' + G.id, b);
    const inf = G.meta.info; if ($('#jpGrand')) $('#jpGrand').textContent = short(Math.round((G.id === 'korsan' ? inf.grand : Math.max(...inf.wheel.map(w => w.value))) * b));
    G.updBuy && G.updBuy();
    if ($('#jpMajor')) $('#jpMajor').textContent = short(Math.round(inf.coinValues[inf.coinValues.length - 1] * b));
  }
  function renderAuto() { const b = $('#gAuto'); if (!b) return; b.querySelector('.autoN').textContent = G.auto ? (G.auto > 900 ? '∞' : G.auto) : ''; b.classList.toggle('on', !!G.auto); spinLabel(); }
  function spinLabel() { const b = $('#gSpin'); if (!b) return; const stop = G.spinning || G.auto; b.classList.toggle('stop', !!stop); b.querySelector('.t1').textContent = stop ? 'STOP' : 'SPIN'; b.querySelector('.t2').textContent = G.auto ? (G.auto > 900 ? 'OTO ∞' : 'OTO ' + G.auto) : stop ? 'hızlandır' : 'basılı tut: OTO'; }
  async function buyBonus(kind) {
    if (G.spinning) return;
    const bet = App.bets[G.betIdx], cost = Math.round(bet * G.meta.info.buyCost[kind]);
    const art = G.id === 'zeus' ? 'b_scatter' : G.id === 'peri' ? 'a_scatter' : G.id === 'korsan' ? 'a_chest' : G.id === 'misir' ? 'a_bonus' : 'a_bonus';
    const desc = kind === 'super' ? 'Süper free spin: çarpan sembolleri 2,2 kat daha sık düşer.' : G.meta.family === 'pirate' ? '6 altın sikkeyle Sandık Altını bonusu başlar.' : G.meta.family === 'ways' ? '10 ücretsiz dönüş, her kazançta çarpan +1.' : `${G.meta.info.fsCount || 10} ücretsiz dönüş hemen başlar.`;
    const ok = await modal(`<h3 class="gold">${kind === 'super' ? 'SÜPER FREE SPIN' : 'FREE SPIN'} SATIN AL</h3><div class="center"><img src="assets/${art}.webp" style="width:170px;filter:drop-shadow(0 0 16px #ffd34d)" alt=""></div>
      <div class="center gold" style="font-size:44px;font-weight:900">${fmt(cost)}</div><p class="center small">${desc}<br>Bahis: ${fmt(bet)} · Fiyat bahsin ${G.meta.info.buyCost[kind]} katı · RTP %95</p>
      <div class="row"><button class="btn red grow" data-close="0">✕</button><button class="btn green grow" data-close="1">✓ SATIN AL</button></div>`);
    if (ok === '1') spin(kind);
  }
  function autoMenu() {
    if (G.auto) { G.auto = 0; renderAuto(); return; }
    modal(`<h3 class="gold">Otomatik Dönüş</h3><div class="row wrap" style="justify-content:center">${[10, 25, 50, 100, 999].map(n => `<button class="btn purple" data-n="${n}">${n > 900 ? '∞' : n}</button>`).join('')}</div><p class="small muted center">Bonus özelliği tetiklendiğinde veya bakiye yetmediğinde durur. Durdurmak için dönüş butonuna dokun.</p>`, {
      onOpen(m) { $$('[data-n]', m).forEach(b => b.onclick = () => { G.auto = +b.dataset.n; closeModal(); renderAuto(); if (!G.spinning) spin(); }); },
    });
  }
  function sizeGrid() {
    // yatay sahne (960×440): orta sütun ~468×380
    const W = 468 - 20; const H = 440 - 48 - 24;
    const byW = Math.floor((W - 4 * (G.cols - 1)) / G.cols); const byH = Math.floor((H - 4 * (G.rows - 1)) / G.rows);
    const cell = Math.max(40, Math.min(byW, byH, G.cols <= 3 ? 110 : 92));
    $('#game').style.setProperty('--cell', cell + 'px'); G.cell = cell; G.step = cell + 4;
  }
  // Izgarayı ekranda kalan dikey boşluğu dolduracak kadar büyüt (genişlik sınırı içinde)
  function fitGrid() {
    const c = $('.gcenter'); if (!c) return;
    const W = c.clientWidth - 24, H = c.clientHeight - 24;
    const byW = Math.floor((W - 4 * (G.cols - 1)) / G.cols), byH = Math.floor((H - 4 * (G.rows - 1)) / G.rows);
    const cell = Math.max(40, Math.min(byW, byH, G.cols <= 3 ? 118 : 96));
    if (cell !== G.cell) { $('#game').style.setProperty('--cell', cell + 'px'); G.cell = cell; G.step = cell + 4; }
  }
  function buildGrid() {
    const r = $('#reels'); r.style.gridTemplateColumns = `repeat(${G.cols}, var(--cell))`; r.innerHTML = ''; G.boxes = [];
    for (let row = 0; row < G.rows; row++) for (let c = 0; c < G.cols; c++) { const b = document.createElement('div'); b.className = 'cellbox'; b.style.gridRow = row + 1; b.style.gridColumn = c + 1; r.appendChild(b); G.boxes[c * G.rows + row] = b; }
    const svg = $('#lineSvg'); svg.setAttribute('viewBox', `0 0 ${r.offsetWidth} ${r.offsetHeight}`);
  }
  const nSyms = () => G.th.syms.length;
  function randCode() { const f = G.meta.family; let n = nSyms(); if (f === 'pirate') n = 8; if (f === 'gold' || f === 'egypt') n = 9; if (f === 'ways') n = 8; if (f === 'vegas') n = 9; return (Math.random() * n) | 0; }
  function setCell(i, code, cls = '', from = null, delay = 0) {
    const b = G.boxes[i]; if (!b) return;
    b.innerHTML = Sym.symHtml(G.id, code, cls);
    const s = b.firstElementChild; if (from != null) { s.classList.add('fall'); s.style.setProperty('--from', from + 'px'); s.style.setProperty('--d', (delay * G.speed) + 's'); }
  }
  function initialFill() { for (let i = 0; i < G.boxes.length; i++) setCell(i, randCode(), '', -G.step * (G.rows + 1), ((i / G.rows) | 0) * 0.05); }
  const SC = () => { const a = document.getElementById('app'); return a ? a.getBoundingClientRect().width / 960 : 1; };
  function center(i) { const r = G.boxes[i].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function countWin(from, to, label) {
    return new Promise(res => {
      const el = $('#winLine'); if (!el) return res();
      el.innerHTML = `<span class="lb">${label}</span><span class="v mcount">${fmt(Math.round(from))}</span>`; const v = el.querySelector('.v');
      const dur = G.skip ? 150 : 900, t0 = performance.now(), gen = G.gen;
      const step = (t) => { if (gen !== G.gen) return res(); const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); v.textContent = fmt(Math.round(from + (to - from) * e)); if (p < 1) requestAnimationFrame(step); else { setWin(Math.round(to), 'KAZANÇ'); Sound.play('coin'); setTimeout(res, G.skip ? 50 : 350); } };
      requestAnimationFrame(step);
    });
  }
  let setWin = function (amount, label) { const el = $('#winLine'); if (!el) return; el.innerHTML = amount > 0 ? `<span class="lb">${label || 'KAZANÇ'}</span><span class="v">${fmt(amount)}</span>` : `<span class="lb">KAZANÇ</span><span class="v dim">0</span>`; };
  // TOPLAM KAZANÇ şeridi (makaranın üstünde) — her kazançta güncellenir
  const _setWin = setWin;
  setWin = function (amount, label) { _setWin(amount, label); const t = $('#tWin'); if (!t) return; if (amount > 0) { $('#tWinV').textContent = fmt(amount); t.classList.add('on'); } else t.classList.remove('on'); };
  /** Kazanç kaydı (sol kutu): adet × sembol → jeton */
  function logWin(code, n, amount) {
    const el = $('#winLog'); if (!el) return; G.log = G.log || []; G.log.unshift({ code, n, amount }); G.log = G.log.slice(0, 4);
    el.innerHTML = G.log.map(x => `<div class="wlr"><b>${x.n}</b><span class="wls">${Sym.symHtml(G.id, x.code, '')}</span><em>${fmt(x.amount)}</em></div>`).join('');
  }
  /** "+kazanç" yazısı kazanan kümenin ortasında belirir ve yükselir */
  function floatWin(cells, amount) {
    if (!cells.length) return; let x = 0, y = 0; cells.forEach(i => { const c = center(i); x += c.x; y += c.y; }); x /= cells.length; y /= cells.length;
    const d = document.createElement('div'); d.className = 'fwin'; d.textContent = '+' + fmt(amount); d.style.cssText = `left:${x}px;top:${y}px`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 1300);
  }
  function meter(side, html) {
    const m = $(side === 'L' ? '#mL' : '#mR'); if (!m) return;
    if (!html) { m.innerHTML = side === 'L' ? `<small>${G.meta.family === 'ways' ? 'ÇARPAN' : G.meta.family === 'tumble' ? 'TOPLAM ÇARPAN' : 'BONUS'}</small><b>${G.meta.family === 'ways' ? 'x1' : G.meta.family === 'tumble' ? 'x0' : '—'}</b>` : `<small>KALAN FREE SPIN</small><b>—</b>`; m.classList.remove('lit'); return; }
    const mm = /^(.*?)<b[^>]*>(.*)<\/b>$/.exec(html); m.innerHTML = mm ? `<small>${mm[1]}</small><b>${mm[2]}</b>` : html; m.classList.add('lit');
  }
  function fsBar(text) { $('#fsBar').innerHTML = text ? `<div class="fsbar">${text}</div>` : ''; }
  function clearLines() { $('#lineSvg').innerHTML = ''; $$('.expandcol').forEach(e => e.remove()); }
  function dimAll(on) { G.boxes.forEach(b => b.firstElementChild && b.firstElementChild.classList.toggle('dim', on)); }
  function markWin(pos) { pos.forEach(i => { const s = G.boxes[i] && G.boxes[i].firstElementChild; if (s) { s.classList.remove('dim'); s.classList.add('win'); } }); }
  function unmark() { G.boxes.forEach(b => { const s = b.firstElementChild; if (s) s.classList.remove('win', 'dim'); }); }

  /* ---------- spin ---------- */
  async function spin(buyKind) {
    if (G.spinning || !G.open) return;
    const bet = App.bets[G.betIdx], me = App.me;
    const cost = buyKind ? Math.round(bet * G.meta.info.buyCost[buyKind]) : bet;
    if (!me.unlimited && me.balance < cost) {
      G.auto = 0; renderAuto(); Sound.play('error');
      const go = await UI.confirm('Bu bahis için yeterli jetonun yok. Mağazaya gitmek ister misin?', 'Mağaza'); if (go) { close(); Screens.shop(); }
      return;
    }
    G.spinning = true; G.skip = false; G.speed = G.turbo ? 0.5 : 1; spinLabel(); clearLines(); unmark(); setWin(0); meter('L'); meter('R'); fsBar('');
    if (!me.unlimited) Screens.setBalance(me.balance - cost);
    Sound.play('spin'); Sound.vibrate(15); G.amb && G.amb.event('spin');
    const key = Api.uuid();
    const vis = buyKind && G.meta.family !== 'pirate' ? null : startVisual();
    let r;
    try { r = G.demo.length ? demoResp(G.demo.shift(), bet) : await Api.retrying('POST', '/api/spin', { game: G.id, bet, key, buy: buyKind || undefined }); }
    catch (e) {
      stopVisualRandom(vis); toast(e.message, true); G.auto = 0; renderAuto();
      await Screens.refresh().catch(() => {}); G.spinning = false; spinLabel(); return;
    }
    const myGen = G.gen;
    try { await ANIM[G.meta.family](r, vis, bet); } catch (e) { if (e !== ABORT) console.error(e); }
    if (vis && vis.iv) clearInterval(vis.iv);
    if (myGen !== G.gen || !G.open) { finishQuiet(r); return; }
    setWin(r.win, r.win >= bet * 10 ? 'TOPLAM KAZANÇ' : 'KAZANÇ');
    if (r.win >= (r.cost || bet) * 10 || (r.buy && r.win >= bet * 20)) { G.amb && G.amb.event('big'); await bigWin(r.win, r.win / bet); }
    else if (r.win > 0) { G.amb && G.amb.event('win'); Sound.play('win'); const c = $('#reels').getBoundingClientRect(); UI.coinBurst(c.left + c.width / 2, c.top + c.height / 2, Math.min(18, 4 + r.win / bet * 2)); }
    finish(r);
    const feature = !!(r.result.fs || r.result.hold || r.result.wheel);
    if (G.auto && G.open) {
      if (feature) { G.auto = 0; renderAuto(); }
      else { if (G.auto < 900) G.auto--; renderAuto(); setTimeout(() => { if (G.auto && G.open) spin(); }, r.win > 0 ? 900 * G.speed : 350 * G.speed); }
    }
  }
  function finishQuiet(r) { // ekran kapandıysa yalnızca bakiye/XP güncellenir
    const me = App.me; if (!me) return; me.balance = r.balance; Object.assign(me, { xp: r.xp.xp, level: r.xp.level, xpInto: r.xp.into, xpNeed: r.xp.need, maxLevel: r.xp.max }); Screens.renderTop();
    if (r.xp.levelUp) Screens.refresh().catch(() => {});
  }
  function finish(r) {
    const me = App.me; Screens.setBalance(r.balance, r.win > 0);
    Object.assign(me, { xp: r.xp.xp, level: r.xp.level, xpInto: r.xp.into, xpNeed: r.xp.need, maxLevel: r.xp.max });
    Screens.renderTop(); G.spinning = false; G.speed = G.turbo ? 0.5 : 1; spinLabel();
    if (r.xp.levelUp) levelUp(r.xp.levelUp);
  }
  async function levelUp(L) {
    Sound.play('feature'); UI.confetti(80); toast(`🎉 Seviye atladın! Artık Seviye ${L}`);
    await Screens.refresh().catch(() => {});
    if (L % 10 === 0) { G.auto = 0; renderAuto(); Screens.levelRewardsModal(); }
  }

  /* ---------- makara görselleri ---------- */
  function startVisual() {
    if (G.meta.family === 'tumble') { // eski semboller hafifçe aşağı kayar; yenileri sunucu yanıtıyla düşer
      G.boxes.forEach((b, i) => { const s = b.firstElementChild; if (s) { s.style.transition = `transform ${0.18 * G.speed}s ease-in ${((i / G.rows) | 0) * 0.02}s`; s.style.transform = `translateY(${G.step * 0.25}px)`; } });
      return { tumble: true };
    }
    const iv = setInterval(() => { G.boxes.forEach((b, i) => { if (!vis.stopped[(i / G.rows) | 0]) { b.innerHTML = Sym.symHtml(G.id, randCode()); b.firstElementChild.style.filter = 'blur(1.5px)'; b.firstElementChild.style.transform = `translateY(${(Math.random() * 10 - 5) | 0}px)`; } }); Sound.play('tick'); }, 70);
    const vis = { iv, stopped: [] };
    return vis;
  }
  function stopVisualRandom(vis) { if (vis && vis.iv) clearInterval(vis.iv); initialFill(); }
  function sideL(label, val) { const m = $('#mL'); if (m) m.innerHTML = `<small>${label}</small><b>${val}</b>`; }
  function sideR(label, val) { const m = $('#mR'); if (m) m.innerHTML = `<small>${label}</small><b>${val}</b>`; }
  async function stopReels(vis, grid, decor) {
    for (let c = 0; c < G.cols; c++) {
      await sleep(c === 0 ? 220 : 110);
      vis.stopped[c] = true;
      for (let r = 0; r < G.rows; r++) { const i = c * G.rows + r; setCell(i, decor ? decor(i, grid[i]) : grid[i]); G.boxes[i].firstElementChild.classList.add('stopbounce'); }
      Sound.play('stop');
    }
    clearInterval(vis.iv);
  }
  function spinVisualAgain() { const v = startVisual(); return v; }

  /* ---------- çizgi/yol kazançları ---------- */
  function drawLine(pos, color) {
    const svg = $('#lineSvg'); const rr = $('#reels').getBoundingClientRect();
    const pts = pos.map(i => { const c = center(i); return `${c.x - rr.left},${c.y - rr.top}`; }).join(' ');
    svg.setAttribute('viewBox', `0 0 ${rr.width} ${rr.height}`);
    svg.insertAdjacentHTML('beforeend', `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 6px ${color})" opacity=".9"/>`);
  }
  const LINE_COLORS = ['#ffd34d', '#35d6ff', '#ff7acf', '#6bff7a', '#ff8a3d', '#c07bff', '#ff4d6d', '#7fffd4'];
  async function showWins(wins, bet, opts = {}) {
    if (!wins || !wins.length) return 0;
    let total = 0; dimAll(true);
    wins.forEach((w, k) => { markWin(w.pos); if (!opts.noLines && w.line != null) drawLine(w.pos, LINE_COLORS[k % LINE_COLORS.length]); total += w.pay * bet; if (w.pos && k < 4) floatWin(w.pos, Math.round(w.pay * bet)); if (w.s != null) logWin(w.s, w.n, Math.round(w.pay * bet)); });
    setWin(Math.round(total)); Sound.play('win');
    await sleep(G.skip ? 200 : 1100);
    if (wins.length > 1 && !G.skip && !G.auto) {
      for (const [k, w] of wins.slice(0, 6).entries()) {
        clearLines(); unmark(); dimAll(true); markWin(w.pos); if (!opts.noLines && w.line != null) drawLine(w.pos, LINE_COLORS[k % LINE_COLORS.length]);
        $('#winLine').innerHTML = `<span class="small">${w.ways ? w.ways + ' yol' : 'Çizgi ' + (w.line + 1)} · ${esc(Sym.symName(G.id, w.s))} x${w.n}</span><span class="v">${fmt(Math.round(w.pay * bet))}</span>`;
        await sleep(650); if (G.skip) break;
      }
    }
    clearLines(); unmark();
    return total;
  }

  /* ---------- efektler (sprite sayfasından kesilen fx_* görselleri) ---------- */
  function fxs(name, x, y, size, dur = 0.8, o = {}) {
    if (document.querySelectorAll('.fxi').length > 24) return;
    const e = document.createElement('img'); e.src = `assets/${name}.webp`; e.className = 'fxi'; e.draggable = false;
    const d = dur * (G.turbo ? 0.65 : 1);
    e.style.cssText = `left:${x}px;top:${y}px;width:${size}px;--d:${d}s;--s:${o.s || 1.4};--r1:${o.r1 == null ? 40 : o.r1}deg;animation-delay:${o.delay || 0}s;${o.hue ? `filter:hue-rotate(${o.hue}deg);` : ''}`;
    document.body.appendChild(e); setTimeout(() => e.remove(), (d + (o.delay || 0)) * 1000 + 150);
  }
  function reelsMid() { const r = $('#reels').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }
  /* ---------- ZEUS YILDIRIMI: 4 aşama ----------
   * 1) Yüklenme: Zeus'un elinde enerji topu parlar
   * 2) Hareket: dallanan şimşek Zeus'tan hedef sembole doğru ilerleyerek çizilir (stroke-dashoffset)
   * 3) Çarpma: hedefte ışık patlaması + şok dalgası halkası + kıvılcımlar + kısa sarsıntı
   * 4) Etki: çarpan sembolü büyür, değeri büyük yazıyla TOPLAM ÇARPAN kutusuna uçar
   * Yalnızca transform/opacity ve hafif SVG kullanır (bulanıklık filtresi yok). */
  function jag(x0, y0, x1, y1, seg, amp) {
    const pts = [[x0, y0]];
    for (let k = 1; k < seg; k++) { const t = k / seg, nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1, off = (Math.random() * 2 - 1) * amp * Math.sin(Math.PI * t); pts.push([x0 + (x1 - x0) * t + nx / L * off, y0 + (y1 - y0) * t + ny / L * off]); }
    pts.push([x1, y1]); return pts;
  }
  const pathD = (pts) => 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  function heroPoint() { const h = $('.gchar .heroimg'); if (!h) return { x: innerWidth / 2, y: 60 }; const r = h.getBoundingClientRect(); return { x: r.left + r.width * 0.62, y: r.top + r.height * 0.42 }; }
  async function zeusStrike(i, onImpact) {
    const to = center(i), from = heroPoint(), sp = G.speed;
    // 1) yüklenme
    const orb = document.createElement('div'); orb.className = 'zcharge'; orb.style.cssText = `left:${from.x}px;top:${from.y}px`; document.body.appendChild(orb);
    const hero = $('.gchar .heroimg'); hero && hero.classList.add('zflash');
    Sound.play('orb'); await sleep(170);
    // 2) hareket: ana gövde + 2 dal
    const main = jag(from.x, from.y, to.x, to.y, 12, 38);
    const br = [5, 8].map(k => { const p = main[k]; return jag(p[0], p[1], p[0] + (Math.random() * 120 - 60), p[1] + 40 + Math.random() * 50, 5, 14); });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'bolt'); svg.setAttribute('width', innerWidth); svg.setAttribute('height', innerHeight);
    const len = main.reduce((a, p, k) => k ? a + Math.hypot(p[0] - main[k - 1][0], p[1] - main[k - 1][1]) : 0, 0) + 10;
    svg.innerHTML = `<path class="zglow" d="${pathD(main)}" style="stroke-dasharray:${len};stroke-dashoffset:${len};animation-duration:${.16 * sp}s"/>` +
      `<path class="zcore" d="${pathD(main)}" style="stroke-dasharray:${len};stroke-dashoffset:${len};animation-duration:${.16 * sp}s"/>` +
      br.map(b => `<path class="zbranch" d="${pathD(b)}" style="animation-delay:${.1 * sp}s"/>`).join('');
    document.body.appendChild(svg); Sound.play('thunder');
    await sleep(160);
    // 3) çarpma
    const imp = document.createElement('div'); imp.className = 'zimpact'; imp.style.cssText = `left:${to.x}px;top:${to.y}px;--sz:${G.cell * 2.4 * SC()}px`; document.body.appendChild(imp);
    const ring = document.createElement('div'); ring.className = 'zring'; ring.style.cssText = `left:${to.x}px;top:${to.y}px;--sz:${G.cell * 2.8 * SC()}px`; document.body.appendChild(ring);
    UI.burst(to.x, to.y, 12, ['#ffffff', '#9fe8ff', '#5aa0ff']);
    const m = $('#machine'); m.classList.remove('shake'); void m.offsetWidth; m.classList.add('shake');
    Sound.vibrate(30);
    onImpact && onImpact();
    await sleep(240);
    svg.classList.add('zfade'); orb.remove(); hero && hero.classList.remove('zflash');
    setTimeout(() => { svg.remove(); imp.remove(); ring.remove(); }, 380);
  }
  // KRİSTAL PERİ: 1) asa kalkar ve yıldız parlar 2) kristal parçaları asadan süzülür 3) hedef sembol ışıldar
  // 4) kristal patlaması 5) çarpan (X) ancak patlamadan SONRA açılır — Zeus şimşeğinden tamamen farklı akış
  async function periStrike(i, onReveal) {
    const to = center(i), from = heroPoint(), sp = G.speed, k = SC();
    const hero = $('.gchar .hero'); hero && hero.classList.add('pwand');
    Sound.play('orb'); await sleep(260 * sp);
    const shards = [];
    for (let n = 0; n < 5; n++) {
      const d = document.createElement('div'); d.className = 'pshard';
      const mx = (from.x + to.x) / 2 + (n - 2) * 34 * k, my = Math.min(from.y, to.y) - (40 + n * 8) * k;
      d.style.cssText = `left:${from.x}px;top:${from.y}px;--dx:${to.x - from.x}px;--dy:${to.y - from.y}px;--mx:${mx - from.x}px;--my:${my - from.y}px;animation-duration:${(.42 + n * .05) * sp}s;--s:${k}`;
      document.body.appendChild(d); shards.push(d);
    }
    await sleep(380 * sp);
    const cell = G.boxes[i] && G.boxes[i].firstElementChild; cell && cell.classList.add('pglow');
    await sleep(200 * sp);
    const burst = document.createElement('div'); burst.className = 'pburst'; burst.style.cssText = `left:${to.x}px;top:${to.y}px;--sz:${G.cell * 2.6 * k}px`;
    for (let n = 0; n < 10; n++) { const f = document.createElement('i'); f.style.setProperty('--a', (n * 36) + 'deg'); burst.appendChild(f); }
    document.body.appendChild(burst); UI.burst(to.x, to.y, 14, ['#ffd6ff', '#ff9ae8', '#9ff3ff', '#ffffff']);
    Sound.play('pop'); Sound.vibrate(25);
    shards.forEach(d => d.remove());
    await sleep(260 * sp);
    onReveal && onReveal();
    hero && hero.classList.remove('pwand');
    setTimeout(() => { burst.remove(); cell && cell.classList.remove('pglow'); }, 500);
  }
  // 4) çarpan değeri büyük yazıyla hedef kutuya uçar
  async function flyMult(i, v, target) {
    const a = center(i), b = target.getBoundingClientRect();
    const d = document.createElement('div'); d.className = 'flymult'; d.textContent = 'x' + v; d.style.cssText = `left:${a.x}px;top:${a.y}px`;
    document.body.appendChild(d); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    d.style.transform = `translate(${b.left + b.width / 2 - a.x}px,${b.top + b.height / 2 - a.y}px) scale(.55)`; d.style.opacity = '.2';
    await sleep(420); d.remove(); target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump');
  }
  function bolt(to) { /* eski basit şimşek (geri uyumluluk) */ UI.burst(to.x, to.y, 10, ['#fff', '#9fe8ff']); }
  function badge(text, color = '#ffd34d') {
    const d = document.createElement('div'); d.className = 'multbadge gold'; d.textContent = text; d.style.filter = `drop-shadow(0 0 20px ${color})`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 1150);
  }
  async function flyOrb(i, target) {
    const s = G.boxes[i].querySelector('.orb'); if (!s) return; const a = s.getBoundingClientRect(); const b = target.getBoundingClientRect();
    const c = s.cloneNode(true); c.classList.add('flyorb'); c.style.cssText += `;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;position:fixed`;
    document.body.appendChild(c); await new Promise(r => requestAnimationFrame(r));
    c.style.left = (b.left + b.width / 2 - a.width / 4) + 'px'; c.style.top = (b.top + b.height / 2 - a.height / 4) + 'px'; c.style.transform = 'scale(.5)'; c.style.opacity = '.4';
    Sound.play('orb'); await sleep(450); c.remove(); UI.burst(b.left + b.width / 2, b.top + b.height / 2, 14, ['#ff9ae8', '#fff']);
  }
  function overlayBanner(title, sub, ms = 2200, emoji = '') {
    return new Promise(res => {
      const d = document.createElement('div'); d.className = 'bigwin';
      const art = { '⚡': 'b_scatter', '🧚': 'a_scatter', '📖': 'a_bonus', '🐉': 'card_dragon', '🏴‍☠️': 'a_chest', '🎰': 'a_jackpot', '🏆': 'b_chest', '✨': 'b_scatter', '🔮': 'a_scatter', '💰': 'a_jackpot', '🍒': 'a_seven' }[emoji];
      d.innerHTML = `<div class="rays"></div><img class="bgfx" src="assets/fx_burstp.webp" alt="">${art ? `<img src="assets/${art}.webp" style="position:relative;width:220px;max-height:200px;object-fit:contain;animation:floaty 2s infinite;filter:drop-shadow(0 0 18px #ffd34d)${art.startsWith('card') ? ';border-radius:24px' : ''}" alt="">` : emoji ? `<div style="position:relative;font-size:90px;animation:floaty 2s infinite">${emoji}</div>` : ''}<div class="t gold">${title}</div><div class="s" style="font-size:18px;color:#fff">${sub || ''}</div><div class="s">Devam etmek için dokun</div>`;
      document.body.appendChild(d); Sound.play('feature'); UI.confetti(50);
      const gen = G.gen; const done = () => { d.remove(); res(); }; d.onclick = done; setTimeout(() => d.isConnected && done(), G.auto ? ms * 0.5 : ms * 0.9);
      const chk = setInterval(() => { if (gen !== G.gen) { clearInterval(chk); done(); } else if (!d.isConnected) clearInterval(chk); }, 300);
    });
  }
  // Büyük kazanç: "TEBRİKLER! KAZANDINIZ" — sayaç yükselirken seviye BIG → MEGA → SUPER → EPIC yükselir, DEVAM ET ile kapanır
  function bigWin(win, x) {
    const TIERS = [[10, 'BÜYÜK KAZANÇ'], [25, 'MEGA KAZANÇ'], [50, 'SÜPER KAZANÇ'], [100, 'EFSANE KAZANÇ']];
    const final = TIERS.filter(t => x >= t[0]).length - 1;
    return new Promise(res => {
      const d = document.createElement('div'); d.className = 'bigwin bw2' + (G.id ? ' bw-' + G.id : '');
      d.innerHTML = `<div class="rays"></div>${G.th && G.th.heroImg ? `<img class="bwhero" src="assets/${G.th.heroImg}.webp" alt="">` : ''}
        <div class="bwt">TEBRİKLER!</div><div class="bwsub"><span>KAZANDINIZ</span></div>
        <div class="bwframe"><div class="n" id="bwN">0</div></div>
        <div class="bwtier" id="bwT">${TIERS[0][1]}</div>
        <button class="bwgo" id="bwGo">DEVAM ET</button><div class="s">x${(Math.round(x * 10) / 10)} bahis</div>`;
      document.body.appendChild(d); Sound.play('bigwin'); Sound.vibrate([60, 40, 60]);
      const dur = Math.min(6000, 1600 + final * 1300) * G.speed; const t0 = performance.now(); let done = false, tier = 0;
      UI.coinShower(30); const iv = setInterval(() => UI.coinBurst(innerWidth / 2, innerHeight * 0.92, 8), 450);
      const setTier = (k) => { tier = k; const t = $('#bwT'); if (!t) return; t.textContent = TIERS[k][1]; t.classList.remove('tierup'); void t.offsetWidth; t.classList.add('tierup'); Sound.play('feature'); };
      const step = (now) => {
        if (done) return; const bn = $('#bwN'); if (!bn) { end(); return; }
        const p = Math.min(1, (now - t0) / dur), cur = win * (1 - Math.pow(1 - p, 2.2)); bn.textContent = fmt(cur);
        const curX = cur / (win / x); while (tier < final && curX >= TIERS[tier + 1][0]) setTier(tier + 1);
        if (p < 1) requestAnimationFrame(step); else { Sound.play('coin'); const n = $('#bwN'); n && n.classList.add('done'); if (G.auto) setTimeout(end, 1600); }
      };
      const end = () => { if (done) return; done = true; clearInterval(iv); if (tier < final) setTier(final); const n = $('#bwN'); n && (n.textContent = fmt(win)); setTimeout(() => { d.remove(); res(); }, 200); };
      // ilk dokunuş sayacı tamamlar, DEVAM ET kapatır
      d.onclick = (e) => { if (e.target.id === 'bwGo') return end(); const n = $('#bwN'); if (n && !n.classList.contains('done')) { n.textContent = fmt(win); n.classList.add('done'); if (tier < final) setTier(final); } else end(); };
      requestAnimationFrame(step);
      const gen = G.gen; const chk = setInterval(() => { if (gen !== G.gen) { clearInterval(chk); end(); } else if (done) clearInterval(chk); }, 300);
    });
  }
  function wheel(segs, idx, bet, title) {
    return new Promise(res => {
      const total = segs.reduce((a, s) => a + s.weight, 0); let acc = 0; const cols = ['#ff4d6d', '#ffd34d', '#35d6ff', '#6bff7a', '#c07bff', '#ff8a3d', '#ff9ae8'];
      const stops = []; const mids = [];
      segs.forEach((s, k) => { const a0 = acc / total * 360; acc += s.weight; const a1 = acc / total * 360; stops.push(`${cols[k % cols.length]} ${a0}deg ${a1}deg`); mids.push((a0 + a1) / 2); });
      const labels = segs.map((s, k) => { const a = mids[k], r = 105; const sz = Math.max(9, Math.min(15, s.weight / total * 160)); return `<div style="position:absolute;left:50%;top:50%;transform:rotate(${a}deg) translateY(-${r}px) rotate(90deg);transform-origin:0 0;font-weight:900;font-size:${sz}px;color:#1a0640;white-space:nowrap">${short(s.value * bet)}</div>`; }).join('');
      modal(`<h3 class="gold">${title}</h3><div class="wheelwrap"><div class="wheelptr">🔻</div><div class="wheel" id="whl" style="background:conic-gradient(${stops.join(',')});position:relative">${labels}</div><div class="hub">🎰</div></div><div class="center" id="whRes" style="min-height:40px;font-size:24px;font-weight:900"></div>`, {
        noClose: true,
        onOpen() {
          const target = 360 * 6 - mids[idx] + (Math.random() * 0.5 - 0.25) * (segs[idx].weight / total * 360);
          const w = $('#whl'); w.style.transitionDuration = (4.2 * G.speed) + 's'; let ticks = setInterval(() => Sound.play('tick'), 120);
          requestAnimationFrame(() => { w.style.transform = `rotate(${target}deg)`; });
          const gen = G.gen; setTimeout(() => { clearInterval(ticks); if (gen !== G.gen) return res(); $('#whRes').innerHTML = `<span class="gold">+${fmt(segs[idx].value * bet)}</span>`; Sound.play('bigwin'); UI.coinShower(60); setTimeout(() => { closeModal(); res(); }, 1500 * G.speed); }, 4300 * G.speed);
        },
      });
    });
  }

  /* ===================== MEKANİK ANİMASYONLARI ===================== */
  const ANIM = {};

  // 1) TUMBLE (Zeus, Kristal Peri)
  async function playSequence(seq, bet, fsAcc) {
    const R = G.rows, nS = nSyms();
    G.boxes.forEach((b, i) => setCell(i, seq.grid[i], '', -G.step * (R + 1), ((i / R) | 0) * 0.035 + (R - 1 - i % R) * 0.015));
    Sound.play('stop'); await sleep(430);
    let prev = seq.grid, running = 0;
    for (const st of seq.steps || []) {
      const rem = new Set(st.removed); rem.forEach(i => G.boxes[i].firstElementChild.classList.add('win', ...(G.id === 'peri' ? ['psparkle'] : [])));
      running += st.wins.reduce((a, w) => a + w.pay, 0) * bet; setWin(Math.round(running), 'ZİNCİR');
      for (const w of st.wins) { const cells = [...rem].filter(i => prev[i] === w.s); floatWin(cells, Math.round(w.pay * bet)); logWin(w.s, w.n, Math.round(w.pay * bet)); }
      Sound.play('win'); await sleep(G.skip ? 120 : 480);
      rem.forEach((i, k) => { const s = G.boxes[i].firstElementChild; s.classList.remove('win', 'psparkle'); s.classList.add(G.id === 'zeus' ? 'zpop' : G.id === 'peri' ? 'ppop' : 'pop'); if (k % 2 === 0) { const c = center(i); UI.burst(c.x, c.y, 4, G.id === 'zeus' ? ['#fff', '#9fe8ff'] : undefined); } });

      Sound.play('pop'); Sound.vibrate(20); await sleep(300);
      for (let c = 0; c < G.cols; c++) {
        const removedRows = []; for (let r = 0; r < R; r++) if (rem.has(c * R + r)) removedRows.push(r);
        const k = removedRows.length; if (!k) continue;
        for (let r = 0; r < R; r++) {
          const i = c * R + r; let from;
          if (r < k) from = -G.step * k; else { const oldR = survivorsOld(r - k); from = -G.step * (r - oldR); }
          setCell(i, st.grid[i], '', from === 0 ? null : from, r < k ? (k - r) * 0.03 : 0);
        }
        function survivorsOld(j) { let n = -1; for (let r = 0; r < R; r++) if (!rem.has(c * R + r)) { n++; if (n === j) return r; } return j; }
      }
      await sleep(340); prev = st.grid;
    }
    // çarpanlar: 1) kazanç kombinasyonu tamamlandı  2) şimşek/kristal patlaması  3) X değeri açılır  4) toplam çarpan  5) kazanç bir kez güncellenir
    const mpos = []; for (let i = 0; i < prev.length; i++) if (prev[i] >= 1000) mpos.push(i);
    let seqWin = running;
    if (running > 0 && mpos.length) {
      const box = $('#mL'); const base0 = fsAcc != null ? Math.max(0, fsAcc - seq.multSum) : 0; let shownSum = base0;
      setWin(Math.round(running), 'KAZANÇ'); await sleep(G.skip ? 60 : 350);
      for (const i of mpos) {
        const v = prev[i] - 1000;
        const reveal = () => { if (!G.boxes[i]) return; G.boxes[i].innerHTML = Sym.symHtml(G.id, 1000 + v, 'open mreveal'); };
        if (G.id === 'zeus') await zeusStrike(i, reveal);
        else if (G.id === 'peri') await periStrike(i, reveal);
        else { const c = center(i); fxs('fx_purple', c.x, c.y, G.cell * 2.2, 0.8, { s: 1.7 }); Sound.play('orb'); reveal(); await sleep(300); }
        await sleep(G.skip ? 60 : 260); // X değeri sembolün üstünde net görünsün
        if (box) await flyMult(i, v, box);
        shownSum += v; box && sideL('TOPLAM ÇARPAN', 'x' + shownSum);
      }
      const mult = fsAcc != null ? fsAcc : seq.multSum;
      box && sideL('TOPLAM ÇARPAN', 'x' + mult);
      badge('x' + mult, G.id === 'zeus' ? '#8fe3ff' : '#ff9ae8'); Sound.play('bigwin');
      // kazanç sunucunun hesapladığı değerle (zincir toplamı × çarpan) tek sefer güncellenir
      const final = seq.seqWin != null ? seq.seqWin * bet : running * mult;
      await countWin(running, final, `${fmt(Math.round(running))} × ${mult}`);
      seqWin = final;
    } else if (running > 0) {
      seqWin = seq.seqWin != null ? seq.seqWin * bet : running;
      if (Math.round(seqWin) !== Math.round(running)) { badge('x' + fsAcc, '#ff9ae8'); await countWin(running, seqWin, `${fmt(Math.round(running))} × ${fsAcc}`); } // Peri FS: zincir başına artan çarpan
    }
    return seqWin;
  }
  ANIM.tumble = async (r, vis, bet) => {
    const res = r.result, b = res.base;
    await sleep(120);
    let shown = 0;
    if (b) {
      await playSequence(b, bet, null);
      shown = b.seqWin * bet + b.scPay * bet;
      if (b.seqWin) setWin(Math.round(b.seqWin * bet));
      const scPos = []; (b.steps.length ? b.steps[b.steps.length - 1].grid : b.grid).forEach((v, i) => { if (v === nSyms()) scPos.push(i); });
      if (res.fs) { markWin(scPos); scPos.forEach(i => { const c = center(i); UI.burst(c.x, c.y, 16, ['#fff', '#ffd34d']); }); await sleep(900); unmark(); }
    }
    if (res.fs) {
      await overlayBanner(`${res.fs.count} ÜCRETSİZ DÖNÜŞ!`, res.fs.boost ? 'SÜPER: çarpanlar daha sık!' : b && b.scPay ? `Scatter ödülü: ${fmt(b.scPay * bet)}` : '', 2200, G.id === 'zeus' ? '⚡' : '🧚');
      let total = 0, n = 0;
      for (const sp of res.fs.spins) {
        if (!G.open) break; n++;
        fsBar(`BONUS KAZANÇ ${fmt(Math.round(total))}`);
        meter('L', `TOPLAM ÇARPAN<b>x${sp.acc - (sp.seqWin ? sp.added : 0)}</b>`);
        meter('R', `KALAN FREE SPIN<b>${sp.left}</b>`);
        setWin(0);
        await playSequence(sp, bet, sp.seqWin ? sp.acc : null);
        meter('L', `TOPLAM ÇARPAN<b>x${sp.acc}</b>`);
        total += sp.seqWin * bet; fsBar(`BONUS KAZANÇ ${fmt(Math.round(total))}`);
        if (sp.retrig) { await overlayBanner(`+${sp.retrig} DÖNÜŞ!`, 'Ekstra ücretsiz dönüş kazandın', 1400, '✨'); }
        await sleep(G.skip ? 80 : 220);
      }
      fsBar(''); meter('L'); meter('R'); await overlayBanner('BONUS BİTTİ', `Toplam: ${fmt(Math.round(total))} jeton`, 2000, '🏆');
      shown += total;
    }
    return shown;
  };

  // 2) MISIR HAZİNELERİ
  ANIM.egypt = async (r, vis, bet) => {
    const res = r.result, b = res.base;
    let shown = 0;
    const books = [];
    if (b) { await stopReels(vis, b.grid); shown = await showWins(b.wins, bet); b.grid.forEach((v, i) => { if (v === 9) books.push(i); }); }
    if (b && b.scPay) { dimAll(true); markWin(books); setWin(Math.round(b.scPay * bet), 'KİTAP ÖDÜLÜ'); Sound.play('feature'); await sleep(1200); unmark(); }
    if (res.fs) {
      await overlayBanner(`${res.fs.count} ÜCRETSİZ DÖNÜŞ!`, 'Özel genişleyen sembol seçiliyor…', 1600, '📖');
      await new Promise(rs => {
        modal(`<h3 class="gold">Özel Sembol</h3><div class="center" style="height:130px;display:flex;align-items:center;justify-content:center"><div class="cellbox" style="--cell:110px;width:110px;height:110px" id="spSym"></div></div><p class="center" id="spNm"></p>`, {
          noClose: true, onOpen: async () => {
            for (let k = 0; k < 18; k++) { $('#spSym').innerHTML = Sym.symHtml('misir', k % 9); Sound.play('tick'); await sleep(70 + k * 8); }
            $('#spSym').innerHTML = Sym.symHtml('misir', res.fs.special, 'win'); $('#spNm').innerHTML = `<b class="gold" style="font-size:22px">${esc(Sym.symName('misir', res.fs.special))}</b><br><span class="small muted">Ücretsiz dönüşlerde genişler!</span>`;
            Sound.play('bigwin'); setTimeout(() => { closeModal(); rs(); }, 1600 * G.speed);
          },
        });
      });
      meter('L', `ÖZEL<div class="cellbox" style="--cell:46px;width:46px;height:46px;margin:2px auto 0">${Sym.symHtml('misir', res.fs.special)}</div>`);
      let total = 0, n = 0;
      for (const sp of res.fs.spins) {
        if (!G.open) break; n++; fsBar(`BONUS KAZANÇ ${fmt(Math.round(total))}`); meter('R', `KALAN FREE SPIN<b>${sp.left}</b>`);
        const v = spinVisualAgain(); await sleep(300); await stopReels(v, sp.grid);
        const lw = await showWins(sp.wins, bet);
        if (sp.expand) {
          const rr = $('#reels').getBoundingClientRect();
          for (const c of sp.expand.reels) {
            const top = G.boxes[c * 3].getBoundingClientRect(); const e = document.createElement('div'); e.className = 'expandcol';
            e.style.left = (top.left - rr.left + 6) + 'px'; e.style.width = top.width + 'px'; e.innerHTML = Sym.symHtml('misir', res.fs.special).replace('class="sym', 'style="position:relative;width:100%;height:' + G.cell + 'px" class="sym');
            $('#machine').appendChild(e); Sound.play('orb'); await sleep(250);
          }
          setWin(Math.round(sp.expand.pay * bet), 'GENİŞLEYEN'); Sound.play('bigwin'); await sleep(1500); clearLines();
        }
        total += sp.win * bet; fsBar(`BONUS KAZANÇ ${fmt(Math.round(total))}`);
        if (sp.retrig) await overlayBanner(`+${sp.retrig} DÖNÜŞ!`, '', 1400, '📖');
        await sleep(300);
      }
      fsBar(''); meter('L'); meter('R'); await overlayBanner('BONUS BİTTİ', `Toplam: ${fmt(Math.round(total))} jeton`, 2000, '🏆');
      shown += total;
    }
    return shown;
  };

  // 3) ALTIN ŞANS ve 4) VEGAS MEYVELERİ
  ANIM.gold = async (r, vis, bet) => {
    const res = r.result, b = res.base;
    await stopReels(vis, b.grid);
    await showWins(b.wins, bet);
    if (res.wheel) {
      const pos = []; b.grid.forEach((v, i) => { if (v === 9) pos.push(i); }); dimAll(true); markWin(pos); Sound.play('feature'); await sleep(1100); unmark();
      await overlayBanner('JACKPOT ÇARKI!', '3 BONUS sembolü', 1400, '🎰');
      await wheel(G.meta.info.wheel, res.wheel.idx, bet, '🎰 Jackpot Çarkı');
    }
  };
  ANIM.vegas = async (r, vis, bet) => {
    const res = r.result, b = res.base;
    await stopReels(vis, b.grid);
    await showWins(b.wins, bet);
    if (b.full) { await overlayBanner('EKRAN DOLU!', 'Kazanç x10', 1600, '🍒'); }
    if (res.wheel) {
      const pos = []; b.grid.forEach((v, i) => { if (v === 9) pos.push(i); }); dimAll(true); markWin(pos); Sound.play('feature'); await sleep(1100); unmark();
      await wheel(G.meta.info.wheel, res.wheel.idx, bet, '⭐ Yıldız Çarkı');
    }
  };

  // 5) EJDERHA HAZİNESİ (243 yol)
  function dragonDecor(wm) { return (i, code) => code; }
  function labelWilds(grid, wm) { grid.forEach((v, i) => { if (v === 8 && wm[i] > 1) { const l = G.boxes[i].querySelector('.lbl'); if (l) { l.textContent = 'x' + wm[i]; l.style.color = '#ffd34d'; l.style.fontSize = 'calc(var(--cell)*.26)'; } } }); }
  ANIM.ways = async (r, vis, bet) => {
    const res = r.result, b = res.base;
    if (b) {
      await stopReels(vis, b.grid); labelWilds(b.grid, b.wm);
      if (b.wm.some(m => m > 1)) { b.wm.forEach((m, i) => { if (m > 1) { const c = center(i); UI.burst(c.x, c.y, 12, ['#ff8a3d', '#ffd34d', '#fff']); } }); Sound.play('orb'); await sleep(400); }
      await showWins(b.wins, bet, { noLines: true });
    }
    if (res.fs) {
      if (b) { const pos = []; b.grid.forEach((v, i) => { if (v === 9) pos.push(i); }); dimAll(true); markWin(pos); await sleep(1000); unmark(); }
      await overlayBanner(`${res.fs.count} ÜCRETSİZ DÖNÜŞ!`, 'Her kazançlı dönüşte çarpan +1', 2000, '🐉');
      let total = 0, n = 0;
      for (const sp of res.fs.spins) {
        if (!G.open) break; n++; fsBar(`BONUS KAZANÇ ${fmt(Math.round(total))}`); meter('L', `ÇARPAN<b>x${sp.mult}</b>`); meter('R', `KALAN FREE SPIN<b>${sp.left}</b>`);
        const v = spinVisualAgain(); await sleep(280); await stopReels(v, sp.grid); labelWilds(sp.grid, sp.wm);
        if (sp.wins.length) { await showWins(sp.wins, bet, { noLines: true }); if (sp.mult > 1) { badge('x' + sp.mult, '#ff8a3d'); await sleep(700); } }
        total += sp.win * bet; fsBar(`BONUS KAZANÇ ${fmt(Math.round(total))}`);
        if (sp.retrig) await overlayBanner(`+${sp.retrig} DÖNÜŞ!`, '', 1300, '🔮');
        await sleep(250);
      }
      fsBar(''); meter('L'); meter('R'); await overlayBanner('BONUS BİTTİ', `Toplam: ${fmt(Math.round(total))} jeton`, 2000, '🏆');
    }
  };

  // 6) KORSAN HAZİNESİ (Tut ve Döndür)
  ANIM.pirate = async (r, vis, bet) => {
    const res = r.result, b = res.base; const S = G.meta.info.coinValues[0];
    const coin = (v) => ({ coin: v, text: short(Math.round(v * S * bet)) });
    await stopReels(vis, b.grid, (i, code) => code === 8 ? coin(b.values[i]) : code);
    await showWins(b.wins, bet);
    if (res.hold) {
      const h = res.hold; const vals = h.start.slice();
      dimAll(true); vals.forEach((v, i) => { if (v) markWin([i]); }); Sound.play('feature'); await sleep(1000);
      await overlayBanner('SANDIK ALTINI!', 'Sikkeler kilitlendi · 3 yeniden dönüş', 1800, '🏴‍☠️');
      G.boxes.forEach((bx, i) => { if (!vals[i]) bx.innerHTML = ''; else setCell(i, coin(vals[i]), 'win'); });
      for (const st of h.steps) {
        fsBar(`SANDIK ALTINI`); meter('R', `KALAN DÖNÜŞ<b>${st.left}</b>`);
        G.boxes.forEach((bx, i) => { if (!vals[i]) { bx.innerHTML = Sym.symHtml('korsan', (Math.random() * 7) | 0, 'dim'); } });
        await sleep(450);
        G.boxes.forEach((bx, i) => { if (!vals[i]) bx.innerHTML = ''; });
        for (const [i, v] of st.landed) { vals[i] = v; setCell(i, coin(v), 'win', -G.step, 0); const c = center(i); UI.burst(c.x, c.y, 20, ['#ffd34d', '#fff']); fxs('fx_goldring', c.x, c.y, G.cell * 1.8, .7, { s: 1.3, r1: 0 }); Sound.play('coin'); await sleep(200); }
        meter('R', `KALAN DÖNÜŞ<b>${st.left}</b>`); await sleep(st.landed.length ? 450 : 650);
      }
      fsBar(''); meter('R');
      let sum = 0; for (let i = 0; i < 15; i++) if (vals[i]) { sum += vals[i] * S * bet; G.boxes[i].firstElementChild && G.boxes[i].firstElementChild.classList.add('pop'); setWin(Math.round(sum), 'SANDIK'); Sound.play('coin'); await sleep(110); }
      if (h.grand) await overlayBanner('GRAND JACKPOT!', `+${fmt(Math.round(G.meta.info.grand * bet))}`, 2600, '💰');
      await sleep(500);
      G.boxes.forEach((bx, i) => setCell(i, b.grid[i] === 8 ? coin(b.values[i]) : b.grid[i]));
    }
  };

  /* ---------- ödeme tablosu ---------- */
  function info() {
    const m = G.meta, inf = m.info; const bet = App.bets[G.betIdx];
    const row = (code, txt) => `<div class="li"><div class="cellbox" style="--cell:46px;width:46px;height:46px;flex:none">${Sym.symHtml(G.id, code)}</div><div class="grow"><b>${esc(Sym.symName(G.id, code))}</b><small>${txt}</small></div></div>`;
    let rows = '';
    if (m.family === 'tumble') rows = inf.syms.map(s => row(s.id, `8-9: ${short(s.pay[0] * bet)} · 10-11: ${short(s.pay[1] * bet)} · 12+: ${short(s.pay[2] * bet)}`)).join('') + row(nSyms(), `4: ${short(inf.scPay[4] * bet)} · 5: ${short(inf.scPay[5] * bet)} · 6: ${short(inf.scPay[6] * bet)} + ücretsiz dönüş`);
    else if (m.family === 'ways') rows = inf.syms.filter(s => s.pay).map(s => row(s.id, `yol başına 3: ${short(s.pay[0] * bet)} · 4: ${short(s.pay[1] * bet)} · 5: ${short(s.pay[2] * bet)}`)).join('');
    else rows = inf.syms.filter(s => s.pay && s.pay.some(x => x > 0)).map(s => row(s.id, s.pay.map((p, k) => p > 0 ? `${k}x: ${short(p * bet)}` : '').filter(Boolean).reverse().join(' · '))).join('');
    modal(`<h3 class="gold">${esc(m.name)} — Ödeme Tablosu</h3><p class="small">${RULES[G.id]}</p><p class="small muted">Bahis ${fmt(bet)} için değerler · Teorik RTP %95 · Volatilite: yüksek · Azami kazanç bahsin 5000 katı.</p><div class="list">${rows}</div>`);
  }

  /* Yalnızca SLOT_CONFIG.demo=true iken (tanıtım videosu / görsel test): sunucunun ürettiği örnek bir sonucu oynatır, bakiyeyi değiştirmez. */
  function demoResp(result, bet) { const me = App.me; return { result, win: Math.round(result.win * bet), balance: me.balance + (me.unlimited ? 0 : bet), xp: { xp: me.xp, level: me.level, into: me.xpInto, need: me.xpNeed, max: me.maxLevel, levelUp: null } }; }
  function queueDemo(list) { if (window.SLOT_CONFIG.demo) G.demo.push(...list); }
  addEventListener('resize', () => { if (G.open && !G.spinning) { sizeGrid(); } });
  window.Games = { open, close, isOpen: () => G.open, current: () => (G.open ? G.id : ''), busy: () => G.spinning, queueDemo, spin: () => spin() };
})();
