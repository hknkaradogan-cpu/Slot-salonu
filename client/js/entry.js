/* SPINOVA 101 OKEY — OYUN GİRİŞ EKRANLARI
 * Ana salondaki her kart kendi tasarlanmış giriş ekranını açar: 101 Okey, Düz Okey, Tavla, Slot Salonu (Aviator doğrudan oyun ekranıdır).
 * Ekranlar katmanlıdır (doku dosyaları + HTML/CSS bileşenleri); her buton gerçek bir sunucu işlemine bağlıdır.
 * Geri tuşu ana salona döner. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, toast, guard, AVATARS } = UI;
  const E = { cur: null };
  const STAKES = [[0, 'Ücretsiz Masa', 'Jeton harcanmaz · XP kazanırsın'], [1000, 'Çaylak Masası', 'Giriş 1.000'], [10000, 'Usta Masası', 'Giriş 10.000'], [100000, 'Salon Masası', 'Giriş 100.000'], [1000000, 'Kral Masası', 'Giriş 1.000.000']];
  const tile = (c, n, x = '') => `<div class="otile c${c} ${x}"><span>${n}</span><b class="od"></b></div>`;
  const me = () => App.me || {};
  const balTxt = () => (me().unlimited ? '∞' : fmt(me().balance || 0));

  function head(title, sub, cls) {
    return `<div class="enhead ${cls || ''}"><button class="enback" data-x="back">◀ Salon</button>
      <img class="enlogo" src="assets/spinova_logo.webp" alt="SPINOVA"><div class="entit"><b>${title}</b><small>${sub}</small></div><div class="grow"></div>
      <div class="encoin" data-x="shop"><i class="hcoin"></i><b id="enBal">${balTxt()}</b><span class="hplus">+</span></div></div>`;
  }
  function show(id, html, cls) {
    E.cur = id; Platform.setCurrent('entry:' + id);
    UI.screen('entry', `<div class="en ${cls}">${html}</div>`); UI.show('entry');
    const root = $('#entry');
    root.onclick = (e) => { const x = e.target.closest('[data-x]'); if (!x) return; Sound.play('click'); const k = x.dataset.x; if (k === 'back') return Platform.home(); if (k === 'shop') return Platform.panel('shop'); };
    return root;
  }
  const seatHtml = (pos, x) => `<div class="enseat ${pos} ${x ? '' : 'empty'}" ${x ? '' : 'data-sit="1"'}><span class="enav">${x ? AVATARS[x.avatar] || '🙂' : '+'}</span><b>${x ? esc(x.name) : 'Boş koltuk'}</b><small>${x ? 'Sv' + (x.level || 1) : 'Dokun, otur'}</small></div>`;

  /* ===================== 101 OKEY ===================== */
  async function okey(variant) {
    const duz = variant === 'duz'; Okey.setVariant(duz ? 'duz' : '101');
    const id = duz ? 'duz' : 'okey101';
    const rack1 = duz ? [[0, 4], [0, 5], [0, 6], null, [2, 9], [1, 9], [3, 9], null, [1, 11], [1, 12], [1, 13]] : [[0, 7], [1, 7], [3, 7], null, [2, 3], [2, 4], [2, 5], [2, 6], null, [1, 10], [1, 11], [1, 12]];
    const rack2 = duz ? [[3, 1], [3, 1], null, [2, 8], [2, 8], null, [0, 12], [0, 12], null, [1, 2]] : [[3, 1], [3, 2], [3, 3], null, [0, 13], [1, 13], [2, 13], null, [0, 9], [0, 9]];
    const row = (r) => r.map(t => (t ? tile(t[0], t[1]) : '<i class="engap"></i>')).join('');
    const scene = `<div class="enscene ${duz ? 'duz' : 'o101'}">
        <div class="entable"><div class="enfelt"><img class="enfeltlogo" src="assets/spinova_logo.webp" alt=""><div class="enpile">${'<i></i>'.repeat(4)}</div></div></div>
        ${seatHtml('top', null)}${seatHtml('left', null)}${seatHtml('right', null)}
        <div class="enseat me"><span class="enav">${AVATARS[me().avatar] || '🙂'}</span><b>${esc(me().username || '')}</b><small>Sv${me().level || 1}</small></div>
        <div class="enrack"><div class="enrow">${row(rack1)}</div><div class="enrow">${row(rack2)}</div><em class="rk1">SPINOVA</em><em class="rk2">By-Hkn</em></div>
        ${duz ? '<div class="entea"><i class="glass"></i><i class="plate"></i></div>' : ''}
      </div>`;
    const panel = `<div class="enpanel">
        <div id="enAct"></div>
        <button class="enbig green" id="enQuick">⚡ Hızlı Katıl <small>ücretsiz masada anında eşleş</small></button>
        <div class="ensec">Masa seç <small>jeton miktarına göre</small></div>
        <div class="entiers">${STAKES.map(([st, nm, sub]) => `<button class="entier" data-st="${st}" ${!st || me().unlimited || me().balance >= st ? '' : 'disabled'}><i class="chip c${STAKES.findIndex(x => x[0] === st)}"></i><span><b>${nm}</b><small>${st ? sub + ' · Havuz ' + fmt(st * 4) : sub}</small></span><em id="enW${st}"></em><span class="go">Otur ▸</span></button>`).join('')}</div>
        <div class="enrow2"><button class="enbtn purple" id="enPriv">👥 Arkadaşla Oyna</button><button class="enbtn gold" id="enCode">🔑 Kodla Katıl</button></div>
        <div class="ensec">Açık masalar <small>🔒 = şifreli</small></div><div class="enopen list" id="enOpen"><p class="small muted center">Yükleniyor…</p></div>
        <div class="enfoot"><button data-y="rules">📖 Kurallar</button><button data-y="top">🏆 Sıralama</button><span id="enStats"></span></div>
      </div>`;
    const root = show(id, head(duz ? 'DÜZ OKEY' : '101 OKEY', duz ? 'Klasik kahvehane okeyi · 14 taş · açma yok' : 'Gerçek 101 · katlamalı / katlamasız · eşli / tekli', duz ? 'duz' : '') + (duz ? panel + scene : scene + panel), duz ? 'en-duz' : 'en-okey');
    $('#enQuick').onclick = () => guard($('#enQuick'), async () => {
      let o = { mode: 'tekli', rounds: 1, katlamali: true }; try { o = Object.assign(o, JSON.parse(localStorage.getItem('okey_opts')) || {}); } catch (e) { /* */ }
      const r = await Api.post('/api/okey/quick', { ...o, variant: duz ? 'duz' : '101', stake: 0 }); if (r.existing) toast('Zaten bir masadasın — oraya dönüyorsun.'); Okey.openTable(r.tableId);
    });
    $$('[data-st]', root).forEach(b => b.onclick = () => Okey.quickOpts(duz ? 'duz' : '101', +b.dataset.st));
    $$('[data-sit]', root).forEach(b => b.onclick = () => $('#enQuick').click());
    $('#enPriv').onclick = () => Okey.createPrivate(duz ? 'duz' : '101');
    $('#enCode').onclick = () => Okey.codeModal();
    $$('[data-y]', root).forEach(b => b.onclick = () => (b.dataset.y === 'rules' ? Okey.rulesModal() : Okey.topModal()));
    Okey.openTables($('#enOpen'), duz ? 'duz' : '101');
    try {
      const d = await Okey.lobbyData(true); if (E.cur !== id) return;
      const act = $('#enAct');
      if (d.active) { act.innerHTML = `<div class="enresume"><b>Devam eden masan var</b><button class="enbtn green" id="enRes">MASAYA DÖN ▸</button></div>`; $('#enRes').onclick = () => Okey.openTable(d.active.id); }
      else if (d.rejoin) { act.innerHTML = `<div class="enresume warn"><b>Ayrıldığın masa sürüyor</b><button class="enbtn gold" id="enRej">GERİ DÖN ▸</button></div>`; $('#enRej').onclick = () => guard($('#enRej'), async () => { const r = await Api.post('/api/okey/join', { tableId: d.rejoin.id }); Okey.openTable(r.tableId); }); }
      for (const [st] of STAKES) { const n = d.waiting.filter(w => (w.variant || '101') === (duz ? 'duz' : '101') && Number(w.stake) === st).reduce((a, w) => a + w.n, 0); const e = $('#enW' + st); if (e) e.textContent = n ? `⏳ ${n}` : ''; }
      $('#enStats').textContent = `${d.stats.played || 0} oyun · ${d.stats.won || 0} galibiyet · 🟢 ${d.online.players} kişi masada`;
      if (d.config && d.config.enabled === false) toast('Okey şu anda bakımda.', true);
    } catch (e) { /* lobi verisi gelmese de butonlar çalışır */ }
  }

  /* ===================== TAVLA ===================== */
  async function tavla() {
    let pts = +(localStorage.getItem('tavla_points') || 1);
    const scene = `<div class="enscene tv">
        <div class="tvchair l"><span class="enav">${AVATARS[me().avatar] || '🙂'}</span><b>${esc(me().username || '')}</b><small>Beyaz pullar</small></div>
        <div class="tvchair r empty" data-sit="1"><span class="enav">?</span><b>Rakip</b><small>Dokun, eşleş</small></div>
        <div class="tvboardwrap">${Tavla.boardHtml(TavlaRules.newBoard(), { small: true })}</div>
        <button class="tvdice" id="enDice" title="Zar at (deneme)">${Tavla.dieHtml(5)}${Tavla.dieHtml(3)}</button>
        <small class="tvdhint">Zarlara dokun · oyunda zarı sunucu atar</small>
      </div>`;
    const panel = `<div class="enpanel tvp">
        <div id="enAct"></div>
        <div class="ensec">Oyun uzunluğu</div><div class="enseg" id="enPts">${[1, 3, 5].map(p => `<button data-p2="${p}">${p} sayı</button>`).join('')}</div>
        <button class="enbig green" id="enQuick">🎲 Hızlı Eşleş <small>ücretsiz · rakip yoksa 15 sn sonra bot</small></button>
        <div class="ensec">Masa seç</div>
        <div class="entiers">${STAKES.map(([st, nm, sub], i) => `<button class="entier" data-st="${st}" ${!st || me().unlimited || me().balance >= st ? '' : 'disabled'}><i class="chip c${i}"></i><span><b>${nm.replace('Masası', 'Tavlası').replace('Masa', 'Tavla')}</b><small>${st ? 'Giriş ' + fmt(st) + ' · Kazanan ' + fmt(st * 2) : sub}</small></span><span class="go">Otur ▸</span></button>`).join('')}</div>
        <div class="enrow2"><button class="enbtn purple" id="enPriv">🔒 Özel Masa Kur</button><button class="enbtn gold" id="enCode">🔑 Kodla Katıl</button></div>
        <div class="ensec">Açık masalar</div><div class="enopen list" id="enOpen"><p class="small muted center">Yükleniyor…</p></div>
        <div class="enfoot"><button data-y="rules">📖 Kurallar</button><button data-y="top">🏆 Sıralama</button><span id="enStats"></span></div>
      </div>`;
    const root = show('tavla', head('TAVLA', 'Gerçek tavla · mars 2 sayı · 1, 3 ya da 5 sayılık maç', 'tv') + scene + panel, 'en-tavla');
    const paint = () => { $$('[data-p2]', root).forEach(b => b.classList.toggle('on', +b.dataset.p2 === pts)); localStorage.setItem('tavla_points', pts); };
    $$('[data-p2]', root).forEach(b => b.onclick = () => { pts = +b.dataset.p2; paint(); }); paint();
    const quick = (stake) => async () => { const r = await Api.post('/api/tavla/quick', { stake, points: pts }); if (r.existing) toast('Zaten bir tavla masasındasın — oraya dönüyorsun.'); Tavla.openTable(r.tableId); };
    $('#enQuick').onclick = () => guard($('#enQuick'), quick(0));
    $$('[data-st]', root).forEach(b => b.onclick = () => guard(b, quick(+b.dataset.st)));
    $$('[data-sit]', root).forEach(b => b.onclick = () => $('#enQuick').click());
    $('#enPriv').onclick = () => Tavla.privateModal(pts);
    $('#enCode').onclick = () => Tavla.codeModal();
    $$('[data-y]', root).forEach(b => b.onclick = () => (b.dataset.y === 'rules' ? Tavla.rulesModal() : Platform.panel('leaders', 'tavla')));
    $('#enDice').onclick = () => Tavla.rollAnim($('#enDice'), [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    Tavla.openTables($('#enOpen'));
    try {
      const d = await Api.get('/api/tavla/lobby'); if (E.cur !== 'tavla') return;
      const act = $('#enAct');
      if (d.active) { act.innerHTML = `<div class="enresume"><b>Devam eden tavla masan var</b><button class="enbtn green" id="enRes">MASAYA DÖN ▸</button></div>`; $('#enRes').onclick = () => Tavla.openTable(d.active.id); }
      else if (d.rejoin) { act.innerHTML = `<div class="enresume warn"><b>Ayrıldığın maç sürüyor</b><button class="enbtn gold" id="enRej">GERİ DÖN ▸</button></div>`; $('#enRej').onclick = () => guard($('#enRej'), async () => { const r = await Api.post('/api/tavla/join', { tableId: d.rejoin.id }); Tavla.openTable(r.tableId); }); }
      $('#enStats').textContent = `${d.stats.played} maç · ${d.stats.won} galibiyet · ${d.stats.mars} mars · 🟢 ${d.online.players} kişi masada`;
    } catch (e) { /* */ }
  }

  /* ===================== SLOT SALONU ===================== */
  const CATS = [['all', 'Tümü'], ['tumble', 'Düşen Semboller'], ['classic', 'Klasik'], ['jackpot', 'Jackpot'], ['ways', 'Çok Yollu']];
  const catOf = (g) => { const f = g.family; return f === 'tumble' ? ['tumble'] : f === 'vegas' ? ['classic'] : f === 'pirate' || f === 'gold' ? ['jackpot'] : f === 'ways' || f === 'egypt' ? ['ways'] : ['classic']; };
  function slots(cat) {
    cat = cat || 'all';
    const games = (App.games || []).filter(g => cat === 'all' || catOf(g).includes(cat));
    const th = (id) => (window.Sym && Sym.THEMES[id]) || {};
    const root = show('slots', head('SLOT SALONU', 'Her makine ayrı tema, ayrı mekanik · sanal jeton', 'sl') + `
      <div class="slhall"><i class="sllight"></i></div>
      <div class="slcats">${CATS.map(([k, n]) => `<button data-c="${k}" class="${k === cat ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="slgrid">${games.map(g => { const t = th(g.id); return `<button class="slm" data-g="${g.id}" style="--b1:${t.b1 || '#2a0d5e'};--b2:${t.b2 || '#5a2bb0'};--gl:${t.glow || '#ffd34d'}">
        <span class="slcab"><span class="slscreen"><img src="assets/${t.card || 'card_' + g.id}.webp" alt=""></span><span class="slreels">${[0, 1, 2].map(k => `<i>${window.Sym ? Sym.symHtml(g.id, k, 'slsym') : ''}</i>`).join('')}</span></span>
        <b>${esc(g.name)}</b><small>${esc(g.tag || '')}</small><span class="slmeta"><em>RTP %${(g.info.rtp * 100).toFixed(1)}</em><em>${esc(g.info.volatility || '')}</em></span></button>`; }).join('') || '<p class="center muted">Bu kategoride oyun yok.</p>'}</div>`, 'en-slots');
    $$('[data-c]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); Sound.play('click'); slots(b.dataset.c); });
    $$('[data-g]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); Sound.play('click'); Games.open(b.dataset.g); });
  }

  function open(id) {
    if (id === 'okey101') return okey('101');
    if (id === 'duz') return okey('duz');
    if (id === 'tavla') return tavla();
    if (id === 'slots') return slots();
    if (id === 'aviator') return Aviator.open();
    return Platform.home();
  }
  function setBal() { const e = $('#enBal'); if (e) e.textContent = balTxt(); }
  window.Entry = { open, current: () => E.cur, setBal };
})();
