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
  const seatHtml = (pos, x) => `<div class="enseat ${pos} ${x ? '' : 'empty'}" ${x ? '' : 'data-sit="1"'}><span class="enav">${x ? AVATARS[x.avatar] || UI.AVATARS[0] : '+'}</span><b>${x ? esc(x.name) : 'Boş koltuk'}</b><small>${x ? 'Sv' + (x.level || 1) : 'Dokun, otur'}</small></div>`;

  /* ===================== 101 OKEY / DÜZ OKEY — oda lobisi (referans: 101 Plus) ===================== */
  async function okey(variant) {
    const duz = variant === 'duz'; Okey.setVariant(duz ? 'duz' : '101');
    const id = duz ? 'duz' : 'okey101', V = duz ? 'duz' : '101';
    const tiles = (arr) => arr.map(t => tile(t[0], t[1], 'rt')).join('');
    const art = { cl: tiles([[0, 1], [2, 1]]), cy: tiles([[2, 5], [0, 1]]), us: tiles([[1, 7], [1, 8], [1, 9]]), sa: tiles([[3, 13], [0, 13], [2, 13]]), kr: '<span class="rkcrown">👑</span>' + tiles([[0, 1], [3, 1]]) };
    const root = show(id, `
      <div class="olbg ${duz ? 'duz' : ''}"></div>
      <div class="oltop"><button class="enback" data-x="back">◀</button>
        <div class="olprof"><span class="enav">${AVATARS[me().avatar] || UI.AVATARS[0]}</span><div><b>${esc(me().username || '')}</b><small>⭐ Seviye: ${me().level || 1}</small></div></div>
        <div class="olgame"><b>${duz ? 'DÜZ OKEY' : '101 OKEY'}</b><small>${duz ? 'klasik kahvehane okeyi' : 'katlamalı · katlamasız · eşli · tekli'}</small></div>
        <div class="grow"></div><div class="encoin" data-x="shop"><i class="hcoin"></i><b id="enBal">${balTxt()}</b><span class="hplus">+</span></div><button class="olbuy" data-x="shop">🛒</button></div>
      <div class="olev">
        <button class="olbn b1" data-ev="tournaments"><b>OKEY<br>ŞAMPİYONASI</b><small>Sıralamaya gir!</small></button>
        <button class="olbn b2" data-ev="wheel"><b>ŞANS<br>ÇARKI</b><small>Günlük ücretsiz</small></button>
        <button class="olbn b3" data-ev="puzzle"><b>BULMACA</b><small>Çöz, jeton kazan</small></button></div>
      <div class="olrooms" id="olRooms">${OkeyRooms.cardsHtml(V)}
        <div class="orc rz2"><span class="rzhot">RİZİKOLU</span><div class="rch"><b>2 KİŞİLİK</b><small>KAZANAN HEPSİNİ ALIR</small></div><div class="rca"><span class="rkvs">VS</span>${tiles([[0, 13], [2, 13]])}</div><div class="rcn">Giriş 10.000 · en az 30.000</div>
          <div class="rcb"><button class="orbtn rzb" data-rz="2">KATIL</button></div></div>
        <div class="orc rz4"><span class="rzhot">RİZİKOLU</span><div class="rch"><b>4 KİŞİLİK</b><small>KAZANAN HEPSİNİ ALIR</small></div><div class="rca"><span class="rkfire">🔥</span>${tiles([[0, 1], [1, 1], [2, 1], [3, 1]])}</div><div class="rcn">Giriş 10.000 · en az 30.000</div>
          <div class="rcb"><button class="orbtn rzb" data-rz="4">KATIL</button></div></div>
        <div class="orc vip"><div class="rch"><b>ÖZEL</b><small>ARKADAŞ ODALARI</small></div><div class="rca"><span class="rkstar">★</span></div><div class="rcn">Kodlu · şifreli</div>
          <div class="rcb two"><button class="orbtn s" id="olCode">KODLA</button><button class="orbtn s" id="olPriv">MASA AÇ</button></div></div></div>
      <div class="olbot"><button class="olic" data-ev="friends"><span>👥</span>Arkadaş</button><button class="olic" data-ev="messages"><span>✉️</span>Mesaj</button><button class="olic" data-y="top"><span>🏆</span>Sıralama</button>
        <button class="olplay" id="enQuick"><b>HEMEN OYNA</b><small id="olOnline">çevrim içi oyuncular yükleniyor…</small></button>
        <button class="olic" id="olOpen"><span>🟢</span>Açık Masa</button><button class="olic" data-y="rules"><span>📖</span>Kurallar</button><button class="olic" data-x="shop"><span>🎁</span>Mağaza</button></div>
      <div id="enAct" class="olact"></div>`, duz ? 'en-ol duz' : 'en-ol');
    // HEMEN OYNA: sunucu, jetonuna göre girebileceğin en yüksek odadaki masaya oturtur
    $('#enQuick').onclick = () => guard($('#enQuick'), () => OkeyRooms.quickAuto(V));
    const bindRooms = () => $$('#olRooms [data-room]').forEach(b => b.onclick = (e) => { e.stopPropagation(); Sound.play('click'); const room = OkeyRooms.roomByStake(b.dataset.room); if (room) OkeyRooms.roomDialog(V, room); });
    bindRooms();
    $$('[data-rz]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); const rmin = (OkeyRooms.roomByStake(10000) || { min: 30000 }).min; if (!me().unlimited && me().balance < rmin) return OkeyRooms.lockedDialog({ name: 'RİZİKOLU', sub: 'MASA', min: rmin }); Okey.quickOpts(V, 10000, { players: +b.dataset.rz, risk: true }); });
    $('#olPriv').onclick = (e) => { e.stopPropagation(); Okey.createPrivate(V); };
    $('#olCode').onclick = (e) => { e.stopPropagation(); Okey.codeModal(); };
    $('#olOpen').onclick = (e) => { e.stopPropagation(); UI.modal(`<h3 class="gold">🟢 Açık Masalar</h3><div class="list" id="olOpenL"><p class="small muted center">Yükleniyor…</p></div>`); Okey.openTables($('#olOpenL'), V); };
    $$('[data-y]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); b.dataset.y === 'rules' ? Okey.rulesModal() : Okey.topModal(); });
    $$('[data-ev]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); Platform.panel(b.dataset.ev); });
    try {
      const d = await Okey.lobbyData(true); if (E.cur !== id) return;
      const act = $('#enAct');
      if (d.active) { act.innerHTML = `<div class="enresume"><b>Devam eden masan var</b><button class="enbtn green" id="enRes">MASAYA DÖN ▸</button></div>`; $('#enRes').onclick = () => Okey.openTable(d.active.id); }
      else if (d.rejoin) { act.innerHTML = `<div class="enresume warn"><b>Ayrıldığın masa sürüyor</b><button class="enbtn gold" id="enRej">GERİ DÖN ▸</button></div>`; $('#enRej').onclick = () => guard($('#enRej'), async () => { const r = await Api.post('/api/okey/join', { tableId: d.rejoin.id }); Okey.openTable(r.tableId); }); }
      OkeyRooms.mergeServer(d); const rr = $('#olRooms'); if (rr) { const keep = [...rr.querySelectorAll('.orc:not([data-room])')]; rr.innerHTML = OkeyRooms.cardsHtml(V); keep.forEach(k => rr.appendChild(k)); bindRooms(); }
      $('#olOnline').innerHTML = d.autoStake ? `<span>Jetonuna uygun oda</span>: <b>${esc((OkeyRooms.roomByStake(d.autoStake) || {}).name || '')}</b> · ${d.online.players} oyuncu masada` : `Oynamak için en az ${fmt(d.minPlay || 3500)} jeton gerekir`;
    } catch (e) { /* */ }
  }

  /* ===================== TAVLA ===================== */
  async function tavla() {
    let pts = +(localStorage.getItem('tavla_points') || 1);
    const scene = `<div class="enscene tv">
        <div class="tvchair l"><span class="enav">${AVATARS[me().avatar] || UI.AVATARS[0]}</span><b>${esc(me().username || '')}</b><small>Beyaz pullar</small></div>
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
    const feat = games.find(g => g.id === 'zeus') || games[0];
    const last = localStorage.getItem('slot_last') || 'zeus';
    const poster = (g, big) => { const t = th(g.id); const img = big && g.id === 'zeus' ? 'hero_zeus' : (t.card || 'card_' + g.id);
      return `<button class="spo ${big ? 'big' : ''}" data-g="${g.id}" style="--b1:${t.b1 || '#2a0d5e'};--b2:${t.b2 || '#5a2bb0'};--gl:${t.glow || '#ffd34d'}"><img src="assets/${img}.webp" alt="">
        ${big ? '<span class="sporib">YENİ</span>' : ''}<span class="spon"><b>${esc(g.name)}</b><small>RTP %${(g.info.rtp * 100).toFixed(1)} · ${esc(g.info.volatility || '')}</small></span><i class="spoh">♥</i></button>`; };
    const rest = games.filter(g => g !== feat);
    const root = show('slots', `<div class="slhall"></div>
      <div class="sltop"><button class="enback" data-x="back">◀</button><span class="slvip">VIP</span><div class="encoin" data-x="shop"><i class="hcoin"></i><b id="enBal">${balTxt()}</b><span class="hplus">+</span></div>
        <button class="slshop" data-x="shop">MAĞAZA</button><button class="slpack" data-ev="gifts">HEDİYE</button><div class="grow"></div>
        <div class="sllvl">⭐<b>Sv.${me().level || 1}</b></div><button class="slic" data-ev="messages">✉️</button><button class="slic" data-ev="settings">⚙️</button></div>
      <div class="slrail">${CATS.map(([k, n], i) => `<button data-c="${k}" class="${k === cat ? 'on' : ''}" title="${n}">${['🏠', '💧', '🍒', '💰', '🛣️'][i]}<small>${n.split(' ')[0]}</small></button>`).join('')}</div>
      <div class="slshow">${feat && cat === 'all' ? poster(feat, true) : ''}<div class="slgrid2">${(cat === 'all' ? rest : games).map(g => poster(g)).join('') || '<p class="center muted">Bu kategoride oyun yok.</p>'}</div></div>
      <div class="slticker">💬 <span id="slTick">Hoş geldin! Büyük kazançlar burada görünür.</span></div>
      <div class="slbot"><button class="slcoins" data-ev="daily"><img src="assets/fx_coins.webp" alt=""><b>TOPLA</b></button>
        ${[['quests', '📋', 'Görev'], ['daily', '📅', 'Günlük Giriş'], ['tournaments', '🏆', 'Turnuva'], ['friends', '👥', 'Arkadaşlar'], ['gifts', '🎁', 'Hediye'], ['leaders', '📊', 'Sıralama'], ['wheel', '🎡', 'Şans Çarkı']].map(([k, ic, t]) => `<button class="slb" data-ev="${k}"><span>${ic}</span><small>${t}</small></button>`).join('')}
        <button class="slgo" data-g="${last}"><b>HEMEN<br>OYNA</b></button></div>`, 'en-slots');
    $$('[data-c]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); Sound.play('click'); slots(b.dataset.c); });
    $$('[data-g]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); Sound.play('click'); try { localStorage.setItem('slot_last', b.dataset.g); } catch (x) { /* */ } Games.open(b.dataset.g, b); });
    $$('[data-ev]', root).forEach(b => b.onclick = (e) => { e.stopPropagation(); Sound.play('click'); const k = b.dataset.ev; if (k === 'daily') return Screens.dailyModal(); if (k === 'settings') return Screens.settings(); Platform.panel(k); });
    Api.get('/api/winners/recent').then(r => { const t = $('#slTick'); if (!t || !r.winners.length) return; let i = 0; const nm = Object.fromEntries((App.games || []).map(g => [g.id, g.name]));
      const f = () => { const w = r.winners[i++ % r.winners.length]; const el = $('#slTick'); if (!el) return clearInterval(E.tick); el.textContent = `${w.username} · ${nm[w.game] || w.game} · ${fmt(w.win)} jeton kazandı (${Math.round(w.win / w.bet)}x)`; };
      f(); clearInterval(E.tick); E.tick = setInterval(f, 4000); }).catch(() => {});
  }

  function open(id) {
    Sound.theme(id === 'slots' ? 'slot' : (id === 'tavla' ? 'tavla' : (id === 'aviator' ? 'aviator' : (/okey|duz/.test(id) ? 'okey' : 'hall'))));
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
