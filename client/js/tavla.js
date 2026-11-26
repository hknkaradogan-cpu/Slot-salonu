/* SPINOVA — TAVLA oyun ekranı (yatay, 960×440 sahnede).
 * Zarları ve hamle doğrulamasını SUNUCU yapar; istemci aynı kural dosyasıyla (tavla-rules.js) yalnızca geçerli hedefleri gösterir.
 * Hamle: pula dokun → parlayan hedefe dokun (ya da sürükle). Tüm zarlar oynanınca ONAYLA. Geri Al ile o turdaki hamleler geri alınır. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, toast, modal, closeModal, guard, AVATARS } = UI;
  const TR = window.TavlaRules;
  const T = { open: false, id: null, v: null, seq: -1, timer: null, tim: null, part: [], pboard: null, sel: null, acting: false, fail: 0, shownGame: 0, shownFinal: false, skew: 0 };

  /* ---------- tahta çizimi (giriş ekranı ve oyun ortak) ---------- */
  // Görünüm: izleyenin evi sağ altta. Üst sıra soldan sağa 13..24, alt sıra soldan sağa 12..1 (göreli).
  const TOP = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], BOT = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  function boardHtml(b, o = {}) {
    const me = o.me || 0, col = (p) => (p === 0 ? 'w' : 'k');
    const pt = (r, top, i) => {
      const c = TR.own(b, me, r), n = Math.abs(c), who = c > 0 ? col(me) : col(1 - me);
      const cls = ['tvpt', top ? 'top' : 'bot', (i % 2) ? 'b' : 'a', o.hl && o.hl.has(r) ? 'tgt' : '', o.sel === r ? 'sel' : '', o.last && o.last.has(r) ? 'last' : ''].join(' ');
      let ch = ''; const show = Math.min(n, 5);
      for (let k = 0; k < show; k++) ch += `<i class="ck ${who}">${k === show - 1 && n > 5 ? n : ''}</i>`;
      return `<div class="${cls}" data-r="${r}"><span class="tri"></span><span class="stack">${ch}</span><em>${r}</em></div>`;
    };
    const barC = (p) => { const n = b.bar[p]; let ch = ''; for (let k = 0; k < Math.min(n, 4); k++) ch += `<i class="ck ${col(p)}">${k === Math.min(n, 4) - 1 && n > 4 ? n : ''}</i>`; return ch; };
    const offC = (p) => `<span class="offn">${b.off[p]}</span>${(`<i class="ckoff ${col(p)}"></i>`).repeat(Math.min(15, b.off[p]))}`;
    return `<div class="tvboard ${o.small ? 'small' : ''}"><div class="tvframe">
      <div class="tvhalf tl">${TOP.slice(0, 6).map((r, i) => pt(r, true, i)).join('')}</div>
      <div class="tvbar top" data-bar="opp">${barC(1 - me)}</div>
      <div class="tvhalf tr">${TOP.slice(6).map((r, i) => pt(r, true, i)).join('')}</div>
      <div class="tvtray top">${offC(1 - me)}</div>
      <div class="tvhalf bl">${BOT.slice(0, 6).map((r, i) => pt(r, false, i + 1)).join('')}</div>
      <div class="tvbar bot ${o.sel === 25 ? 'sel' : ''}" data-r="25">${barC(me)}</div>
      <div class="tvhalf br">${BOT.slice(6).map((r, i) => pt(r, false, i + 1)).join('')}</div>
      <div class="tvtray bot ${o.hl && o.hl.has(0) ? 'tgt' : ''}" data-r="0">${offC(me)}</div>
      <span class="tvbrand">SPINOVA</span><span class="tvsig">By-Hkn</span></div></div>`;
  }
  const pip = ['', '<b></b>', '<b></b><b></b>', '<b></b><b></b><b></b>', '<b></b><b></b><b></b><b></b>', '<b></b><b></b><b></b><b></b><b></b>', '<b></b><b></b><b></b><b></b><b></b><b></b>'];
  const dieHtml = (n, used) => `<i class="die d${n} ${used ? 'used' : ''}">${pip[n]}</i>`;
  /** 3B zar yuvarlanma animasyonu, sonra verilen değerlerde durur */
  function rollAnim(el, vals) {
    if (!el) return Promise.resolve(); Sound.play('stop');
    el.classList.remove('rolling'); void el.offsetWidth; el.classList.add('rolling');
    let k = 0; const t = setInterval(() => { el.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6)) + dieHtml(1 + Math.floor(Math.random() * 6)); if (++k > 6) { clearInterval(t); el.innerHTML = dieHtml(vals[0]) + dieHtml(vals[1]); el.classList.remove('rolling'); Sound.play('click'); } }, 70);
    return new Promise(r => setTimeout(r, 560));
  }

  /* ---------- masa ekranı ---------- */
  async function openTable(id) {
    if (!window.Trans || T.open) return openTableRaw(id);
    await Trans.story('tavla', 'king_wave', ['Tavla masama hoş geldin! Zarlar her hamlede adil şekilde sunucuda atılır.', 'Pullarını sürükle ya da dokun; büyük zarı oynama kuralı otomatik uygulanır. Hepsini topla, rakibini mars et!']);
    return Trans.run('wood', () => openTableRaw(id));
  }
  async function openTableRaw(id) {
    closeModal(); stop(); Object.assign(T, { open: true, id, v: null, seq: -1, part: [], pboard: null, sel: null, fail: 0, shownGame: 0, shownFinal: false, lastSeenMove: null });
    Platform.setCurrent('tavla'); Sound.stopMusic && Sound.stopMusic();
    UI.screen('tavla', `<div class="tvg">
      <div class="tvhead"><button class="okexit" id="tvLeave">⟵ ÇIK</button><div class="tvsc" id="tvScore"></div><div class="grow"></div><div class="okpill"><i>⏱</i><b id="tvClock">—</b></div><div class="okpill"><i class="okcoin"></i><b id="tvBal"></b></div><button class="okic" id="tvMenu">▾</button></div>
      <div class="tvside"><div class="tvpl opp" id="tvOpp"></div><div class="tvpl me" id="tvMe"></div></div>
      <div class="tvmain" id="tvBoard"></div>
      <div class="tvctl"><div class="tvdice big" id="tvDice"></div><div class="tvmsg" id="tvMsg"></div>
        <button class="tvbtn roll" id="tvRoll">ZAR AT</button><button class="tvbtn ok" id="tvOk">ONAYLA</button><button class="tvbtn undo" id="tvUndo">↶ Geri Al</button></div>
      <div class="tvwait hidden" id="tvWait"></div><div class="oknet hidden" id="tvNet"></div></div>`, 'tvscreen');
    UI.show('tavla');
    $('#tvLeave').onclick = leave; $('#tvMenu').onclick = menu;
    $('#tvRoll').onclick = roll; $('#tvOk').onclick = submit; $('#tvUndo').onclick = () => { T.part = []; T.pboard = null; T.sel = null; render(); };
    bindBoard();
    await poll(true); loop(); T.tim = setInterval(clock, 250);
  }
  function stop() { clearTimeout(T.timer); clearInterval(T.tim); T.timer = T.tim = null; T.open = false; }
  function loop() {
    clearTimeout(T.timer); if (!T.open) return;
    let ms = 900; if (T.fail) ms = Math.min(8000, 1000 * 2 ** T.fail); else if (T.v && T.v.status === 'finished') ms = 5000; else if (T.v && T.v.status === 'waiting') ms = 1500;
    T.timer = setTimeout(async () => { if (!document.hidden) await poll(false); loop(); }, ms);
  }
  async function poll(force) {
    if (!T.open || T.inflight) return; T.inflight = true;
    try {
      const r = await Api.get(`/api/tavla/${T.id}?seq=${force ? -1 : T.seq}`); if (!T.open) return;
      if (T.fail) { T.fail = 0; net(false); }
      if (r.same) { if (T.v) { T.v.deadline = r.deadline; T.skew = Date.now() - r.now; } } else apply(r);
    } catch (e) { if (e.status === 404) { toast(e.message, true); exit(); } else if (!e.status || e.code === 'network' || e.status >= 500) { T.fail++; if (T.fail >= 2) net(true); } }
    finally { T.inflight = false; }
  }
  function net(on) { const n = $('#tvNet'); if (!n) return; n.classList.toggle('hidden', !on); if (on) n.innerHTML = '<b>Bağlantı koptu</b><span>Yeniden bağlanılıyor… Maç sunucuda güvende; süre dolarsa hamlen otomatik oynanır.</span>'; }
  function apply(v) {
    const prev = T.v; T.v = v; T.seq = v.seq; T.skew = Date.now() - v.now;
    // tur değiştiyse yerel hamle taslağı sıfırlanır
    if (!prev || prev.turn !== v.turn || prev.phase !== v.phase || JSON.stringify(prev.dice) !== JSON.stringify(v.dice)) { T.part = []; T.pboard = null; T.sel = null; }
    if (prev && v.lastMove && JSON.stringify(v.lastMove) !== JSON.stringify(prev.lastMove) && v.lastMove.s !== v.me) Sound.play('stop');
    if (prev && v.dice && JSON.stringify(prev.dice) !== JSON.stringify(v.dice) && v.turn !== v.me) rollAnim($('#tvDice'), v.dice);
    if (prev && prev.turn !== v.turn && v.turn === v.me && v.status === 'playing') { Sound.play('orb'); Sound.vibrate && Sound.vibrate(30); }
    render();
    if (v.result && v.status === 'game_end' && T.shownGame !== v.game) { T.shownGame = v.game; gameModal(v); }
    if (v.status === 'finished' && !T.shownFinal) { T.shownFinal = true; finalModal(v); }
    if (v.status === 'abandoned') { toast('Masa kapandı.'); exit(); }
    if (v.me != null && v.seats[v.me] && v.seats[v.me].left) { toast('Masadan ayrıldın.'); exit(); }
  }
  const mine = () => T.v && T.v.status === 'playing' && T.v.turn === T.v.me;
  const board = () => T.pboard || (T.v && T.v.board) || TR.newBoard(); // masa dolana kadar başlangıç dizilimi gösterilir
  /** Kısmi hamle taslağından sonra yapılabilecek adımlar */
  function nextSteps() {
    const v = T.v; if (!mine() || v.phase !== 'move' || !v.dice) return [];
    if (!v.board) return []; const L = TR.legalSequences(v.board, v.me, v.dice); const k = T.part.length; const out = [];
    for (const x of L) { if (x.seq.length <= k) continue; let ok = true; for (let i = 0; i < k; i++) if (x.seq[i][0] !== T.part[i][0] || x.seq[i][1] !== T.part[i][1]) { ok = false; break; } if (ok) out.push(x.seq[k]); }
    return out;
  }
  const fullLen = () => { const v = T.v; if (!v.board || !v.dice) return 0; const L = TR.legalSequences(v.board, v.me, v.dice); return L.length ? L[0].seq.length : 0; };
  function render() {
    const v = T.v; if (!v || !T.open) return;
    const me = v.me == null ? 0 : v.me, opp = 1 - me, b = board();
    $('#tvBal').textContent = App.me.unlimited ? '∞' : fmt(App.me.balance);
    $('#tvScore').innerHTML = `<b>${esc(v.seats[me] ? v.seats[me].name : '')}</b> <span class="tvsn">${v.score[me]}</span> – <span class="tvsn">${v.score[opp]}</span> <b>${esc(v.seats[opp] ? v.seats[opp].name : 'Rakip')}</b> <small>· ${v.cfg.points} sayılık${v.cfg.stake ? ' · 🪙 ' + fmt(v.cfg.stake) : ' · ücretsiz'}${v.code ? ` · Kod <b class="gold">${v.code}</b>` : ''}</small>`;
    const steps = nextSteps(); const hl = new Set(); const froms = new Set(steps.map(s => s[0]));
    if (T.sel != null) steps.filter(s => s[0] === T.sel).forEach(s => hl.add(s[1]));
    const last = new Set(); if (v.lastMove && v.lastMove.s !== me) v.lastMove.moves.forEach(m => { last.add(m[1]); });
    // rakibin son hamlesi rakibin göreli hanelerinde; bizim görünümüze çevir
    const lastV = new Set([...last].filter(r => r > 0 && r < 25).map(r => 25 - r));
    $('#tvBoard').innerHTML = boardHtml(b, { me, hl, sel: T.sel, last: lastV });
    $$('#tvBoard .tvpt, #tvBoard .tvbar.bot').forEach(el => { const r = +el.dataset.r; if (froms.has(r)) el.classList.add('can'); });
    const pl = (s, el) => { const x = v.seats[s]; if (!el) return; if (!x) { el.innerHTML = '<span class="enav">?</span><b>Bekleniyor</b>'; return; } const turn = v.status === 'playing' && v.turn === s;
      el.className = `tvpl ${s === me ? 'me' : 'opp'} ${turn ? 'turn' : ''}`; el.innerHTML = `<div class="okav"><span>${AVATARS[x.avatar] || UI.AVATARS[0]}</span><svg class="okring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20"/></svg></div><div><b>${esc(x.name)}</b>${x.bot ? '<i class="okbot">BOT</i>' : x.left ? '<i class="okbot">AYRILDI</i>' : x.away ? '<i class="okbot">OTO</i>' : ''}<small>${s === 0 ? 'Beyaz' : 'Siyah'} · ${TR.pips(board(), s)} pip · ${board().off[s]}/15</small></div>`; };
    pl(opp, $('#tvOpp')); pl(me, $('#tvMe'));
    const dz = $('#tvDice');
    if (v.dice && !dz.classList.contains('rolling')) { const used = usedDice(); dz.innerHTML = v.dice.map((d, i) => dieHtml(d, used[i])).join('') + (v.dice[0] === v.dice[1] ? `<small class="dbl">ÇİFT ×4 · ${4 - T.part.length} kaldı</small>` : ''); }
    else if (!v.dice) dz.innerHTML = '';
    const canRoll = mine() && v.phase === 'roll', moving = mine() && v.phase === 'move' && v.legalN, done = moving && T.part.length === fullLen();
    $('#tvRoll').classList.toggle('hidden', !canRoll); $('#tvOk').classList.toggle('hidden', !moving); $('#tvUndo').classList.toggle('hidden', !moving);
    $('#tvOk').classList.toggle('off', !done); $('#tvUndo').classList.toggle('off', !T.part.length);
    $('#tvMsg').innerHTML = v.status !== 'playing' ? (v.status === 'game_end' ? 'Oyun bitti — sıradaki oyun başlıyor' : v.status === 'finished' ? 'Maç bitti' : '') :
      !mine() ? `Sıra: <b>${esc(v.seats[v.turn].name)}</b>` : v.phase === 'roll' ? '<b class="gold">Sıra sende:</b> zarı at' : v.noMove ? 'Oynanacak hamle yok — sıra geçiyor' : done ? '<b class="gold">Hamlen hazır</b> — ONAYLA' : b.bar[me] ? '<b class="gold">Kırık pulun var:</b> önce içeri sok' : '<b class="gold">Pula dokun</b>, parlayan haneye taşı';
    if (v.opening && v.game && T.shownOpen !== v.game && v.status === 'playing') { T.shownOpen = v.game; toast(`Açılış zarları ${v.opening[0]}–${v.opening[1]}: ${esc(v.seats[v.turn].name)} başlıyor`); }
    renderWait();
  }
  function usedDice() {
    const v = T.v; if (!v.dice) return [false, false]; if (v.dice[0] === v.dice[1]) return [T.part.length >= 4, T.part.length >= 2];
    const u = [false, false]; for (const m of T.part) { const d = m[2]; const i = !u[0] && v.dice[0] === d ? 0 : 1; u[i] = true; } return u;
  }
  function renderWait() {
    const v = T.v, el = $('#tvWait'); if (v.status !== 'waiting') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden'); const left = v.fillAt ? Math.max(0, Math.ceil((v.fillAt - (Date.now() - T.skew)) / 1000)) : null;
    el.innerHTML = `<b class="gold" style="font-size:20px">${v.cfg.private ? '🔒 Özel tavla masası' : '🟢 Rakip aranıyor'}</b>
      <p>${v.cfg.points} sayılık maç · ${v.cfg.stake ? 'giriş ' + fmt(v.cfg.stake) : 'ücretsiz'} · masa ${v.seats.filter(Boolean).length}/2${!v.cfg.private && v.cfg.bots && left != null ? ` · <span id="tvFill">${left} sn sonra bot oturur</span>` : ''}</p>
      ${v.code ? `<p>Masa kodu: <b class="okcode">${v.code}</b>${v.locked ? ' 🔒' : ''} <button class="okbtn2 sm" id="tvCopy">📋 Kopyala</button> <button class="okbtn2 sm wa" id="tvWa">🟢 WhatsApp</button></p>` : ''}
      <div class="row" style="justify-content:center;gap:8px"><button class="okbtn2" id="tvInv">👥 Arkadaş Davet Et</button>${(v.cfg.private && !v.owner) || v.cfg.bots === false ? '' : '<button class="okbtn2 go" id="tvBot">🤖 Botla Başlat</button>'}</div>`;
    const txt = `Tavla masama gel! SPINOVA 101 OKEY'de "Kodla Katıl"a ${v.code} yaz.${v.locked ? ' (Şifreyi ayrıca söyleyeceğim.)' : ''} Jetonlar sanaldır.`;
    $('#tvCopy') && ($('#tvCopy').onclick = () => Platform.copy(v.code)); $('#tvWa') && ($('#tvWa').onclick = () => Platform.share(txt));
    $('#tvInv').onclick = invite; $('#tvBot') && ($('#tvBot').onclick = () => guard($('#tvBot'), async () => { await Api.post(`/api/tavla/${T.id}/start`, {}); poll(true); }));
  }
  function clock() {
    const v = T.v; if (!v || !T.open) return; const t = Date.now() - T.skew;
    if (v.status === 'playing' && v.deadline) { const rem = Math.max(0, v.deadline - t); $('#tvClock').textContent = Math.ceil(rem / 1000) + ' sn';
      $$('.tvpl').forEach(el => { const c = el.querySelector('.okring circle'); if (c) c.style.strokeDashoffset = el.classList.contains('turn') ? String(126 * (1 - rem / v.cfg.turnMs)) : '126'; }); }
    else $('#tvClock').textContent = v.status === 'waiting' ? 'Bekleniyor' : '—';
    if (v.status === 'waiting' && v.fillAt) { const f = $('#tvFill'); if (f) f.textContent = `${Math.max(0, Math.ceil((v.fillAt - t) / 1000))} sn sonra bot oturur`; }
  }

  /* ---------- hamle girişi ---------- */
  function step(from, to) {
    const s = nextSteps().find(x => x[0] === from && x[1] === to); if (!s) return false;
    const m = TR.moveOne(board(), T.v.me, from, s[2]); if (!m) return false;
    T.pboard = m.board; T.part.push([from, to, s[2]]); T.sel = null; Sound.play(m.hit ? 'pop' : 'click'); if (m.hit) Sound.vibrate && Sound.vibrate(25);
    render(); if (T.part.length === fullLen()) setTimeout(() => { const b = $('#tvOk'); b && b.classList.add('pulse'); }, 50);
    return true;
  }
  function bindBoard() {
    const host = $('#tvBoard'); let drag = null;
    host.addEventListener('pointerdown', (e) => {
      if (!mine() || T.v.phase !== 'move') return;
      const el = e.target.closest('[data-r]'); if (!el) return; const r = +el.dataset.r;
      const steps = nextSteps();
      if (T.sel != null && steps.some(s => s[0] === T.sel && s[1] === r)) { step(T.sel, r); return; }
      if (steps.some(s => s[0] === r)) { T.sel = r; render(); drag = { r, x: e.clientX, y: e.clientY, moved: false }; try { host.setPointerCapture(e.pointerId); } catch (x) { /* */ } }
      else if (T.sel != null) { T.sel = null; render(); }
    });
    host.addEventListener('pointermove', (e) => { if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 10) drag.moved = true; });
    host.addEventListener('pointerup', (e) => {
      const d = drag; drag = null; if (!d || !d.moved) return;
      const el = document.elementFromPoint(e.clientX, e.clientY), t = el && el.closest('[data-r]'); if (t) step(d.r, +t.dataset.r);
    });
  }
  async function roll() {
    if (T.acting || !mine() || T.v.phase !== 'roll') return; T.acting = true; const dz = $('#tvDice');
    try { const p = Api.post(`/api/tavla/${T.id}/act`, { type: 'roll' }); dz.classList.add('rolling'); const r = await p; await rollAnim(dz, r.dice); if (!r.moves) toast('Bu zarla oynanacak hamle yok — sıra geçiyor.'); await poll(true); }
    catch (e) { dz.classList.remove('rolling'); toast(e.message, true); await poll(true); } finally { T.acting = false; }
  }
  async function submit() {
    if (T.acting || !mine() || T.part.length !== fullLen()) return toast('Önce zarların tamamını oyna (oynanabildiği kadar).', true);
    T.acting = true;
    try { await Api.post(`/api/tavla/${T.id}/act`, { type: 'move', moves: T.part.map(m => [m[0], m[1]]) }); T.part = []; T.pboard = null; await poll(true); }
    catch (e) { toast(e.message, true); T.part = []; T.pboard = null; await poll(true); } finally { T.acting = false; }
  }

  /* ---------- modallar ---------- */
  function gameModal(v) {
    const r = v.result, w = r.winner, me = v.me;
    if (w === me) Sound.play('bigwin');
    modal(`<h3 class="gold">${w === me ? '🏆 Oyunu kazandın!' : '🎲 ' + esc(v.seats[w].name) + ' kazandı'}</h3><p class="center">${r.mars ? '<b>MARS!</b> ' : ''}+${r.points} sayı · Skor ${v.score[me]} – ${v.score[1 - me]}</p><p class="center small muted">Sıradaki oyun birkaç saniye içinde başlar.</p>`);
    setTimeout(() => { if (T.v && T.v.status === 'playing') closeModal(); }, 6200);
  }
  function finalModal(v) {
    const me = v.me, won = v.final && v.final.winner === me;
    if (won) { Sound.play('bigwin'); UI.confetti && UI.confetti(80); }
    modal(`<h3 class="gold">${won ? '🏆 MAÇI KAZANDIN!' : 'Maç bitti'}</h3><p class="center">Skor <b>${v.score[me]} – ${v.score[1 - me]}</b>${v.payouts && v.payouts[me] ? ` · <b class="gold">+${fmt(v.payouts[me])} 🪙</b>` : ''}${v.xpGain && v.xpGain[me] ? ` · +${v.xpGain[me]} XP` : ''}</p>
      <div class="row"><button class="btn ghost grow" data-close="lobby">Tavla Lobisi</button>${v.cfg.private ? '' : '<button class="btn green grow" data-close="again">Tekrar Oyna</button>'}</div>`, { noClose: true }).then(async (x) => {
      Screens.refresh && Screens.refresh().catch(() => {});
      try { await Api.post(`/api/tavla/${T.id}/leave`, {}); } catch (e) { /* */ }
      if (x === 'again') { try { const r = await Api.post('/api/tavla/quick', { stake: v.cfg.stake, points: v.cfg.points }); openTable(r.tableId); } catch (e) { toast(e.message, true); exit(); } } else exit();
    });
  }
  async function leave() {
    const v = T.v;
    if (v && (v.status === 'playing' || v.status === 'game_end') && !(await UI.confirm(`Masadan ayrılırsan yerine bot oynar${v.cfg.stake ? ' ve giriş jetonun iade edilmez' : ''}. Maç sürdükçe geri dönebilirsin. Ayrılmak istiyor musun?`, 'Ayrıl'))) return;
    const id = T.id; stop();
    if (v && v.status !== 'finished') { try { const r = await Api.post(`/api/tavla/${id}/leave`, {}); if (r.refunded) toast(`Giriş jetonu iade edildi: ${fmt(r.refunded)}`); } catch (e) { /* */ } }
    Screens.refresh && Screens.refresh().catch(() => {}); Entry.open('tavla');
  }
  function exit() { stop(); Entry.open('tavla'); }
  function menu() {
    modal(`<h3 class="gold">Menü</h3><div class="list"><button class="btn ghost block" data-x="rules">📖 Kurallar</button><button class="btn ghost block" data-x="sound">${Sound.get().sound ? '🔇 Sesi Kapat' : '🔊 Sesi Aç'}</button><button class="btn red block" data-x="leave">⟵ Masadan Çık</button></div>`, {
      onOpen(m) { $$('[data-x]', m).forEach(b => b.onclick = () => { const x = b.dataset.x; closeModal(); if (x === 'rules') rulesModal(); if (x === 'sound') Sound.set('sound', !Sound.get().sound); if (x === 'leave') leave(); }); } });
  }
  async function invite() {
    let fr = []; try { fr = (await Api.get('/api/friends')).friends; } catch (e) { /* */ }
    modal(`<h3 class="gold">👥 Arkadaş Davet Et</h3>${T.v.code ? `<p class="center">Masa kodu: <b class="okcode">${T.v.code}</b></p>` : ''}<div class="list">${fr.map(f => `<div class="li"><span class="avatar sm">${AVATARS[f.avatar] || UI.AVATARS[0]}</span><div class="grow"><b>${esc(f.username)}</b></div><button class="btn green sm" data-f="${f.id}">Davet</button></div>`).join('') || '<p class="center muted small">Henüz arkadaşın yok.</p>'}</div>`, {
      onOpen(m) { $$('[data-f]', m).forEach(b => b.onclick = () => guard(b, async () => { await Api.post(`/api/tavla/${T.id}/invite`, { friendId: +b.dataset.f }); b.textContent = 'Gönderildi ✓'; })); } });
  }
  function rulesModal() {
    modal(`<h3 class="gold">📖 Tavla Kuralları</h3><div class="small okrules">
      <p><b>Amaç:</b> 15 pulunu kendi evine (sağ alt, 1–6) getirip dışarı toplamak. Beyaz 24→1, siyah ters yönde oynar.</p>
      <p><b>Zar:</b> Zarları sunucu atar. İki zarın her biri ayrı hamledir; çift gelirse 4 hamle. Mümkünse iki zarı da oynamak zorunludur; yalnızca biri oynanabiliyorsa büyük olan oynanır.</p>
      <p><b>Kapı ve kırma:</b> Rakibin 2+ pulu olan haneye gidilemez. Tek pula (açık pul) gelirsen onu kırarsın; kırılan pul önce rakibin evinden içeri girmeden başka hamle yapılamaz.</p>
      <p><b>Toplama:</b> Bütün pullar evdeyken toplanır. Zar, en uzaktaki pulun hanesinden büyükse o pul toplanır.</p>
      <p><b>Puan:</b> Normal galibiyet 1 sayı, rakip hiç pul toplamadıysa <b>mars</b>: 2 sayı. Maç 1, 3 ya da 5 sayıya oynanır. Ücretli masada kazanan iki girişi alır (sanal jeton).</p>
      <p><b>Süre:</b> Her hamle için 40 sn. Süre dolarsa hamlen otomatik oynanır; iki kez üst üste olursa bot devralır, döndüğünde sen devam edersin.</p></div>`);
  }
  function privateModal(points) {
    let st = 0;
    modal(`<h3 class="gold">🔒 Özel Tavla Masası</h3><p class="center small">${points} sayılık maç · arkadaşını 6 haneli kodla davet et</p>
      <div class="okstk">${[0, 1000, 10000, 100000, 1000000].map(x => `<button class="okob sm" data-s="${x}">${x ? fmt(x) : 'Ücretsiz'}</button>`).join('')}</div>
      <div class="okpw"><input id="tvPw" type="text" maxlength="20" placeholder="🔒 Masa şifresi (isteğe bağlı)"></div><button class="okgo" id="tvGo">Masayı Kur</button>`, {
      cls: 'okoptm', onOpen(m) {
        const paint = () => $$('[data-s]', m).forEach(b => b.classList.toggle('on', +b.dataset.s === st)); $$('[data-s]', m).forEach(b => b.onclick = () => { st = +b.dataset.s; paint(); }); paint();
        $('#tvGo').onclick = () => guard($('#tvGo'), async () => { const pw = $('#tvPw').value.trim(); const r = await Api.post('/api/tavla/private', { stake: st, points, ...(pw ? { password: pw } : {}) }); closeModal(); openTable(r.tableId); });
      } });
  }
  function codeModal() {
    modal(`<h3 class="gold">🔑 Kodla Katıl</h3><label class="field"><span>Masa kodu (6 karakter)</span><input id="tvCode" maxlength="6" style="text-transform:uppercase;letter-spacing:4px;font-size:22px;text-align:center"></label><button class="btn green block" id="tvCodeGo">MASAYA OTUR</button>`, {
      onOpen() { $('#tvCode').focus(); $('#tvCodeGo').onclick = () => { const c = $('#tvCode').value.trim(); closeModal(); Platform.joinCode(c); }; } });
  }
  async function openTables(el) {
    if (!el) return; let d; try { d = await Api.get('/api/tavla/tables'); } catch (e) { el.innerHTML = `<p class="small muted center">${esc(e.message)}</p>`; return; }
    if (!document.body.contains(el)) return;
    if (!d.tables.length) { el.innerHTML = '<p class="small muted center">Bekleyen açık masa yok. Hızlı eşleş ya da masa kur.</p>'; return; }
    el.innerHTML = d.tables.map(t => `<div class="li"><div class="grow"><b>${t.locked ? '🔒 ' : ''}${t.points} sayılık</b><small>${t.stake ? '🪙 ' + fmt(t.stake) : 'Ücretsiz'} · ${t.seats.map(x => (x ? esc(x.name) : '—')).join(' vs ')}</small></div><b class="okfill">${t.filled}/2</b><button class="btn green sm" data-ot="${t.id}" data-lk="${t.locked ? 1 : 0}">OTUR</button></div>`).join('');
    $$('[data-ot]', el).forEach(b => b.onclick = () => guard(b, async () => { const body = { tableId: +b.dataset.ot }; if (b.dataset.lk === '1') { const pw = await Platform.askText('🔒 Şifreli masa', 'Masa şifresi'); if (!pw) return; body.password = pw; } const r = await Api.post('/api/tavla/join', body); openTable(r.tableId); }));
  }
  function back() { if ($('#overlay').classList.contains('show')) { closeModal(); return true; } if (T.open) { leave(); return true; } return false; }
  window.Tavla = { boardHtml, dieHtml, rollAnim, openTable, privateModal, codeModal, rulesModal, openTables, back, isOpen: () => T.open, close: stop };
})();
