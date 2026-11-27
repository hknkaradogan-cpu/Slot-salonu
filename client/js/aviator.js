/* SPINOVA — AVIVASOR (sanal jeton) · ORTAK TURLAR
 * Turu SUNUCU yönetir: bahis süresi (geri sayım) → kalkış → çarpan yükselir → sunucunun önceden belirlediği noktada patlama.
 * TAHSİL ET yalnızca senin bahsini kapatır; uçak uçmaya ve çarpan yükselmeye devam eder, diğer oyuncular da tahsil edebilir.
 * Patlama anı herkes için aynıdır (uzun bekleme isteği patlama anında döner). İstemci sonucu değiştiremez; yalnızca çizer. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, toast, modal, guard } = UI;
  const A = { open: false, cfg: null, k: 0.09, skew: 0, raf: 0, game: null, my: null, next: null, players: [], hist: [], best: null, bet: 1000, auto: null, autoOn: false, stars: [], clouds: [], gen: 0, boom: null, waiting: 0 };
  const CHIPS = [100, 500, 1000, 10000, 100000];
  const now = () => Date.now() - A.skew;
  const multAt = (ms) => Math.max(1, Math.floor(Math.exp(A.k * Math.max(0, ms) / 1000) * 100) / 100);

  async function open() {
    if (!window.Trans || A.open) return openRaw();
    await Trans.story('aviator', 'king_wave', ['Hoş geldin pilot! Ben Kral, bu gece gökyüzü senin.', 'Uçak kalkınca çarpan yükselir. Uçak uçup gitmeden <b>ÇEK</b>e bas, jetonların çarpanla katlansın!', 'Her turun sonucu önceden şifrelenir; tur bitince doğrulayabilirsin. Sadece sanal jeton — iyi uçuşlar!']);
    return Trans.run('night', openRaw);
  }
  async function openRaw() {
    Sound.theme('aviator'); Sound.startMusic();
    stop(); A.open = true; Platform.setCurrent('aviator');
    try { A.bet = +(localStorage.getItem('av_bet') || 1000); A.autoOn = localStorage.getItem('av_auto_on') === '1'; A.auto = +(localStorage.getItem('av_auto') || 2) || 2; } catch (e) { /* */ }
    UI.screen('aviator', `<div class="av">
      <div class="avhead"><button class="enback" id="avBack">◀ Salon</button><img class="enlogo" src="assets/spinova_logo.webp" alt=""><div class="entit"><b>AVIVASOR</b><small>Uçak uçtukça çarpan artar · patlamadan tahsil et</small></div><div class="grow"></div>
        <button class="avinfo" id="avHelp">ⓘ Nasıl oynanır</button><div class="encoin" id="avShop"><i class="hcoin"></i><b id="avBal"></b><span class="hplus">+</span></div></div>
      <div class="avsky"><canvas id="avCv" width="1380" height="792"></canvas>
        <div class="avhist" id="avHist"></div>
        <div class="avmult" id="avMult"><b>1.00x</b><small></small></div>
        <div class="avfair" id="avFair"></div></div>
      <div class="avpanel">
        <div class="avbetlbl">Bahis miktarı</div>
        <div class="avbet"><button class="gb" id="avMinus">−</button><b id="avBetV"></b><button class="gb" id="avPlus">+</button></div>
        <div class="avchips">${CHIPS.map(c => `<button data-c="${c}">${c >= 1000 ? c / 1000 + 'B' : c}</button>`).join('')}</div>
        <label class="avauto"><input type="checkbox" id="avAutoOn"><span>Otomatik tahsil</span><input id="avAuto" type="number" min="1.01" step="0.01"><em>x</em></label>
        <button class="avgo" id="avGo"></button>
        <div class="avstats" id="avStats"></div>
        <div class="avplh">Bu turdaki oyuncular <b id="avPlN">0</b></div><div class="avpl" id="avPl"></div>
        <p class="avnote">Sanal jeton · nakde çevrilemez · RTP %<span id="avRtp">—</span></p>
      </div></div>`, 'avscreen');
    UI.show('aviator');
    $('#avBack').onclick = back; $('#avShop').onclick = () => { stop(); Platform.panel('shop'); }; $('#avHelp').onclick = help;
    $('#avMinus').onclick = () => setBet(stepBet(-1)); $('#avPlus').onclick = () => setBet(stepBet(1));
    $$('[data-c]').forEach(b => b.onclick = () => setBet(+b.dataset.c));
    $('#avAutoOn').checked = A.autoOn; $('#avAuto').value = A.auto.toFixed(2);
    $('#avAutoOn').onchange = (e) => { A.autoOn = e.target.checked; localStorage.setItem('av_auto_on', A.autoOn ? '1' : '0'); };
    $('#avAuto').onchange = (e) => { const v = Math.max(1.01, Math.min(1000, +e.target.value || 2)); A.auto = Math.floor(v * 100) / 100; e.target.value = A.auto.toFixed(2); localStorage.setItem('av_auto', A.auto); };
    $('#avGo').onclick = go;
    sceneInit(); paintBal(); setBet(A.bet); button();
    try {
      const d = await Api.get('/api/aviator'); A.cfg = d.config; A.k = d.config.k; A.best = d.best;
      $('#avRtp').textContent = (d.config.rtp * 100).toFixed(0); applyState(d); stats();
      if (!d.config.enabled) toast('Avivasor şu anda bakımda.', true);
    } catch (e) { toast(e.message, true); }
    button(); A.raf = requestAnimationFrame(frame); syncLoop(++A.gen);
  }
  function stop() { A.cvS = 0; Sound.theme('hall'); Sound.loopStop('engine'); A.open = false; A.gen++; cancelAnimationFrame(A.raf); }
  function back() { if ($('#overlay').classList.contains('show')) { UI.closeModal(); return true; } if (A.my && A.my.status === 'flying') toast('Bahsin uçuşta — sonucu kaybetmezsin: tur sunucuda sürer, otomatik tahsil hedefin geçerliyse ödenir.'); stop(); Platform.home(); return true; }
  const stepBet = (d) => { const L = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000]; let i = L.findIndex(x => x >= A.bet); if (i < 0) i = L.length - 1; return L[Math.max(0, Math.min(L.length - 1, i + d))]; };
  function setBet(v) { A.bet = v; localStorage.setItem('av_bet', v); $('#avBetV').textContent = fmt(v); $$('[data-c]').forEach(b => b.classList.toggle('on', +b.dataset.c === v)); button(); }
  function paintBal() { const b = $('#avBal'); if (b && App.me) b.textContent = App.me.unlimited ? '∞' : fmt(App.me.balance); }
  /* ---------- tur durumu (sunucu) ---------- */
  const phaseOf = (g) => { if (!g) return 'none'; if (g.crash != null && g.phase === 'crashed') return 'crashed'; const t = now(); return t < g.startAt ? 'betting' : 'flying'; };
  function applyState(d) {
    A.skew = Date.now() - d.now; A.k = d.k || A.k;
    const prev = A.game;
    // patlamış turu ekranda tutarken yeni turu hemen alma (patlama gösterisi bitsin)
    if (!(prev && A.boom && d.game.id !== prev.id && performance.now() - A.boom.at < 1400)) A.game = d.game;
    A.players = d.players || []; A.hist = d.history || A.hist; hist(); players();
    const mine = d.mine || [];
    A.my = mine.find(x => x.game === A.game.id) || (A.my && A.my.game === A.game.id ? A.my : null);
    A.next = mine.find(x => x.game === A.game.id + 1) || null;
    if (d.balance != null && App.me) { App.me.balance = d.balance; Screens.setBalance && Screens.setBalance(d.balance); paintBal(); }
    $('#avFair').innerHTML = A.game.crash != null ? fairDone(A.game) : `Tur #${A.game.id} · taahhüt <code>${esc(A.game.hash.slice(0, 16))}…</code>`;
    if (A.game.crash != null) bindVerify(A.game);
    if (d.game.phase === 'crashed' && prev && prev.id === d.game.id && prev.crash == null && !A.boom) { crashNow({ game: d.game, mine: mine.find(x => x.game === d.game.id) || null, now: d.now, balance: d.balance }); return; }
    if (phaseOf(A.game) === 'flying' && (!prev || prev.id !== A.game.id || phaseOf(prev) === 'betting') && !A.boom) { Sound.loopStart('engine'); }
    button();
  }
  const fairDone = (g) => `Tur #${g.id} · çarpan ${g.crash.toFixed(2)}x · tuz <code>${esc(g.salt)}</code> · <a href="#" id="avVer">doğrula</a>`;
  function bindVerify(g) { const v = $('#avVer'); if (v) v.onclick = (e) => { e.preventDefault(); verify(g); }; }
  /** Senkron döngüsü: bahis süresinde kalkışa, uçuşta patlamaya kadar bekler; oyuncu listesini tazeler */
  async function syncLoop(gen) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    while (A.open && gen === A.gen) {
      const g = A.game; if (!g) { await sleep(1000); await refresh(); continue; }
      const ph = phaseOf(g);
      if (ph === 'betting') { const left = g.startAt - now(); await sleep(Math.max(60, Math.min(1500, left + 40))); if (gen !== A.gen) return; if (now() >= g.startAt) takeoff(); else refresh(); continue; }
      if (ph === 'flying') {
        if (A.waiting !== g.id) { A.waiting = g.id; waitCrash(g.id, gen); }
        await sleep(1500); if (gen !== A.gen) return; if (phaseOf(A.game) === 'flying') refresh(); continue;
      }
      // patladı: ara bitince yeni tura geç
      const wait = (A.cfg ? A.cfg.endMs : 3000) - (now() - (g.crashAt || now()));
      await sleep(Math.max(300, Math.min(4000, wait + 80))); if (gen !== A.gen) return; await refresh();
    }
  }
  async function refresh() { try { const d = await Api.get('/api/aviator/state'); if (A.open) applyState(d); } catch (e) { /* ağ: bir sonraki turda tekrar */ } }
  function takeoff() { Sound.play('takeoff'); Sound.loopStart('engine'); A.boom = null; A.trail = []; button(); }
  /** Uzun bekleme: sunucu patlama anında döner → herkes patlamayı aynı anda görür */
  async function waitCrash(id, gen) {
    for (let i = 0; i < 60 && A.open && gen === A.gen; i++) {
      try {
        const r = await Api.get(`/api/aviator/game/${id}/wait`);
        if (!A.open || gen !== A.gen || !A.game || A.game.id !== id) return;
        if (r.game.phase === 'crashed') { crashNow(r); return; }
      } catch (e) { await new Promise(r => setTimeout(r, 1200)); }
    }
  }
  function crashNow(r) {
    A.skew = Date.now() - r.now;
    A.game = { ...A.game, ...r.game };
    const was = A.my; if (r.mine) A.my = r.mine;
    Sound.loopStop('engine'); Sound.play('crash'); Sound.vibrate && Sound.vibrate(was && was.status === 'flying' ? 80 : 30);
    A.boom = { at: performance.now(), x: A.px, y: A.py };
    A.hist.unshift(r.game.crash); A.hist = A.hist.slice(0, 24); hist();
    if (r.balance != null && App.me) { App.me.balance = r.balance; Screens.setBalance && Screens.setBalance(r.balance); paintBal(); Entry.setBal && Entry.setBal(); }
    if (A.my && A.my.status === 'cashed' && was && was.status === 'flying') { Sound.play('cashout'); UI.coinBurst && UI.coinBurst(12); } // otomatik tahsil patlamadan önce ödendi
    if (A.my && A.best) { A.best.rounds++; if ((A.my.cashMult || 0) > A.best.mult) A.best.mult = A.my.cashMult; if (A.my.win > A.best.win) A.best.win = A.my.win; stats(); }
    $('#avFair').innerHTML = fairDone(A.game); bindVerify(A.game);
    button(); refresh();
  }

  /* ---------- düğme ---------- */
  function button() {
    const b0 = $('#avGo'); if (!b0) return;
    const b = { c: '', h: '' }; button2(b);
    if (b0.className !== b.c) b0.className = b.c; if (A.bh !== b.h) { b0.innerHTML = b.h; A.bh = b.h; }
  }
  function button2(b) {
    const g = A.game, ph = phaseOf(g), t = g ? now() - g.startAt : 0;
    if (A.busy) { b.c = 'avgo wait'; b.h = '<b>…</b>'; return; }
    if (ph === 'betting' && A.my) { b.c = 'avgo cancel'; b.h = `<b>İPTAL</b><small>bahsin alındı · kalkış ${Math.max(0, Math.ceil(-t / 1000))} sn</small>`; return; }
    if (ph === 'flying' && A.my && A.my.status === 'flying') {
      const m = multAt(t);
      if (A.my.auto && m >= A.my.auto) { b.c = 'avgo done'; b.h = `<b>${A.my.auto.toFixed(2)}x</b><small>otomatik tahsil ediliyor…</small>`; return; }
      b.c = 'avgo cash'; b.h = `<b>TAHSİL ET</b><small>${fmt(Math.floor(A.my.bet * m))} jeton</small>`; return;
    }
    if (A.next) { b.c = 'avgo cancel'; b.h = `<b>İPTAL</b><small>sonraki tura bahsin alındı · ${fmt(A.next.bet)}</small>`; return; }
    const lbl = ph === 'betting' ? 'BAHİS YAP' : 'BAHİS YAP'; const sub = ph === 'betting' ? `${fmt(A.bet)} jeton${A.autoOn ? ' · oto ' + A.auto.toFixed(2) + 'x' : ''}` : `sonraki tur · ${fmt(A.bet)} jeton`;
    b.c = 'avgo bet' + (A.my && A.my.status === 'cashed' && ph === 'flying' ? ' after' : ''); b.h = `<b>${lbl}</b><small>${sub}</small>`;
  }
  async function go() {
    if (A.busy || !A.game) return;
    const ph = phaseOf(A.game);
    if (ph === 'flying' && A.my && A.my.status === 'flying') return cashout();
    if (ph === 'betting' && A.my) return cancel(A.my);
    if (A.next) return cancel(A.next);
    A.busy = true; button(); Sound.play('click');
    try {
      const r = await Api.post('/api/aviator/bet', { bet: A.bet, ...(A.autoOn ? { auto: A.auto } : {}) });
      A.skew = Date.now() - r.now; App.me.balance = r.balance; Screens.setBalance && Screens.setBalance(r.balance); paintBal();
      if (r.round.game === A.game.id) A.my = r.round; else A.next = r.round;
      Sound.play('coin');
    } catch (e) { toast(e.message, true); } finally { A.busy = false; button(); }
  }
  async function cancel(row) {
    A.busy = true; button();
    try { const r = await Api.post(`/api/aviator/${row.id}/cancel`, {}); App.me.balance = r.balance; Screens.setBalance && Screens.setBalance(r.balance); paintBal(); if (A.my === row) A.my = null; if (A.next === row) A.next = null; toast('Bahsin geri alındı, jetonun iade edildi.'); }
    catch (e) { toast(e.message, true); refresh(); } finally { A.busy = false; button(); }
  }
  async function cashout() {
    if (A.busy || !A.my) return;
    A.busy = true; button();
    try {
      const r = await Api.post(`/api/aviator/${A.my.id}/cashout`, {});
      A.my = r.round; App.me.balance = r.balance; Screens.setBalance && Screens.setBalance(r.balance); paintBal(); Entry.setBal && Entry.setBal();
      if (r.round.status === 'cashed') { Sound.play('cashout'); UI.coinBurst && UI.coinBurst(12); A.cashFx = { at: performance.now(), m: r.round.cashMult, win: r.round.win }; }
      // UÇAK DURMAZ: tur sürüyor, çarpan yükselmeye devam eder; patlama anı sunucudan gelir
    } catch (e) { toast(e.message, true); } finally { A.busy = false; button(); }
  }
  function players() {
    const el = $('#avPl'); if (!el) return;
    const L = A.players || [];
    const html = L.length ? L.map(p => `<div class="avp ${p.status}"><span class="avpa">${UI.AVATARS[p.avatar] || UI.AVATARS[0]}</span><b>${esc(p.name)}</b><em>${fmt(p.bet)}</em><i>${p.status === 'cashed' ? p.cashMult.toFixed(2) + 'x · +' + fmt(p.win) : p.status === 'lost' ? '—' : ''}</i></div>`).join('') : '<p class="avpe">Bu turda henüz bahis yok</p>';
    if (A.plh !== html) { el.innerHTML = html; A.plh = html; }
    const n = $('#avPlN'); if (n) n.textContent = L.length;
  }
  async function verify(r) {
    let ok = '—'; try { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.crash.toFixed(2) + ':' + r.salt)); const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); ok = hex === r.hash ? '✅ Eşleşti: sonuç bahisten ÖNCE belirlenmişti.' : '❌ Eşleşmedi'; } catch (e) { ok = 'Bu cihaz doğrulamayı desteklemiyor.'; }
    modal(`<h3 class="gold">🔐 Tur doğrulama</h3><p class="small">sha256("${r.crash.toFixed(2)}:${esc(r.salt)}")</p><p class="small" style="word-break:break-all">Taahhüt: <code>${esc(r.hash)}</code></p><p class="center"><b>${ok}</b></p>`);
  }
  function hist() { const h = $('#avHist'); if (!h) return; h.innerHTML = A.hist.slice(0, 16).map(x => `<span class="${x >= 10 ? 'hi' : x >= 2 ? 'mid' : 'lo'}">${x.toFixed(2)}x</span>`).join('') || '<span class="lo">Henüz tur yok</span>'; }
  function stats() { const s = $('#avStats'); if (s && A.best) s.innerHTML = `<span>En iyi tahsil <b>${A.best.mult ? A.best.mult.toFixed(2) + 'x' : '—'}</b></span><span>En büyük kazanç <b>${fmt(A.best.win)}</b></span><span>Tur <b>${A.best.rounds}</b></span>`; }
  function help() {
    modal(`<h3 class="gold">✈️ Avivasor nasıl oynanır?</h3><div class="small okrules">
      <p><b>1.</b> Bahsini seç ve <b>BAHİS YAP</b>. Uçak kalkar, çarpan 1.00x'ten yükselir.</p>
      <p><b>2.</b> Uçak uçup gitmeden <b>TAHSİL ET</b>'e bas: bahis × o anki çarpan kadar jeton kazanırsın. Uçak senden önce uçarsa bahis kaybedilir.</p>
      <p><b>3. Otomatik tahsil:</b> Hedef çarpanı yaz; uçak o çarpana ulaşırsa sunucu otomatik tahsil eder (bağlantın kopsa bile).</p>
      <p><b>Adil sonuç:</b> Uçağın uçacağı çarpan bahsin anında sunucuda kriptografik rastgele sayıyla belirlenir ve şifreli izi (hash) sana gösterilir. Tur bitince çarpan ve tuz açıklanır, "doğrula" ile kontrol edebilirsin. Oyuncuya özel ayar yoktur; her oyuncu için aynı dağılım geçerlidir (P(≥x) = RTP / x).</p>
      <p>Sanal jetonla oynanır; nakde, paraya ya da ödüle çevrilemez.</p></div>`);
  }

  /* ---------- sahne (canvas) ---------- */
  function sceneInit() {
    A.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.6 + 0.3, t: Math.random() * 6 }));
    // şehir silueti (ışıklı pencereler) — kanvasın içinde, uçağın arkasında
    { let x = 0; A.city = []; while (x < 1400) { const w = 30 + Math.random() * 60, h = 50 + Math.random() * 190; const win = []; for (let k = 0; k < h * w / 260; k++) win.push([Math.random() * (w - 8) + 4, Math.random() * (h - 10) + 6, Math.random() < 0.7]); A.city.push({ x, w, h, win, ph: Math.random() * 6 }); x += w + 4 + Math.random() * 10; } }
    A.clouds = Array.from({ length: 7 }, (_, i) => ({ x: Math.random(), y: 0.15 + Math.random() * 0.5, s: 0.6 + Math.random() * 0.9, v: 0.02 + Math.random() * 0.04, i }));
  }
  function plane(c, x, y, ang, sc) {
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc, sc);
    // gövde (özgün SPINOVA tasarımı): kırmızı gövde, altın şerit, beyaz kokpit
    c.fillStyle = '#d4202c'; c.beginPath(); c.moveTo(-70, -6); c.quadraticCurveTo(-20, -18, 40, -12); c.quadraticCurveTo(70, -8, 78, 0); c.quadraticCurveTo(70, 8, 40, 11); c.lineTo(-62, 9); c.closePath(); c.fill();
    c.fillStyle = '#f2c14e'; c.fillRect(-55, -2, 105, 4);
    c.fillStyle = '#9fe0ff'; c.beginPath(); c.ellipse(28, -10, 15, 6, -0.15, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#a3121c'; c.beginPath(); c.moveTo(-10, 4); c.lineTo(18, 4); c.lineTo(-12, 38); c.lineTo(-30, 38); c.closePath(); c.fill(); // kanat
    c.beginPath(); c.moveTo(-10, -6); c.lineTo(14, -6); c.lineTo(-16, -30); c.lineTo(-30, -30); c.closePath(); c.fill();
    c.fillStyle = '#d4202c'; c.beginPath(); c.moveTo(-58, -6); c.lineTo(-74, -34); c.lineTo(-62, -34); c.lineTo(-44, -8); c.closePath(); c.fill(); // kuyruk
    c.fillStyle = '#f2c14e'; c.font = 'bold 9px sans-serif'; c.fillText('S', -64, -18);
    // pervane
    c.fillStyle = 'rgba(255,255,255,.5)'; const pr = (performance.now() / 30) % 2; c.fillRect(78, -18 + pr * 2, 3, 36 - pr * 4);
    c.restore();
  }
  function frame(ts) {
    if (!A.open) return; A.raf = requestAnimationFrame(frame);
    // Düşük donanım: ortalama kare süresi 28 ms'yi aşarsa sahne 30 kare/sn çizilir (oyun mantığı sunucu saatine bağlı, etkilenmez)
    const fdt = ts - (A.lastTs || ts); A.lastTs = ts; A.favg = (A.favg || 16.7) * 0.95 + Math.min(100, fdt) * 0.05;
    if (A.favg > 28 || document.body.classList.contains('lowfx')) { A.skipF = !A.skipF; if (A.skipF) return; }
    if (document.hidden) return;
    const cv = $('#avCv'); if (!cv) return; const c = cv.getContext('2d'), W = 1380, H = 792;
    // performans: tuval çözünürlüğü ekrana göre (en çok 1,5 kat); çizim koordinatları sabit 1380×792
    if (!A.cvS) { const r = cv.getBoundingClientRect(); A.cvS = Math.min(1, Math.max(0.5, (r.width * Math.min(1.5, devicePixelRatio || 1)) / 1380)); cv.width = Math.round(1380 * A.cvS); cv.height = Math.round(792 * A.cvS); }
    c.setTransform(A.cvS, 0, 0, A.cvS, 0, 0);
    const fly = A.game && phaseOf(A.game) === 'flying', t = fly ? now() - A.game.startAt : -1, m = fly && t > 0 ? multAt(t) : 1;
    const speed = fly && t > 0 ? Math.min(3, 0.4 + Math.log(m) * 0.6) : 0.15;
    // gökyüzü: SPINOVA moru + yavaş dönen ışık huzmeleri (huzmeler bir kez ayrı tuvale çizilir, her karede tek resim döndürülür)
    const g = c.createRadialGradient(140, H - 40, 40, 140, H - 40, W * 1.1); g.addColorStop(0, '#3a1660'); g.addColorStop(0.45, '#1c0b3a'); g.addColorStop(1, '#0b0620'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (!A.rayCv) { A.rayCv = document.createElement('canvas'); A.rayCv.width = A.rayCv.height = 1800; const rc = A.rayCv.getContext('2d'); rc.translate(900, 900);
      for (let i = 0; i < 18; i++) { rc.rotate(Math.PI * 2 / 18); const rg = rc.createLinearGradient(0, 0, 900, 0); rg.addColorStop(0, 'rgba(160,110,255,.16)'); rg.addColorStop(1, 'rgba(160,110,255,0)'); rc.fillStyle = rg; rc.beginPath(); rc.moveTo(0, 0); rc.lineTo(900, -95); rc.lineTo(900, 95); rc.closePath(); rc.fill(); } }
    c.save(); c.translate(140, H - 40); c.rotate((ts / 1000) * (0.04 + speed * 0.05)); c.drawImage(A.rayCv, -900, -900); c.restore();
    for (const s of A.stars) { c.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(ts / 900 + s.t)); c.fillStyle = '#fff'; c.fillRect(s.x * W, s.y * H, s.r * 1.4, s.r * 1.4); }
    c.globalAlpha = 1;
    // eksenler: zemin ve sol kenar çizgisi, kayan noktalar (hız hissi)
    const gy = H - 40; c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(140, gy, W - 140, 2); c.fillRect(138, 40, 2, gy - 40);
    const off = (ts / 6 * speed) % 120; c.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 140 + 120 - off; x < W; x += 120) c.fillRect(x, gy + 10, 4, 4);
    const offy = (ts / 10 * speed) % 90; for (let y = gy - 90 + offy; y > 50; y -= 90) c.fillRect(124, y, 4, 4);
    c.fillStyle = 'rgba(255,255,255,.06)'; c.font = 'bold 54px sans-serif'; c.fillText('SPINOVA', W - 330, gy - 20);
    // uçuş eğrisi + uçak (tur sunucuda sürer: senin tahsilin uçağı durdurmaz)
    const G = A.game, ph = phaseOf(G), tt = G ? now() - G.startAt : -1;
    const crashM = G && G.crash != null ? G.crash : null;
    const mNow = ph === 'flying' ? multAt(tt) : crashM || 1;
    let px = 140, py = gy - 6, ang = 0;
    const pathAt = (mm) => { const p = Math.min(1, Math.log(mm) / Math.log(20)); return [140 + p * (W - 420), gy - 6 - Math.pow(p, 0.8) * (H * 0.62), p]; };
    if (ph === 'flying' || (ph === 'crashed' && crashM)) {
      const [x1, y1, p] = pathAt(mNow); px = x1; py = y1; ang = -0.35 * Math.min(1, p * 3) + Math.sin(ts / 300) * 0.03;
      const grad = c.createLinearGradient(140, gy, px, py); grad.addColorStop(0, 'rgba(212,32,44,0)'); grad.addColorStop(1, 'rgba(255,80,90,.85)');
      c.beginPath(); c.moveTo(140, gy - 6); for (let i = 1; i <= 30; i++) { const q = p * i / 30; c.lineTo(140 + q * (W - 420), gy - 6 - Math.pow(q, 0.8) * (H * 0.62)); }
      const fg = c.createLinearGradient(0, py, 0, gy); fg.addColorStop(0, 'rgba(230,30,70,.55)'); fg.addColorStop(1, 'rgba(230,30,70,.05)');
      c.save(); c.lineTo(px, gy); c.lineTo(140, gy); c.closePath(); c.fillStyle = fg; c.fill(); c.restore();
      c.beginPath(); c.moveTo(140, gy - 6); for (let i = 1; i <= 30; i++) { const q = p * i / 30; c.lineTo(140 + q * (W - 420), gy - 6 - Math.pow(q, 0.8) * (H * 0.62)); }
      c.strokeStyle = 'rgba(255,60,100,.35)'; c.lineWidth = 16; c.stroke(); c.strokeStyle = '#ff2f5e'; c.lineWidth = 6; c.stroke();
      // motor dumanı
      if (ph === 'flying') { (A.trail = A.trail || []).push({ x: px - 70, y: py + 4, a: 0.5, r: 4 }); if (A.trail.length > 40) A.trail.shift(); }
      // tahsil ettiğin nokta eğri üzerinde işaretlenir; uçak uçmaya devam eder
      if (A.my && A.my.status === 'cashed' && A.my.cashMult && A.my.game === G.id) { const [cx, cy] = pathAt(A.my.cashMult); c.fillStyle = '#7dff6b'; c.beginPath(); c.arc(cx, cy, 9, 0, 7); c.fill(); c.font = 'bold 22px sans-serif'; c.fillText(A.my.cashMult.toFixed(2) + 'x', cx - 24, cy - 16); }
    } else if (ph === 'betting') { px = 140 + Math.sin(ts / 200) * 1.5; }
    for (const p of A.trail || []) { p.a *= 0.96; p.r += 0.6; c.fillStyle = `rgba(220,220,255,${p.a * 0.35})`; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill(); }
    A.px = px; A.py = py;
    if (A.boom) {
      // patlama: parlama halkası + kıvılcımlar, ardından uçak hızla uzaklaşır
      const e = (performance.now() - A.boom.at) / 1000;
      if (e < 0.9) {
        const r = 30 + e * 420; const rg = c.createRadialGradient(px, py, 0, px, py, r); rg.addColorStop(0, `rgba(255,250,210,${0.95 - e})`); rg.addColorStop(0.4, `rgba(255,140,40,${0.7 - e * 0.7})`); rg.addColorStop(1, 'rgba(255,40,0,0)');
        c.fillStyle = rg; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill();
        if (!A.boom.p) A.boom.p = Array.from({ length: 46 }, () => { const an = Math.random() * 6.283, sp = 200 + Math.random() * 600; return [Math.cos(an) * sp, Math.sin(an) * sp]; });
        c.fillStyle = `rgba(255,${180 + Math.random() * 60 | 0},80,${1 - e})`; for (const [vx, vy] of A.boom.p) { c.fillRect(px + vx * e, py + vy * e + 300 * e * e, 5, 5); }
      }
      const fx = px + Math.pow(e, 2) * 2400, fy = py - Math.pow(e, 2) * 900; if (fx < W + 200) plane(c, fx, fy, -0.45, 1.15);
    } else plane(c, px, py, ang, 1.15);
    if (A.cashFx) { const e = (performance.now() - A.cashFx.at) / 1000; if (e > 2.2) A.cashFx = null; else {
      const al = Math.min(1, e * 4, (2.2 - e) * 2), y = H * 0.62 - e * 30; c.globalAlpha = al; c.fillStyle = 'rgba(20,70,30,.85)'; c.strokeStyle = '#7dff6b'; c.lineWidth = 3;
      const bw = 580, bx = W / 2 - bw / 2 - 100; c.beginPath(); c.roundRect ? c.roundRect(bx, y - 44, bw, 70, 18) : c.rect(bx, y - 44, bw, 70); c.fill(); c.stroke();
      c.fillStyle = '#d8ffd0'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText(`TAHSİL EDİLDİ · ${A.cashFx.m.toFixed(2)}x · +${fmt(A.cashFx.win)}`, bx + bw / 2, y + 2); c.textAlign = 'left'; c.globalAlpha = 1; } }
    // çarpan yazısı
    const mm = $('#avMult');
    const set = (cls, html) => { if (A.mc !== cls) { mm.className = cls; A.mc = cls; } if (A.mh !== html) { mm.innerHTML = html; A.mh = html; } }; // yalnızca değişince DOM'a yaz
    const mine = A.my && A.game && A.my.game === A.game.id ? A.my : null;
    if (ph === 'betting') { const l = Math.max(0, G.startAt - now()), tot = (A.cfg && A.cfg.betMs) || 6000; set('avmult wait', `<b>${Math.ceil(l / 1000)}</b><small>${mine ? 'Bahsin alındı — kalkışa hazırlanıyor' : 'Yeni tur — bahsini yap'}</small><span class="avcd"><i style="width:${(100 * l / tot).toFixed(1)}%"></i></span>`); }
    else if (ph === 'flying') {
      Sound.loopSet('engine', mNow);
      const sub = mine && mine.status === 'cashed' ? `<small class="ok">✔ ${mine.cashMult.toFixed(2)}x'te tahsil ettin · +${fmt(mine.win)} jeton — uçak uçmaya devam ediyor</small>` : mine ? `<small>${mine.auto ? 'oto tahsil ' + mine.auto.toFixed(2) + 'x · ' : ''}TAHSİL ET ile kazancını al</small>` : '<small>Bu turda bahsin yok · sıradaki tura bahis yapabilirsin</small>';
      set('avmult' + (mine && mine.status === 'cashed' ? ' won' : ''), `<b>${mNow.toFixed(2)}x</b>${sub}`);
    } else if (ph === 'crashed' && crashM) {
      const res = mine ? (mine.status === 'cashed' ? `<small class="ok">${mine.cashMult.toFixed(2)}x'te tahsil ettin · +${fmt(mine.win)} jeton</small>` : '<small>bu tur kaybedildi</small>') : '<small>sonraki tur birazdan</small>';
      set('avmult lost', `<b>UÇTU! ${crashM.toFixed(2)}x</b>${res}`);
    } else set('avmult idle', '<b>HAZIR</b><small>Tur bilgisi alınıyor…</small>');
    if ((A.fr = (A.fr || 0) + 1) % 6 === 0) button();
  }
  window.Aviator = { open, back, isOpen: () => A.open, close: stop };
})();
