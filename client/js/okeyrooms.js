/* SPINOVA 101 OKEY / DÜZ OKEY — ODALAR (5.0.26)
 * Kademeli odalar: her odanın bahsi ve "en az jeton" şartı vardır (sunucu da aynı kuralı uygular).
 * Akış: oda kartı → oda bilgisi penceresi → odanın masa listesi (boş koltuğa OTUR) → Masa Aç / Hemen Oyna / Masa Filtrele.
 * Çipi yetmeyen oyuncu "Yetersiz çip" penceresi görür ve mağazaya yönlendirilir. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, toast, guard, AVATARS } = UI;
  const me = () => App.me || {};
  // stake, ad, alt başlık, sınıf, taş görseli
  const ROOMS = [
    { stake: 1000, min: 3500, name: 'KLASİK', sub: 'ODALAR', k: 'cl', art: [[0, 1], [2, 1]] },
    { stake: 5000, min: 15000, name: 'ÇAYLAK', sub: 'MASALARI', k: 'cy', art: [[2, 5], [0, 1]] },
    { stake: 10000, min: 30000, name: 'USTA', sub: 'MASALARI', k: 'us', art: [[1, 7], [1, 8], [1, 9]] },
    { stake: 100000, min: 300000, name: 'SALON', sub: 'MASALARI', k: 'sa', art: [[3, 13], [0, 13], [2, 13]] },
    { stake: 1000000, min: 3000000, name: 'KRAL', sub: 'MASALARI', k: 'kr', art: [[0, 1], [3, 1]], crown: true },
    { stake: 5000000, min: 15000000, name: 'VIP KULÜP', sub: 'ÖZEL ODA', k: 'vk', art: [], star: true },
  ];
  const R = { variant: '101', room: null, timer: null, filter: 'all', data: null };
  const tile = (c, n) => `<div class="otile c${c} rt"><span>${n}</span><b class="od"></b></div>`;
  const canEnter = (room) => me().unlimited || (me().balance || 0) >= room.min;
  const roomByStake = (st) => ROOMS.find(r => r.stake === Number(st));
  function mergeServer(d) { // sunucunun oda listesiyle (en az jeton, çevrim içi) eşitle
    if (!d || !d.rooms) return;
    for (const s of d.rooms) { const r = roomByStake(s.stake); if (r) { r.min = s.min; r.players = s.players; r.tables = s.tables; } }
  }
  function cardsHtml(V) {
    return ROOMS.map(r => { const ok = canEnter(r);
      return `<div class="orc ${r.k} ${ok ? '' : 'dis'}" data-room="${r.stake}"><div class="rch"><b>${r.name}</b><small>${r.sub}</small></div>
        <div class="rca">${r.crown ? '<span class="rkcrown">👑</span>' : ''}${r.star ? '<span class="rkstar">★</span>' : ''}${r.art.map(t => tile(t[0], t[1])).join('')}</div>
        <div class="rcn" id="orn${r.stake}"><span class="ron">${r.players ? fmt(r.players) + ' çevrim içi' : ''}</span><b>Giriş ${fmt(r.stake)}</b><small>en az ${fmt(r.min)}</small></div>
        <div class="rcb"><button class="orbtn" data-room="${r.stake}">${ok ? 'KATIL' : '🔒 KİLİTLİ'}</button></div></div>`; }).join('');
  }
  /* ---------- pencereler ---------- */
  function lockedDialog(room) {
    UI.modal(`<div class="rdlg"><div class="rdh">${room.name} ${room.sub}</div>
      <div class="rdbody center"><div style="font-size:42px">🔒</div><div class="rdbad">YETERSİZ ÇİP</div>
      <p>Bu odaya girmek için en az <b class="gold">${fmt(room.min)}</b> jeton gerekiyor.<br><small class="muted">Jetonun: ${fmt(me().balance || 0)}</small></p>
      <button class="rdbuy" id="rdBuy">🛒 ÇİP AL</button></div></div>`, { cls: 'rdm', onOpen() { $('#rdBuy').onclick = () => { UI.closeModal(); Platform.panel('shop'); }; } });
  }
  function roomDialog(V, room) {
    if (!canEnter(room)) return lockedDialog(room);
    UI.modal(`<div class="rdlg"><div class="rdh">${room.name} ${room.sub}<small>${room.players != null ? fmt(room.players) + ' çevrim içi · ' + fmt(room.tables || 0) + ' masa' : ''}</small></div>
      <div class="rdbody">
        <div class="rdrow"><span>Bahis</span><b><i class="hcoin"></i> ${fmt(room.stake)}</b></div>
        <div class="rdrow"><span>El sayısı</span><b>1 – 4 El</b></div>
        <div class="rdrow"><span>En az jeton</span><b>${fmt(room.min)}</b></div>
        <div class="rdrow"><span>Oyun</span><b>${V === 'duz' ? 'Düz Okey' : '101 Okey'} · Tek / Eşli</b></div>
        <div class="rdbtns"><button class="rdx" id="rdNo">✕</button><button class="rdok" id="rdYes">✓</button></div>
      </div></div>`, { cls: 'rdm', onOpen() { $('#rdNo').onclick = () => UI.closeModal(); $('#rdYes').onclick = () => { UI.closeModal(); roomView(V, room); }; } });
  }
  /* ---------- Masa Aç: oklu ayar seçicileri ---------- */
  const SEL = [
    ['mode', 'Oyun', [['tekli', 'Tek'], ['esli', 'Eşli']]],
    ['helper', 'Yardım', [[true, 'Yardımlı'], [false, 'Yardımsız']]],
    ['katlamali', 'Katlama', [[true, 'Katlamalı'], [false, 'Katlamasız']]],
    ['rounds', 'El sayısı', [[1, '1 El'], [2, '2 El'], [3, '3 El'], [4, '4 El']]],
  ];
  function loadOpts() { let o = { mode: 'tekli', rounds: 1, katlamali: true, helper: true }; try { o = Object.assign(o, JSON.parse(localStorage.getItem('okey_opts')) || {}); } catch (e) { /* */ } return o; }
  function createDialog(V, room, onDone) {
    const o = loadOpts(); const rows = SEL.filter(s => !(V === 'duz' && s[0] === 'katlamali'));
    const val = (k) => { const s = SEL.find(x => x[0] === k); const i = s[2].findIndex(v => v[0] === o[k]); return s[2][i < 0 ? 0 : i]; };
    UI.modal(`<div class="rdlg"><div class="rdh">MASA AÇ<small>${room.name} ${room.sub} · bahis ${fmt(room.stake)}</small></div><div class="rdbody">
      ${rows.map(([k, lbl]) => `<div class="rdrow"><span>${lbl}</span><span class="rdsel"><button class="rda" data-k="${k}" data-d="-1">◀</button><b class="rdv ${k}" id="rdv_${k}"></b><button class="rda" data-k="${k}" data-d="1">▶</button></span></div>`).join('')}
      <div class="rdbtns"><button class="rdx" id="rdNo">✕</button><button class="rdok" id="rdYes">✓</button></div></div></div>`, {
      cls: 'rdm',
      onOpen(m) {
        const paint = () => rows.forEach(([k]) => { const e = $('#rdv_' + k); const v = val(k); e.textContent = v[1]; e.classList.toggle('on', v[0] === true || v[0] === 'esli'); e.classList.toggle('off', v[0] === false); });
        $$('.rda', m).forEach(b => b.onclick = () => { const s = SEL.find(x => x[0] === b.dataset.k); let i = s[2].findIndex(v => v[0] === o[s[0]]); i = (i + +b.dataset.d + s[2].length) % s[2].length; o[s[0]] = s[2][i][0]; Sound.play('click'); paint(); });
        paint();
        $('#rdNo').onclick = () => UI.closeModal();
        $('#rdYes').onclick = () => guard($('#rdYes'), async () => {
          localStorage.setItem('okey_opts', JSON.stringify(o));
          const r = await Api.post('/api/okey/private', { ...o, variant: V, stake: room.stake, public: true });
          UI.closeModal(); stop(); Okey.openTable(r.tableId); if (onDone) onDone();
        });
      },
    });
  }
  /* ---------- odanın masa listesi ---------- */
  const FILTERS = [['all', 'Tümü'], ['tekli', 'Tek'], ['esli', 'Eşli'], ['r1', '1 El'], ['r2', '2+ El'], ['help', 'Yardımlı'], ['nohelp', 'Yardımsız']];
  const passes = (t) => { const f = R.filter; return f === 'all' || (f === 'tekli' && t.mode === 'tekli') || (f === 'esli' && t.mode === 'esli') || (f === 'r1' && t.rounds === 1) || (f === 'r2' && t.rounds > 1) || (f === 'help' && t.helper) || (f === 'nohelp' && !t.helper); };
  function stop() { clearInterval(R.timer); R.timer = null; }
  function tableHtml(t) {
    const P = [[50, 0], [100, 50], [50, 100], [0, 50]]; // üst, sağ, alt, sol (%)
    const seats = (t.seats || []).map((x, i) => { if (t.players === 2 && (i === 1 || i === 3)) return '';
      const [l, tp] = P[i]; const pos = `left:${l}%;top:${tp}%`;
      return x ? `<div class="rts p" style="${pos}"><span class="rtav">${x.bot ? '🤖' : (AVATARS[x.avatar] || UI.AVATARS[0])}</span><em>${esc(x.name)}</em></div>`
        : `<button class="rts free" style="${pos}" data-t="${t.id}" data-s="${i}" ${t.locked ? 'data-lk="1"' : ''}>OTUR</button>`; }).join('');
    return `<div class="rtbl"><div class="rtoval"><div class="rtbad"><span>${t.mode === 'esli' ? 'Eşli' : 'Tek'}</span><span>${t.rounds} El</span><span class="${t.helper ? 'g' : 'r'}">${t.helper ? 'Yardımlı' : 'Yardımsız'}</span>${R.variant === 'duz' ? '' : `<span class="${t.katlamali ? 'r' : 'g'}">${t.katlamali ? 'Katlamalı' : 'Katlamasız'}</span>`}</div></div>
      <div class="rtstake"><i class="hcoin"></i>${fmt(t.stake)}${t.locked ? ' 🔒' : ''}</div>${seats}</div>`;
  }
  async function refresh() {
    const el = $('#rvList'); if (!el) return stop();
    let d; try { d = await Api.get(`/api/okey/tables?variant=${R.variant === 'duz' ? 'duz' : '101'}&stake=${R.room.stake}`); } catch (e) { return; }
    if (!document.body.contains(el)) return stop();
    const list = d.tables.filter(t => Number(t.stake) === R.room.stake).filter(t => !t.private || t.locked).filter(passes);
    el.innerHTML = list.length ? list.map(tableHtml).join('') : `<div class="rvempty">Bu odada şu an boş koltuklu masa yok.<br><b>HEMEN OYNA</b> ile otomatik eşleş ya da <b>MASA AÇ</b>.</div>`;
    $$('.rts.free', el).forEach(b => b.onclick = () => guard(b, async () => {
      const body = { tableId: +b.dataset.t, seat: +b.dataset.s };
      if (b.dataset.lk === '1') { const pw = await Platform.askText('🔒 Şifreli masa', 'Masa şifresi'); if (!pw) return; body.password = pw; }
      const r = await Api.post('/api/okey/join', body); stop(); Okey.openTable(r.tableId);
    }));
  }
  function roomView(V, room) {
    R.variant = V; R.room = room; R.filter = 'all';
    UI.screen('entry', `<div class="en en-rv ${V === 'duz' ? 'duz' : ''}">
      <div class="rvtop"><button class="enback" id="rvBack">◀</button><b class="rvt">${room.name} ${room.sub}</b><small class="rvon">${room.players != null ? '● ' + fmt(room.players) + ' çevrim içi' : ''} · bahis ${fmt(room.stake)} · en az ${fmt(room.min)}</small>
        <div class="grow"></div><div class="encoin" id="rvShop"><i class="hcoin"></i><b>${me().unlimited ? '∞' : fmt(me().balance || 0)}</b><span class="hplus">+</span></div></div>
      <div class="rvfil" id="rvFil">${FILTERS.map(([k, n]) => `<button data-f="${k}" class="${k === 'all' ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="rvlist" id="rvList"><div class="rvempty">Masalar yükleniyor…</div></div>
      <div class="rvbar"><button class="rvb o" id="rvNew">＋ MASA AÇ</button><button class="rvb g" id="rvQuick">HEMEN OYNA</button><button class="rvb" id="rvFilBtn">🔍 MASA FİLTRELE</button></div></div>`);
    UI.show('entry'); Platform.setCurrent('entry:okroom');
    $('#rvBack').onclick = () => { stop(); Entry.open(V === 'duz' ? 'duz' : 'okey101'); };
    $('#rvShop').onclick = () => Platform.panel('shop');
    $('#rvNew').onclick = () => createDialog(V, room);
    $('#rvFilBtn').onclick = () => { const f = $('#rvFil'); f.classList.toggle('show'); };
    $$('[data-f]').forEach(b => b.onclick = () => { R.filter = b.dataset.f; $$('[data-f]').forEach(x => x.classList.toggle('on', x === b)); refresh(); });
    $('#rvQuick').onclick = () => guard($('#rvQuick'), async () => {
      const r = await Api.post('/api/okey/quick', { ...loadOpts(), variant: V, stake: room.stake }); stop(); if (r.existing) toast('Zaten bir masadasın — oraya dönüyorsun.'); Okey.openTable(r.tableId);
    });
    stop(); refresh(); R.timer = setInterval(refresh, 4000);
  }
  /* ---------- lobideki HEMEN OYNA: oda jetona göre seçilir ---------- */
  // Sunucu henüz eski sürümdeyse ('auto' tanımıyorsa) odayı uygulama seçer
  function pickLocal() { if (me().unlimited) return 100000; let pick = null; for (const r of ROOMS) if ((me().balance || 0) >= r.min) pick = r.stake; return pick; }
  async function quickAuto(V) {
    let r; try { r = await Api.post('/api/okey/quick', { ...loadOpts(), variant: V, stake: 'auto' }); }
    catch (e) {
      if (e.code === 'insufficient_funds') return lockedDialog({ name: 'HEMEN', sub: 'OYNA', min: 3500 });
      if (!/bad_stake|bad_request|invalid|stake/i.test(String(e.code || '') + e.message)) throw e;
      const st = pickLocal(); if (st == null) return lockedDialog({ name: 'HEMEN', sub: 'OYNA', min: 3500 });
      r = await Api.post('/api/okey/quick', { ...loadOpts(), variant: V, stake: st }); r.stake = st;
    }
    if (r.existing) toast('Zaten bir masadasın — oraya dönüyorsun.');
    else if (r.stake) { const room = roomByStake(r.stake); if (room) toast(`Jetonuna göre: ${room.name} ${room.sub} (bahis ${fmt(room.stake)})`); }
    Okey.openTable(r.tableId);
  }
  window.OkeyRooms = { ROOMS, cardsHtml, mergeServer, roomDialog, lockedDialog, roomView, createDialog, quickAuto, canEnter, roomByStake, stop, isOpen: () => !!R.timer };
})();
