/* SPINOVA — AVIATOR (sanal jeton).
 * Patlama çarpanı bahis anında SUNUCUDA belirlenir ve hash ile taahhüt edilir; istemci yalnızca uçuşu çizer.
 * TAHSİL ET basıldığında çarpan sunucu saatine göre hesaplanır. Tur sonunda çarpan + tuz açıklanır (doğrulanabilir). */
(function () {
  'use strict';
  const { $, $$, esc, fmt, toast, modal, guard } = UI;
  const A = { open: false, cfg: null, round: null, k: 0.09, skew: 0, raf: 0, state: 'idle', result: null, hist: [], best: null, bet: 1000, auto: null, autoOn: false, stars: [], clouds: [], t0: 0, crashShown: 0 };
  const CHIPS = [100, 500, 1000, 10000, 100000];
  const now = () => Date.now() - A.skew;
  const multAt = (ms) => Math.max(1, Math.floor(Math.exp(A.k * Math.max(0, ms) / 1000) * 100) / 100);

  async function open() {
    stop(); A.open = true; Platform.setCurrent('aviator');
    try { A.bet = +(localStorage.getItem('av_bet') || 1000); A.autoOn = localStorage.getItem('av_auto_on') === '1'; A.auto = +(localStorage.getItem('av_auto') || 2) || 2; } catch (e) { /* */ }
    UI.screen('aviator', `<div class="av">
      <div class="avhead"><button class="enback" id="avBack">◀ Salon</button><img class="enlogo" src="assets/spinova_logo.webp" alt=""><div class="entit"><b>AVIATOR</b><small>Uçak uçtukça çarpan artar · patlamadan tahsil et</small></div><div class="grow"></div>
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
      const d = await Api.get('/api/aviator'); A.cfg = d.config; A.k = d.config.k; A.skew = Date.now() - d.now; A.hist = d.history; A.best = d.best;
      $('#avRtp').textContent = (d.config.rtp * 100).toFixed(0); hist(); stats();
      if (d.active) { A.round = d.active; A.state = 'fly'; waitEnd(); }
      if (!d.config.enabled) toast('Aviator şu anda bakımda.', true);
    } catch (e) { toast(e.message, true); }
    button(); A.raf = requestAnimationFrame(frame);
  }
  function stop() { A.open = false; cancelAnimationFrame(A.raf); }
  function back() { if ($('#overlay').classList.contains('show')) { UI.closeModal(); return true; } if (A.state === 'fly' && A.round && A.round.status === 'flying') toast('Uçuşun sürüyor — sonucu kaybetmezsin: döndüğünde tur kapanmış olur, otomatik tahsil hedefin geçerliyse ödenir.'); stop(); Platform.home(); return true; }
  const stepBet = (d) => { const L = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000]; let i = L.findIndex(x => x >= A.bet); if (i < 0) i = L.length - 1; return L[Math.max(0, Math.min(L.length - 1, i + d))]; };
  function setBet(v) { A.bet = v; localStorage.setItem('av_bet', v); $('#avBetV').textContent = fmt(v); $$('[data-c]').forEach(b => b.classList.toggle('on', +b.dataset.c === v)); button(); }
  function paintBal() { const b = $('#avBal'); if (b && App.me) b.textContent = App.me.unlimited ? '∞' : fmt(App.me.balance); }
  function button() {
    const b0 = $('#avGo'); if (!b0) return; const fly = A.state === 'fly' && A.round, t = fly ? now() - A.round.startAt : 0;
    const b = { set className(v) { this.c = v; }, set innerHTML(v) { this.h = v; } };
    const out = () => { if (b0.className !== b.c) b0.className = b.c; if (A.bh !== b.h) { b0.innerHTML = b.h; A.bh = b.h; } };
    try { return button2(b, fly, t); } finally { out(); }
  }
  function button2(b, fly, t) {
    if (A.busy) { b.className = 'avgo wait'; b.innerHTML = '<b>…</b>'; return; }
    if (!fly) { b.className = 'avgo bet'; b.innerHTML = `<b>BAHİS YAP</b><small>${fmt(A.bet)} jeton${A.autoOn ? ' · oto ' + A.auto.toFixed(2) + 'x' : ''}</small>`; return; }
    if (t < 0) { b.className = 'avgo wait'; b.innerHTML = `<b>KALKIŞ ${Math.ceil(-t / 1000)}</b><small>bahsin alındı</small>`; return; }
    const m = multAt(t); b.className = 'avgo cash'; b.innerHTML = `<b>TAHSİL ET</b><small>${fmt(Math.floor(A.round.bet * m))} jeton</small>`;
  }
  async function go() {
    if (A.busy) return;
    if (A.state === 'fly' && A.round) return cashout();
    A.busy = true; button(); Sound.play('click');
    try {
      const r = await Api.post('/api/aviator/bet', { bet: A.bet, ...(A.autoOn ? { auto: A.auto } : {}) });
      A.skew = Date.now() - r.now; A.k = r.k; A.round = r.round; A.state = 'fly'; A.result = null; App.me.balance = r.balance; Screens.setBalance && Screens.setBalance(r.balance); paintBal();
      $('#avFair').innerHTML = `Tur #${r.round.id} · taahhüt <code>${r.round.hash.slice(0, 16)}…</code>`;
      waitEnd();
    } catch (e) { toast(e.message, true); } finally { A.busy = false; button(); }
  }
  async function cashout() {
    if (A.busy || !A.round) return; if (now() < A.round.startAt) return toast('Uçak henüz kalkmadı.', true);
    A.busy = true; button();
    try { const r = await Api.post(`/api/aviator/${A.round.id}/cashout`, {}); finish(r); } catch (e) { toast(e.message, true); } finally { A.busy = false; button(); }
  }
  /** Tur bitene kadar uzun bekleme (tur başına tek istek) */
  async function waitEnd() {
    const id = A.round && A.round.id; if (!id) return;
    for (let i = 0; i < 12 && A.round && A.round.id === id && A.round.status === 'flying'; i++) {
      try { const r = await Api.get(`/api/aviator/${id}/wait`); if (A.round && A.round.id === id && r.round.status !== 'flying') { finish(r); return; } }
      catch (e) { await new Promise(r => setTimeout(r, 1500)); }
    }
  }
  function finish(r) {
    if (!A.round || A.round.id !== r.round.id || A.round.status !== 'flying') return;
    A.round = r.round; A.state = 'end'; A.result = r.round; A.endAt = performance.now();
    App.me.balance = r.balance; Screens.setBalance && Screens.setBalance(r.balance); paintBal(); Entry.setBal && Entry.setBal();
    A.hist.unshift(r.round.crash); A.hist = A.hist.slice(0, 24); hist();
    const m = $('#avMult');
    if (r.round.status === 'cashed') { Sound.play('bigwin'); UI.coinBurst && UI.coinBurst(12); m.className = 'avmult win'; m.innerHTML = `<b>${r.round.cashMult.toFixed(2)}x</b><small>+${fmt(r.round.win)} jeton · uçak ${r.round.crash.toFixed(2)}x'te uçtu</small>`; }
    else { Sound.play('pop'); Sound.vibrate && Sound.vibrate(60); m.className = 'avmult lost'; m.innerHTML = `<b>UÇTU! ${r.round.crash.toFixed(2)}x</b><small>bu tur kaybedildi</small>`; }
    $('#avFair').innerHTML = `Tur #${r.round.id} · çarpan ${r.round.crash.toFixed(2)}x · tuz <code>${esc(r.round.salt)}</code> · <a href="#" id="avVer">doğrula</a>`;
    $('#avVer').onclick = (e) => { e.preventDefault(); verify(r.round); };
    if (A.best) { A.best.rounds++; if (r.round.cashMult > A.best.mult) A.best.mult = r.round.cashMult; if (r.round.win > A.best.win) A.best.win = r.round.win; stats(); }
    setTimeout(() => { if (A.state === 'end') { A.state = 'idle'; A.round = null; button(); } }, 2200);
    button();
  }
  async function verify(r) {
    let ok = '—'; try { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(r.crash.toFixed(2) + ':' + r.salt)); const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join(''); ok = hex === r.hash ? '✅ Eşleşti: sonuç bahisten ÖNCE belirlenmişti.' : '❌ Eşleşmedi'; } catch (e) { ok = 'Bu cihaz doğrulamayı desteklemiyor.'; }
    modal(`<h3 class="gold">🔐 Tur doğrulama</h3><p class="small">sha256("${r.crash.toFixed(2)}:${esc(r.salt)}")</p><p class="small" style="word-break:break-all">Taahhüt: <code>${esc(r.hash)}</code></p><p class="center"><b>${ok}</b></p>`);
  }
  function hist() { const h = $('#avHist'); if (!h) return; h.innerHTML = A.hist.slice(0, 16).map(x => `<span class="${x >= 10 ? 'hi' : x >= 2 ? 'mid' : 'lo'}">${x.toFixed(2)}x</span>`).join('') || '<span class="lo">Henüz tur yok</span>'; }
  function stats() { const s = $('#avStats'); if (s && A.best) s.innerHTML = `<span>En iyi tahsil <b>${A.best.mult ? A.best.mult.toFixed(2) + 'x' : '—'}</b></span><span>En büyük kazanç <b>${fmt(A.best.win)}</b></span><span>Tur <b>${A.best.rounds}</b></span>`; }
  function help() {
    modal(`<h3 class="gold">✈️ Aviator nasıl oynanır?</h3><div class="small okrules">
      <p><b>1.</b> Bahsini seç ve <b>BAHİS YAP</b>. Uçak kalkar, çarpan 1.00x'ten yükselir.</p>
      <p><b>2.</b> Uçak uçup gitmeden <b>TAHSİL ET</b>'e bas: bahis × o anki çarpan kadar jeton kazanırsın. Uçak senden önce uçarsa bahis kaybedilir.</p>
      <p><b>3. Otomatik tahsil:</b> Hedef çarpanı yaz; uçak o çarpana ulaşırsa sunucu otomatik tahsil eder (bağlantın kopsa bile).</p>
      <p><b>Adil sonuç:</b> Uçağın uçacağı çarpan bahsin anında sunucuda kriptografik rastgele sayıyla belirlenir ve şifreli izi (hash) sana gösterilir. Tur bitince çarpan ve tuz açıklanır, "doğrula" ile kontrol edebilirsin. Oyuncuya özel ayar yoktur; her oyuncu için aynı dağılım geçerlidir (P(≥x) = RTP / x).</p>
      <p>Sanal jetonla oynanır; nakde, paraya ya da ödüle çevrilemez.</p></div>`);
  }

  /* ---------- sahne (canvas) ---------- */
  function sceneInit() {
    A.stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random() * 0.7, r: Math.random() * 1.6 + 0.3, t: Math.random() * 6 }));
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
    const cv = $('#avCv'); if (!cv) return; const c = cv.getContext('2d'), W = cv.width, H = cv.height;
    const fly = A.round && A.state === 'fly', t = fly ? now() - A.round.startAt : -1, m = fly && t > 0 ? multAt(t) : 1;
    const speed = fly && t > 0 ? Math.min(3, 0.4 + Math.log(m) * 0.6) : 0.15;
    // gökyüzü
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05061a'); g.addColorStop(0.55, '#141a4a'); g.addColorStop(1, '#3a1a52'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (const s of A.stars) { c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(ts / 900 + s.t)); c.fillStyle = '#fff'; c.beginPath(); c.arc(s.x * W, s.y * H, s.r, 0, 7); c.fill(); }
    c.globalAlpha = 1;
    // ay
    c.fillStyle = 'rgba(255,240,200,.9)'; c.beginPath(); c.arc(W * 0.86, H * 0.16, 34, 0, 7); c.fill(); c.fillStyle = '#0c1033'; c.beginPath(); c.arc(W * 0.86 + 12, H * 0.16 - 6, 30, 0, 7); c.fill();
    // bulutlar (paralaks)
    for (const k of A.clouds) { k.x -= k.v * speed * 0.016; if (k.x < -0.3) { k.x = 1.2; k.y = 0.12 + Math.random() * 0.5; }
      const x = k.x * W, y = k.y * H, s = k.s * 60; c.fillStyle = `rgba(180,190,255,${0.08 + k.s * 0.06})`; c.beginPath(); c.ellipse(x, y, s * 1.6, s * 0.5, 0, 0, 7); c.ellipse(x + s * 0.8, y - s * 0.3, s, s * 0.45, 0, 0, 7); c.ellipse(x - s * 0.7, y - s * 0.15, s * 0.9, s * 0.4, 0, 0, 7); c.fill(); }
    // pist
    const gy = H - 70; c.fillStyle = '#0c0a1e'; c.fillRect(0, gy, W, 70); c.fillStyle = '#1f1a3a'; c.fillRect(0, gy + 18, W, 34);
    const off = (ts / 8 * speed) % 80; c.fillStyle = '#f2c14e'; for (let x = -off; x < W; x += 80) c.fillRect(x, gy + 33, 40, 4);
    for (let x = (-off * 0.5) % 120; x < W; x += 120) { c.fillStyle = (Math.floor(ts / 400) % 2) ? '#ff4d6d' : '#7fd8ff'; c.beginPath(); c.arc(x, gy + 12, 3, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.08)'; c.font = 'bold 54px sans-serif'; c.fillText('SPINOVA', 40, gy + 60);
    // uçuş eğrisi + uçak
    let px = 140, py = gy - 6, ang = 0;
    if (fly && t > 0) {
      const p = Math.min(1, Math.log(m) / Math.log(20)); px = 140 + p * (W - 420); py = gy - 6 - Math.pow(p, 0.8) * (H * 0.62); ang = -0.35 * Math.min(1, p * 3) + Math.sin(ts / 300) * 0.03;
      const grad = c.createLinearGradient(140, gy, px, py); grad.addColorStop(0, 'rgba(212,32,44,0)'); grad.addColorStop(1, 'rgba(255,80,90,.85)');
      c.strokeStyle = grad; c.lineWidth = 6; c.beginPath(); c.moveTo(140, gy - 6); for (let i = 1; i <= 30; i++) { const q = p * i / 30; c.lineTo(140 + q * (W - 420), gy - 6 - Math.pow(q, 0.8) * (H * 0.62)); } c.stroke();
      c.fillStyle = 'rgba(212,32,44,.12)'; c.lineTo(px, gy); c.lineTo(140, gy); c.fill();
    } else if (A.state === 'end' && A.result && A.result.status === 'lost') {
      const dt = (performance.now() - A.endAt) / 1000; px = W * 0.7 + dt * 900; py = H * 0.25 - dt * 400; ang = -0.5;
    } else if (fly && t <= 0) { px = 140 + Math.sin(ts / 200) * 2; }
    plane(c, px, py, ang, 1.15);
    // çarpan yazısı
    const mm = $('#avMult');
    const set = (cls, html) => { if (A.mc !== cls) { mm.className = cls; A.mc = cls; } if (A.mh !== html) { mm.innerHTML = html; A.mh = html; } }; // yalnızca değişince DOM'a yaz
    if (fly) { set('avmult' + (t < 0 ? ' wait' : ''), t < 0 ? `<b>${Math.ceil(-t / 1000)}</b><small>Kalkışa hazırlanıyor…</small>` : `<b>${m.toFixed(2)}x</b><small>${A.round.auto ? 'oto tahsil ' + A.round.auto.toFixed(2) + 'x' : 'TAHSİL ET ile kazancını al'}</small>`); button(); }
    else if (A.state === 'idle') set('avmult idle', '<b>HAZIR</b><small>Bahsini seç ve uçağı kaldır</small>');
    else { A.mc = mm.className; A.mh = mm.innerHTML; }
  }
  window.Aviator = { open, back, isOpen: () => A.open, close: stop };
})();
