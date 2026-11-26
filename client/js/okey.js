/* 101 OKEY — çevrim içi masa istemcisi (yatay). Kurallar sunucuda; burada yalnızca görüntü ve niyet.
 * İstaka düzeni cihazda saklanır; taşlar her yoklamada sunucudaki ele göre eşitlenir. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, toast, modal, closeModal, guard, AVATARS } = UI;
  const OR = window.OkeyRules;
  const SLOTS = 30, ROWN = 15, W0 = 960, H0 = 440;
  const STAKE_NAMES = { 0: ['Ücretsiz Masa', '🎈'], 1000: ['Bronz Masa', '🥉'], 10000: ['Gümüş Masa', '🥈'], 100000: ['Altın Masa', '🥇'], 1000000: ['Elmas Masa', '💎'] };
  const CHAT = ['Merhaba! 👋', 'Kolay gelsin', 'Hadi bakalım!', 'Güzel hamle 👏', 'Şanslısın 🍀', 'Tebrikler 🎉', 'Biraz hızlı 🙏', 'Teşekkürler 😊', 'Görüşürüz 👋'];
  const SEATCOL = ['#ffd34d', '#7fd8ff', '#ff9ae8', '#7dff6b'];
  const ld = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
  const O = { screen: null, id: null, v: null, seq: -1, slots: new Array(SLOTS).fill(null), slotsKey: null, sel: null, timer: null, tim: null, inflight: null, acting: false,
    opts: Object.assign({ mode: 'tekli', rounds: 1, katlamali: true }, ld('okey_opts', {})), lobbyData: null, rot: false, u: 1, sl: 0, st: 0, drag: null,
    shownRound: 0, shownFinal: false, lastLog: 0, lastChat: 0, pendingSlot: null, fail: 0, sameN: 0, arr: null };

  function setOrient(m) { try { window.AndroidApp && AndroidApp.setOrientation(m); } catch (e) { /* */ } }

  /* ===================== TAŞ GÖRÜNÜMÜ ===================== */
  function tileHtml(id, cls = '', attrs = '') {
    if (id == null) return '';
    const v = O.v && O.v.hand, joker = v && OR.kit(v.okey).isJoker(id);
    if (id >= 104) return `<div class="otile fake ${cls}" data-tile="${id}" ${attrs}><span>♣</span><b class="od"></b></div>`;
    const c = OR.tileColor(id), n = OR.tileNum(id);
    return `<div class="otile c${c} ${joker ? 'jok' : ''} ${cls}" data-tile="${id}" ${attrs}><span>${n}</span><b class="od"></b></div>`;
  }
  const backTile = (cls = '') => `<div class="otile back ${cls}"><span></span></div>`;
  const faceId = (c, n) => (c * 13 + n - 1) * 2;

  /* ===================== LOBİ (dikey) ===================== */
  async function lobby() {
    stopTable(); O.screen = 'lobby'; setOrient('portrait');
    UI.screen('okeyLobby', `<div class="topbar"><button class="iconbtn" id="olBack">◀</button><div class="grow center"><b class="gold" style="font-size:21px;letter-spacing:1px">101 OKEY</b><div class="small muted" id="olOnline">çevrim içi</div></div><div class="pill" id="olCoins">🪙 ${App.me.unlimited ? '∞' : fmt(App.me.balance)}</div></div><div class="scroll nonav" id="olBody"><p class="center muted">Yükleniyor…</p></div>`);
    UI.show('okeyLobby');
    $('#olBack').onclick = () => { O.screen = null; Screens.go('lobby'); };
    try { O.lobbyData = await Api.get('/api/okey/lobby'); } catch (e) { $('#olBody').innerHTML = `<p class="err center">${esc(e.message)}</p><button class="btn gold block" id="olRe">Tekrar dene</button>`; $('#olRe').onclick = lobby; return; }
    renderLobby();
  }
  function renderLobby() {
    const d = O.lobbyData; if (!d || O.screen !== 'lobby') return;
    const cfg = d.config || {}, stakes = d.stakes.filter(st => !cfg.stakes || cfg.stakes.includes(st));
    $('#olOnline').textContent = `🟢 ${d.online.players} oyuncu masada · ${d.online.tables} masa`;
    const waitN = (st) => d.waiting.filter(w => Number(w.stake) === st).reduce((a, w) => a + w.n, 0);
    $('#olBody').innerHTML = `
      ${cfg.enabled === false ? '<div class="notice" style="border:1.5px solid var(--red)">101 Okey şu anda bakımda.</div>' : ''}
      ${d.active ? `<div class="okact"><div class="grow"><b>Devam eden masan var</b><small>${d.active.status === 'waiting' ? 'Oyuncular bekleniyor' : 'Oyun sürüyor'}</small></div><button class="btn green sm" id="olResume">MASAYA DÖN ▶</button></div>` : ''}
      ${d.rejoin ? `<div class="okact warn"><div class="grow"><b>Ayrıldığın masa sürüyor</b><small>Yerine bot oynuyor. Geri dönersen kaldığın yerden devam edersin.</small></div><button class="btn gold sm" id="olRejoin">GERİ DÖN ▶</button></div>` : ''}
      ${d.invites.length ? `<div class="section-t">📨 Masa davetleri</div><div class="list">${d.invites.map(i => `<div class="li"><div class="grow"><b>${esc(i.from_name)}</b> seni masasına çağırıyor<small>${i.mode === 'esli' ? 'Eşli' : 'Tekli'} · ${i.rounds} el · ${Number(i.stake) ? fmt(i.stake) + ' jeton' : 'Ücretsiz'}</small></div><button class="btn green sm" data-inv="${i.table_id}">Katıl</button></div>`).join('')}</div>` : ''}
      <div class="okhero"><div class="tiles">${[[0, 7], [1, 7], [2, 7], [3, 7]].map(([c, n]) => `<div class="otile c${c}"><span>${n}</span><b class="od"></b></div>`).join('')}</div><div><b>Gerçek 101 Okey</b><small>Gerçek oyuncularla eşleş · masa dolmazsa bot oturur · arkadaşlarınla özel oda</small></div></div>
      <div class="section-t">🎲 Masalar <small class="muted" style="font-weight:600">Oyna'ya dokun → oyun seçeneklerini seç</small></div>
      <div class="oktiers">${stakes.map(st => { const [nm, ic] = STAKE_NAMES[st] || [fmt(st), '🎲']; const w = waitN(st); const can = !st || App.me.unlimited || App.me.balance >= st;
        return `<div class="oktier ${can ? '' : 'dis'}"><div class="ic">${ic}</div><div class="grow"><b>${nm}</b><small>${st ? `Giriş ${fmt(st)} · Havuz ${fmt(st * 4)}` : 'Jeton harcanmaz · XP kazanırsın'}</small>${w ? `<small class="okw">⏳ ${w} masada oyuncu bekleniyor</small>` : ''}</div><button class="btn green sm" data-q="${st}" ${can ? '' : 'disabled'}>OYNA</button></div>`; }).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn purple grow" id="olPriv">🔒 Oda Kur</button><button class="btn gold grow" id="olCode">🔑 Kodla Katıl</button></div>
      <div class="card" style="margin-top:12px"><div class="kv small"><b>Oynadığın</b><span>${d.stats.played || 0}</span><b>Kazandığın</b><span>${d.stats.won || 0}</span><b>Okey kazancın</b><span>${fmt(d.stats.coins_won || 0)} 🪙</span></div></div>
      <div class="row"><button class="btn ghost grow sm" id="olTop">🏆 Sıralama</button><button class="btn ghost grow sm" id="olRules">📖 Kurallar</button></div>
      <p class="small muted center">Masa yatay ekranda açılır. Tekli: havuzun %60'ı birinciye, %30'u ikinciye, %10'u üçüncüye. Eşli: kazanan takım paylaşır. Jetonlar sanaldır; nakde çevrilemez.</p>`;
    $$('[data-q]').forEach(b => b.onclick = () => optionsModal('quick', +b.dataset.q));
    $$('[data-inv]').forEach(b => b.onclick = () => guard(b, async () => { const r = await Api.post('/api/okey/join', { tableId: +b.dataset.inv }); openTable(r.tableId); }));
    $('#olResume') && ($('#olResume').onclick = () => openTable(d.active.id));
    $('#olRejoin') && ($('#olRejoin').onclick = () => guard($('#olRejoin'), async () => { const r = await Api.post('/api/okey/join', { tableId: d.rejoin.id }); toast('Masaya geri döndün.'); openTable(r.tableId); }));
    $('#olPriv').onclick = () => optionsModal('private'); $('#olCode').onclick = codeModal; $('#olRules').onclick = rulesModal; $('#olTop').onclick = topModal;
  }
  /** "Oyun Seçenekleri": oyun türü (katlamalı/katlamasız, eşli/tekli) + el sayısı (1–4). Seçim masadaki herkes için aynıdır. */
  function optionsModal(kind, stake) {
    const d = O.lobbyData, cfg = d.config || {}, o = O.opts;
    const allowR = (r) => !cfg.rounds || cfg.rounds.includes(r), allowM = (m) => !cfg.modes || cfg.modes.includes(m), allowK = (k) => !cfg.katlamali || cfg.katlamali.includes(k);
    if (!allowR(o.rounds)) o.rounds = (cfg.rounds || [1])[0]; if (!allowM(o.mode)) o.mode = (cfg.modes || ['tekli'])[0]; if (!allowK(o.katlamali)) o.katlamali = (cfg.katlamali || [true])[0];
    const stakes = d.stakes.filter(st => !cfg.stakes || cfg.stakes.includes(st));
    let st = stake != null ? stake : stakes[0];
    modal(`<div class="okopt"><div class="okopt-h">Oyun Seçenekleri</div>
      <div class="okopt-cols"><div><div class="okopt-t">Oyun Türü</div>
        <button class="okob" data-k="1" ${allowK(true) ? '' : 'disabled'}>Katlamalı</button><button class="okob" data-k="0" ${allowK(false) ? '' : 'disabled'}>Katlamasız</button>
        <button class="okob" data-m="esli" ${allowM('esli') ? '' : 'disabled'}>Eşli</button><button class="okob" data-m="tekli" ${allowM('tekli') ? '' : 'disabled'}>Tekli</button></div>
      <div><div class="okopt-t">El Sayısı</div>${[1, 2, 3, 4].map(r => `<button class="okob" data-r="${r}" ${allowR(r) ? '' : 'disabled'}>${r} El</button>`).join('')}</div></div>
      ${kind === 'private' ? `<div class="okopt-t" style="margin-top:8px">Masa</div><div class="okstk">${stakes.map(x => `<button class="okob sm" data-s="${x}">${(STAKE_NAMES[x] || ['', '🎲'])[1]} ${x ? fmt(x) : 'Ücretsiz'}</button>`).join('')}</div>`
        : `<p class="small center" style="margin:8px 0 0">${(STAKE_NAMES[st] || [''])[1]} <b>${(STAKE_NAMES[st] || [fmt(st)])[0]}</b> · ${st ? 'giriş ' + fmt(st) + ' jeton' : 'ücretsiz'}</p>`}
      <p class="small muted center" id="okoDesc" style="margin:6px 0"></p>
      <button class="okgo" id="okoGo">${kind === 'private' ? 'Odayı Oluştur' : 'Masaya Otur'}</button></div>`, {
      cls: 'okoptm',
      onOpen(m) {
        const paint = () => {
          $$('[data-k]', m).forEach(b => b.classList.toggle('on', (b.dataset.k === '1') === o.katlamali));
          $$('[data-m]', m).forEach(b => b.classList.toggle('on', b.dataset.m === o.mode));
          $$('[data-r]', m).forEach(b => b.classList.toggle('on', +b.dataset.r === o.rounds));
          $$('[data-s]', m).forEach(b => b.classList.toggle('on', +b.dataset.s === st));
          $('#okoDesc').textContent = `${o.mode === 'esli' ? 'Eşli: karşılıklı oturanlar takım' : 'Tekli: herkes kendi için'} · ${o.katlamali ? 'Katlamalı: her açan bir öncekini geçmeli' : 'Katlamasız: açma sınırı hep 101 / 5 çift'} · ${o.rounds} el sonunda en düşük puan kazanır`;
          sv('okey_opts', o);
        };
        $$('[data-k]', m).forEach(b => b.onclick = () => { o.katlamali = b.dataset.k === '1'; paint(); });
        $$('[data-m]', m).forEach(b => b.onclick = () => { o.mode = b.dataset.m; paint(); });
        $$('[data-r]', m).forEach(b => b.onclick = () => { o.rounds = +b.dataset.r; paint(); });
        $$('[data-s]', m).forEach(b => b.onclick = () => { st = +b.dataset.s; paint(); });
        paint();
        $('#okoGo').onclick = () => guard($('#okoGo'), async () => {
          const r = await Api.post(kind === 'private' ? '/api/okey/private' : '/api/okey/quick', { ...o, stake: st });
          closeModal(); if (r.existing) toast('Zaten bir masadasın — oraya dönüyorsun.'); openTable(r.tableId);
        });
      },
    });
  }
  function codeModal() {
    modal(`<h3 class="gold">🔑 Kodla Katıl</h3><label class="field"><span>Masa kodu (6 karakter)</span><input id="okCode" maxlength="6" style="text-transform:uppercase;letter-spacing:4px;font-size:22px;text-align:center"></label><button class="btn green block" id="okCodeGo">MASAYA OTUR</button>`, {
      onOpen() { $('#okCode').focus(); $('#okCodeGo').onclick = () => guard($('#okCodeGo'), async () => { const r = await Api.post('/api/okey/join', { code: $('#okCode').value.trim() }); closeModal(); openTable(r.tableId); }); },
    });
  }
  async function topModal() {
    const r = await Api.get('/api/okey/leaderboard').catch(() => ({ top: [] }));
    modal(`<h3 class="gold">🏆 101 Okey Sıralaması</h3><div class="list">${r.top.map((x, i) => `<div class="li"><b style="width:26px">${i + 1}.</b><span class="avatar" style="width:34px;height:34px;font-size:18px">${AVATARS[x.avatar] || '🙂'}</span><div class="grow"><b>${esc(x.username)}</b><small>${x.played} oyun · ${x.won} galibiyet</small></div><span class="gold">${fmt(x.coins_won)}</span></div>`).join('') || '<p class="center muted">Henüz oyun yok.</p>'}</div>`);
  }
  function rulesModal() {
    modal(`<h3 class="gold">📖 101 Okey Kuralları</h3><div class="small okrules">
      <p><b>Taşlar:</b> 4 renk (kırmızı, sarı, mavi, siyah) × 1–13, her taştan 2 tane + 2 sahte okey (♣) = 106 taş. Başlayan 22, diğerleri 21 taş alır.</p>
      <p><b>Gösterge ve okey:</b> Göstergenin aynı renkte bir büyüğü okeydir (13 → 1). Okey her taşın yerine geçer. Sahte okey (♣) okeyin kendisi yerine sayılır.</p>
      <p><b>Per:</b> Seri = aynı renk ardışık en az 3 taş (1-2-3 geçerli, 12-13-1 geçersiz). Aynı sayı = farklı renklerde 3 ya da 4 taş. Çift = birebir aynı iki taş.</p>
      <p><b>Sıra:</b> Ortadan taş çek ya da solundakinin attığı son taşı al, sonra bir taş at. Yandan aldığın taşı o el açışında/işlemede kullanmalısın; kullanmayacaksan masaya bir şey koymadan geri bırakabilirsin.</p>
      <p><b>Butonlar:</b> <b>Seri Diz / Çift Diz</b> taşlarını otomatik dizer. <b>Seri Aç</b> perlerle (en az 101), <b>Çift Aç</b> çiftlerle (en az 5) açar; açtıktan sonra yeni per/çift koyar. <b>Taş İşle</b> seçili taşı (seçili yoksa işlenebilen tüm taşları) masadaki perlere ekler, mümkünse masadaki okeyi alır. <b>Topla</b> bu tur masaya koyduğun taşları ıstakana geri toplar (taş atmadan önce).</p>
      <p><b>El açma:</b> Perlerinin toplamı en az <b>101</b> ya da en az <b>5 çift</b>. <b>Katlamalıda</b> her açan, rakiplerin en yüksek açışından fazlasını açmalı; <b>katlamasızda</b> sınır hep 101 / 5 çifttir. 150+ sayı ya da 7+ çiftle açmak <b>−101</b> ödül (siler).</p>
      <p><b>İşleme:</b> Açtıktan sonra masadaki her pere taş ekleyebilirsin. Çiftle açan yalnızca çift koyabilir, ama işleyebilir. Masadaki okeyi, yerine geçtiği gerçek taşla değiştirip alabilirsin (perde 4 renk tamamsa); okeyi koyan 101 ceza yer.</p>
      <p><b>Cezalar:</b> Okey atmak +101 · işlenebilir taş atmak +101 · attığın taşla sonraki oyuncu açarsa taş değeri ×10 (çiftte ×20).</p>
      <p><b>Bitirme:</b> Tüm taşlarını dizip son taşını atan biter: −101. Okey atarak bitirmek −202, çiftle bitirmek −202 (okeyle −404), kimse açmadan tek turda açıp bitirmek (elden) −202.</p>
      <p><b>Kalanlar:</b> Açmayan 202 (okeyle/çiftle bitişte 404, ikisi birden 808; elden bitişte 404/808). Açan: elinde kalan taşların toplamı (çiftle açtıysa ×2), elde kalan her okey +101. Eşlide bitenin eşi 0 alır.</p>
      <p><b>Deste biterse:</b> Kimse açmadıysa el sayılmaz; açan varsa herkes elindekine göre ceza alır.</p>
      <p><b>Kazanan:</b> Seçilen el sayısı (1–4) sonunda en düşük puan (eşlide takım toplamı).</p></div>`);
  }

  /* ===================== MASA (yatay) ===================== */
  function root() { let r = $('#okeyRoot'); if (!r) { r = document.createElement('div'); r.id = 'okeyRoot'; document.body.appendChild(r); } return r; }
  function stopTable() {
    clearTimeout(O.timer); clearInterval(O.tim); O.timer = O.tim = null;
    const r = $('#okeyRoot'); if (r) { r.classList.remove('show'); r.innerHTML = ''; }
    document.body.classList.remove('okey-on'); window.removeEventListener('resize', layout);
  }
  async function openTable(id) {
    closeModal(); O.id = id; O.screen = 'table'; O.v = null; O.seq = -1; O.sel = null; O.slotsKey = null; O.shownRound = 0; O.shownFinal = false; O.lastLog = 0; O.lastChat = 0; O.fail = 0; O.sameN = 0; O.arr = null;
    setOrient('landscape'); Sound.stopMusic();
    const r = root(); r.className = 'show'; document.body.classList.add('okey-on');
    r.innerHTML = `<div id="okStage" class="okstage">
      <div class="okbg"></div>
      <div class="okhead">
        <button class="okexit" id="okLeave">⟵ ÇIK</button>
        <div class="okpill"><i class="okcoin"></i><b id="okBal"></b></div>
        <div class="okpill"><i>⏱</i><b id="okClock">—</b></div>
        <div class="okseat top" data-pos="2"></div>
        <div class="grow"></div>
        <button class="okic" id="okChat" title="Sohbet">💬</button>
        <button class="okbuy" id="okBuy">$ SATIN AL</button>
        <button class="okic" id="okMenu" title="Menü">▾</button>
      </div>
      <div class="okarea"><div class="okmark"><b>101</b><span>OKEY</span></div><div class="okinfo" id="okInfo"></div><div class="okmelds" id="okMelds"></div><div class="okstatus" id="okStatus"></div></div>
      <div class="okseat side" data-pos="3"></div><div class="okseat side right" data-pos="1"></div>
      <div class="okdisc" data-dpos="2"></div><div class="okdisc" data-dpos="1"></div><div class="okdisc" data-dpos="3" data-zone="take"></div><div class="okdisc mine" data-dpos="0" data-zone="discard"></div>
      <div class="okcol" id="okCol">
        <button class="okcb" id="okRuns">Seri Diz</button><button class="okcb" id="okPairs">Çift Diz</button>
        <button class="okcb" id="okOpenRun">Seri Aç</button><button class="okcb" id="okOpenPair">Çift Aç</button>
        <button class="okcb" id="okCommit">Taş İşle</button><button class="okcb" id="okUndo">Topla</button>
      </div>
      <div class="okpile" id="okPile" data-zone="pile"></div>
      <div class="okseat me" data-pos="0"></div>
      <div class="okrack" id="okRack"></div>
      <div class="okwait hidden" id="okWait"></div>
      <div class="oknet hidden" id="okNet"></div>
      <div class="okbubbles" id="okBubbles"></div>
    </div>`;
    layout(); window.addEventListener('resize', layout);
    setTimeout(layout, 400); setTimeout(layout, 1200); // Android yön değişimi gecikmeli gelir
    $('#okLeave').onclick = leaveTable; $('#okChat').onclick = chatModal; $('#okMenu').onclick = menuModal; $('#okBuy').onclick = buyModal;
    $('#okRuns').onclick = () => arrangeRuns(true); $('#okPairs').onclick = () => arrangePairs(true);
    $('#okOpenRun').onclick = () => openWith('points'); $('#okOpenPair').onclick = () => openWith('pairs');
    $('#okCommit').onclick = commitTiles; $('#okUndo').onclick = undoTurn;
    bindPointer();
    await poll(true);
    loop();
    O.tim = setInterval(timers, 250);
  }
  /** Yoklama döngüsü: değişiklik yoksa seyrekleşir, bağlantı koparsa artan aralıkla dener (oyun donmaz). */
  function loop() {
    clearTimeout(O.timer); if (O.screen !== 'table') return;
    let ms = 1000;
    if (O.fail) ms = Math.min(8000, 1000 * Math.pow(2, O.fail));
    else if (O.v && O.v.status === 'playing' && !myTurn() && O.sameN > 6) ms = 1600;
    else if (O.v && O.v.status === 'finished') ms = 5000;
    O.timer = setTimeout(async () => { if (!document.hidden) await poll(false); loop(); }, ms);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && O.screen === 'table') { poll(true); loop(); } });
  function layout() {
    const r = $('#okeyRoot'); if (!r || !r.classList.contains('show')) return;
    const W = innerWidth, H = innerHeight; O.rot = H > W * 1.05;
    const w = O.rot ? H : W, h = O.rot ? W : H;
    Object.assign(r.style, { width: w + 'px', height: h + 'px', transform: O.rot ? `translateX(${W}px) rotate(90deg)` : 'none' });
    O.u = Math.min(w / W0, h / H0); O.sl = (w - W0 * O.u) / 2; O.st = (h - H0 * O.u) / 2;
    const s = $('#okStage'); Object.assign(s.style, { transform: `translate(${O.sl}px,${O.st}px) scale(${O.u})` });
  }
  const toLocal = (cx, cy) => { let x = cx, y = cy; if (O.rot) { x = cy; y = innerWidth - cx; } return { x: (x - O.sl) / O.u, y: (y - O.st) / O.u }; };

  async function poll(force) {
    if (O.screen !== 'table') return;
    if (O.inflight) { if (!force) return; await O.inflight; if (O.screen !== 'table') return; } // hamleden sonra mutlaka taze durum
    let done; O.inflight = new Promise(r => { done = r; });
    try {
      const r = await Api.get(`/api/okey/${O.id}?seq=${force ? -1 : O.seq}`);
      if (O.screen !== 'table') return;
      if (O.fail) { O.fail = 0; netBanner(false); toast('Bağlantı geri geldi.'); force = true; }
      if (r.same) { O.sameN++; if (O.v) { O.v.deadline = r.deadline; O.skew = Date.now() - r.now; } }
      else { O.sameN = 0; apply(r); }
    } catch (e) {
      if (e.status === 404) { toast(e.message, true); lobby(); }
      else if (!e.status || e.code === 'network' || e.status >= 500) { O.fail++; if (O.fail >= 2) netBanner(true); }
    } finally { O.inflight = null; done(); }
  }
  function netBanner(on) {
    const n = $('#okNet'); if (!n) return;
    n.classList.toggle('hidden', !on);
    if (on) n.innerHTML = `<b>Bağlantı koptu</b><span>Yeniden bağlanılıyor… Masan ve taşların sunucuda güvende; sıran gelirse süre dolunca senin yerine otomatik oynanır.</span><button class="okbtn2" id="okNetRe">Şimdi dene</button>`;
    const b = $('#okNetRe'); b && (b.onclick = () => { O.fail = 1; poll(true).then(loop); });
  }
  function apply(v) {
    const prev = O.v; O.v = v; O.seq = v.seq; O.skew = Date.now() - v.now;
    if (v.hand) syncRack();
    events(prev, v);
    render();
    if (v.status === 'round_end' && v.hand && v.hand.result && O.shownRound !== v.round) { O.shownRound = v.round; roundModal(v); }
    if (v.status === 'finished' && !O.shownFinal) { O.shownFinal = true; if (v.hand && v.hand.result && O.shownRound !== v.round) { O.shownRound = v.round; roundModal(v, true); } else finalModal(v); }
    if (v.status === 'abandoned') { toast('Masa kapandı.'); lobby(); }
    if (v.me != null && v.seats[v.me] && v.seats[v.me].left) { toast('Masadan ayrıldın.'); lobby(); }
  }
  const pos = (s) => (O.v.me == null ? s : (s - O.v.me + 4) % 4);
  const seatAt = (p) => (O.v.me == null ? p : (O.v.me + p) % 4);
  const myTurn = () => O.v && O.v.status === 'playing' && O.v.hand && O.v.hand.turn === O.v.me;
  const playPhase = () => myTurn() && O.v.hand.phase === 'play';

  /* ---------- istaka eşitleme ---------- */
  function syncRack() {
    const H = O.v.hand, key = `okr2_${O.id}_${O.v.round}`;
    if (O.slotsKey !== key) {
      O.slotsKey = key; const saved = ld(key, null);
      O.slots = Array.isArray(saved) && saved.length === SLOTS ? saved : new Array(SLOTS).fill(null);
      if (!Array.isArray(saved) || saved.length !== SLOTS) { arrangeSort(H.rack || []); return; }
    }
    const rack = (H.rack || []).slice(), have = new Set(rack);
    O.slots = O.slots.map(id => (id != null && have.has(id) ? id : null));
    const placed = new Set(O.slots.filter(x => x != null));
    for (const id of rack) {
      if (placed.has(id)) continue;
      let at = O.pendingSlot != null && O.slots[O.pendingSlot] == null ? O.pendingSlot : -1;
      if (at < 0) for (let i = SLOTS - 1; i >= 0; i--) if (O.slots[i] == null) { at = i; break; }
      O.slots[at] = id; placed.add(id); O.pendingSlot = null; O.fresh = id;
    }
    if (O.sel != null && !have.has(O.sel)) O.sel = null;
    sv(key, O.slots);
  }
  function placeGroups(groups, rest) {
    const s = new Array(SLOTS).fill(null); let i = 0; const spill = [];
    const put = (g) => { let col = i % ROWN; if (col + g.length > ROWN) { i = Math.ceil(i / ROWN) * ROWN; col = 0; } if (i + g.length > SLOTS) return false; g.forEach(id => { s[i++] = id; }); return true; };
    for (const g of groups) { if (!put(g)) { spill.push(...g); continue; } if (i % ROWN && i < SLOTS) i++; }
    for (const id of [...spill, ...rest]) { let k = s.indexOf(null, Math.min(i, SLOTS - 1)); if (k < 0) k = s.indexOf(null); s[k] = id; i = k + 1; }
    O.slots = s; sv(O.slotsKey, s);
  }
  function sortKey(id) { const K = OR.kit(O.v.hand.okey); if (K.isJoker(id)) return 999; const f = K.face(id); return f.c * 20 + f.n; }
  function arrangeSort(rack) { placeGroups([], rack.slice().sort((a, b) => sortKey(a) - sortKey(b))); }
  function bestRunGroups(rack) {
    const K = OR.kit(O.v.hand.okey), b = OR.bestMelds(rack, K);
    return { groups: b.melds.map(m => { const a = OR.analyze(m, K); return a ? a.tiles.map(t => t.id) : m; }), used: b.used, value: b.value };
  }
  function arrangeRuns(user) {
    const rack = O.v.hand.rack.slice(), b = bestRunGroups(rack);
    placeGroups(b.groups, rack.filter(id => !b.used.has(id)).sort((a, c) => sortKey(a) - sortKey(c)));
    O.arr = 'runs'; if (user) Sound.play('click'); render();
  }
  function arrangePairs(user) {
    const H = O.v.hand, K = OR.kit(H.okey), rack = H.rack.slice();
    const b = OR.bestPairs(rack, K);
    placeGroups(b.pairs, rack.filter(id => !b.used.has(id)).sort((a, c) => sortKey(a) - sortKey(c)));
    O.arr = 'pairs'; if (user) Sound.play('click'); render();
  }
  function rackGroups() {
    const out = [];
    for (let r = 0; r < 2; r++) { let cur = []; for (let c = 0; c < ROWN; c++) { const id = O.slots[r * ROWN + c]; if (id == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(id); } if (cur.length) out.push(cur); }
    return out;
  }
  function groupEval() {
    const K = OR.kit(O.v.hand.okey); let points = 0, pairs = 0; const pg = [], prg = [];
    for (const g of rackGroups()) {
      if (g.length === 2) { if (OR.analyze(g, K, 'pair')) { pairs++; prg.push(g); } continue; }
      if (g.length < 3) continue; const a = OR.analyze(g, K); if (a && a.kind !== 'pair') { points += a.value; pg.push(g); }
    }
    return { points, pairs, pg, prg };
  }
  function moveTile(from, to) {
    if (from === to || to < 0 || to >= SLOTS) return;
    const s = O.slots, id = s[from]; if (id == null) return;
    s[from] = null;
    if (s[to] == null) s[to] = id;
    else {
      const row = Math.floor(to / ROWN), end = row * ROWN + ROWN;
      let e = -1; for (let i = to + 1; i < end; i++) if (s[i] == null) { e = i; break; }
      if (e >= 0) { for (let i = e; i > to; i--) s[i] = s[i - 1]; s[to] = id; }
      else { let b = -1; for (let i = to - 1; i >= row * ROWN; i--) if (s[i] == null) { b = i; break; }
        if (b >= 0) { for (let i = b; i < to; i++) s[i] = s[i + 1]; s[to] = id; } else { s[from] = s[to]; s[to] = id; } }
    }
    O.arr = null; sv(O.slotsKey, s);
  }

  /* ---------- buton durumları (kurallara göre etkin/pasif) ---------- */
  function abilities() {
    const v = O.v, H = v && v.hand; const out = { openRun: false, openPair: false, commit: false, undo: false, why: {} };
    if (!H || v.status !== 'playing' || v.me == null) return out;
    const K = OR.kit(H.okey), op = H.opened[v.me], th = H.threshold || { points: 101, pairs: 5 }, rack = H.rack;
    const play = playPhase();
    const pairsArea = H.opened.some(o => o && o.route === 'pairs');
    if (!play) { const w = myTurn() ? 'Önce ortadan ya da yandan taş al.' : 'Sıra sende değil.'; out.why = { openRun: w, openPair: w, commit: w, undo: w }; return out; }
    if (!op) {
      const ge = groupEval(), br = bestRunGroups(rack), bp = OR.bestPairs(rack, K);
      const pts = Math.max(ge.points, br.value), prs = Math.max(ge.pairs, bp.count);
      out.openRun = pts >= th.points; out.openPair = prs >= th.pairs;
      out.why.openRun = `Seri açmak için en az ${th.points} sayı gerekli (elinden en fazla ${pts}).`;
      out.why.openPair = `Çift açmak için en az ${th.pairs} çift gerekli (elinde ${prs}).`;
      out.why.commit = 'Taş işlemek için önce elini açmalısın.';
    } else {
      out.openRun = op.route === 'points' && rack.length > 3 && bestRunGroups(rack).groups.some(g => g.length < rack.length);
      out.openPair = (op.route === 'pairs' || pairsArea) && OR.bestPairs(rack.filter(id => !K.isJoker(id)), K).count > 0 && rack.length > 2;
      out.why.openRun = op.route === 'pairs' ? 'Çiftle açan masaya seri koyamaz (işleyebilir).' : 'İstakanda masaya koyulacak per yok.';
      out.why.openPair = pairsArea ? 'İstakanda çift yok.' : 'Masada çift açan olmadığı için çift konamaz.';
      out.commit = rack.length > 1 && (O.sel != null ? H.melds.some(m => OR.addToMeld(m, O.sel, K) || m.tiles.some((t, i) => OR.canRetrieve(m, i, O.sel, K)))
        : rack.some(id => !K.isJoker(id) && H.melds.some(m => OR.addToMeld(m, id, K) || m.tiles.some((t, i) => OR.canRetrieve(m, i, id, K)))));
      out.why.commit = rack.length <= 1 ? 'Son taşını atarak bitirmelisin.' : 'Masadaki perlere işlenebilecek taşın yok.';
    }
    out.undo = H.laidThisTurn; out.why.undo = 'Bu tur masaya taş koymadın.';
    return out;
  }

  /* ---------- çizim ---------- */
  function render() {
    const v = O.v; if (!v || O.screen !== 'table') return;
    $('#okBal').textContent = App.me.unlimited ? '∞' : fmt(App.me.balance);
    $('#okInfo').innerHTML = `<b>${v.cfg.mode === 'esli' ? 'Eşli' : 'Tekli'}</b> · ${v.cfg.katlamali ? 'Katlamalı' : 'Katlamasız'} · El ${Math.max(1, v.round)}/${v.cfg.rounds} · ${v.cfg.stake ? '🪙 ' + fmt(v.cfg.stake) : 'Ücretsiz'}${v.code ? ` · Kod <b class="gold">${v.code}</b>` : ''}`;
    for (let p = 0; p < 4; p++) renderSeat(p);
    renderDiscards(); renderPile(); renderMelds(); renderCol(); renderStatus(); if (!O.drag) renderRack(); renderWait(); timers();
  }
  function renderSeat(p) {
    const v = O.v, s = seatAt(p), x = v.seats[s], el = $(`.okseat[data-pos="${p}"]`); if (!el) return;
    const base = p === 2 ? 'okseat top' : p === 0 ? 'okseat me' : p === 1 ? 'okseat side right' : 'okseat side';
    if (!x) { el.className = base + ' empty'; el.innerHTML = `<div class="okav empty">?</div><div class="oknm">${v.status === 'waiting' ? `<button class="okbtn2 sm" data-sit="${s}">Otur</button>` : 'Boş'}</div>`;
      const b = el.querySelector('[data-sit]'); b && (b.onclick = () => guard(b, async () => { await Api.post(`/api/okey/${O.id}/seat`, { seat: s }); poll(true); })); return; }
    const H = v.hand, op = H && H.opened[s], turn = H && v.status === 'playing' && H.turn === s;
    const team = v.cfg.mode === 'esli' && v.me != null ? (s % 2 === v.me % 2 ? 'Takım' : 'Rakip') : '';
    const tag = x.bot ? '<i class="okbot">BOT</i>' : x.left ? '<i class="okbot">AYRILDI</i>' : x.away ? '<i class="okbot">OTO</i>' : '';
    const score = `<span class="okscore ${v.totals[s] < 0 ? 'neg' : ''}">${v.totals[s] > 0 ? '+' : ''}${v.totals[s]}</span>`;
    const opened = op ? `<span class="okop">${op.route === 'pairs' ? op.value + ' ÇİFT' : op.value}</span>` : '';
    el.className = `${base} ${turn ? 'turn' : ''} ${x.left ? 'left' : ''}`;
    const av = `<div class="okav" style="--sc:${SEATCOL[s]}"><span>${AVATARS[x.avatar] || '🙂'}</span><svg class="okring" viewBox="0 0 44 44"><circle cx="22" cy="22" r="20"/></svg></div>`;
    if (p === 1 || p === 3) el.innerHTML = `${av}<div class="okvname">${esc(x.name)}</div>${tag}<div class="okside-b">${opened}${score}${H ? `<span class="okcnt2"><i class="tico"></i>${H.counts[s]}</span>` : ''}</div>${team ? `<small class="okteam">${team}</small>` : ''}`;
    else el.innerHTML = `${av}<div class="oknm"><b>${esc(x.name)}</b>${tag}<small>Sv${x.level}${team ? ' · ' + team : ''}${H && p !== 0 ? ' · <i class="tico"></i>' + H.counts[s] : ''}</small></div>${opened}${score}`;
  }
  function renderDiscards() {
    const v = O.v, H = v.hand;
    for (let p = 0; p < 4; p++) {
      const el = $(`.okdisc[data-dpos="${p}"]`), s = seatAt(p), d = H ? H.discards[s] : [];
      const top = d.length ? d[d.length - 1] : null;
      const canTake = p === 3 && myTurn() && H.phase === 'draw' && top != null && !H.okeyBlocked;
      el.classList.toggle('can', canTake); el.classList.toggle('drop', p === 0 && playPhase());
      el.innerHTML = (d.length > 1 ? `<div class="okunder">${tileHtml(d[d.length - 2], 'dim')}</div>` : '') + (top != null ? tileHtml(top, p === 3 ? 'takeable' : '') : `<div class="okslot0">${p === 0 ? 'AT' : ''}</div>`) + (d.length ? `<em>${d.length}</em>` : '')
        + (p === 3 && H && H.took && !H.laidThisTurn && myTurn() ? '<button class="okret" id="okReturn">GERİ<br>BIRAK</button>' : '');
    }
    const rb = $('#okReturn'); rb && (rb.onclick = (e) => { e.stopPropagation(); act({ type: 'return' }); });
  }
  function renderPile() {
    const v = O.v, H = v.hand, el = $('#okPile');
    if (!H) { el.innerHTML = ''; return; }
    const can = myTurn() && H.phase === 'draw';
    el.classList.toggle('can', can);
    el.innerHTML = `<div class="okstack" data-zone="pile">${H.pile ? backTile() + backTile('o2') : '<div class="okslot0">BİTTİ</div>'}<em>${H.pile}</em>${can ? '<i class="okhint">ÇEK</i>' : ''}</div>
      <div class="okind"><small>GÖSTERGE</small>${tileHtml(H.indicator, 'ind')}</div>`;
  }
  function renderMelds() {
    const v = O.v, H = v.hand, el = $('#okMelds'); if (!H) { el.innerHTML = ''; return; }
    if (!H.melds.length) { el.innerHTML = ''; return; }
    el.innerHTML = H.melds.map(m => `<div class="omeld ${m.kind}" data-meld="${m.id}" style="--sc:${SEATCOL[m.owner]}">${m.tiles.map((t, i) => tileHtml(t.id, 'sm', `data-mi="${i}"`)).join('')}</div>`).join('');
  }
  function renderCol() {
    const a = abilities(), v = O.v, op = v.hand && v.me != null && v.hand.opened[v.me];
    const set = (id, on, label) => { const b = $(id); if (!b) return; b.classList.toggle('off', !on); if (label) b.textContent = label; };
    $('#okRuns').classList.toggle('act', O.arr === 'runs'); $('#okPairs').classList.toggle('act', O.arr === 'pairs');
    const noHand = !v.hand || v.status !== 'playing'; $('#okRuns').classList.toggle('off', noHand); $('#okPairs').classList.toggle('off', noHand);
    set('#okOpenRun', a.openRun, op ? 'Per Koy' : 'Seri Aç'); set('#okOpenPair', a.openPair, op ? 'Çift Koy' : 'Çift Aç');
    set('#okCommit', a.commit); set('#okUndo', a.undo);
    O.why = a.why;
  }
  function renderStatus() {
    const v = O.v, H = v.hand, el = $('#okStatus');
    if (!H || v.status !== 'playing') { el.innerHTML = v.status === 'round_end' ? '<span>El bitti — sonraki el birazdan</span>' : v.status === 'finished' ? '<span>Oyun bitti</span>' : ''; return; }
    const ge = groupEval(), th = H.threshold || { points: 101, pairs: 5 }, op = H.opened[v.me], mine = myTurn();
    let msg;
    if (!mine) msg = `Sıra: <b>${esc(v.seats[H.turn].name)}</b>`;
    else if (H.phase === 'draw') msg = '<b class="gold">Sıra sende:</b> ortadan çek ya da soldaki taşı al';
    else if (H.took && H.rack.includes(H.took.id)) msg = op ? '<b class="gold">Aldığın taşı</b> masaya koy ya da geri bırak' : '<b class="gold">Aldığın taşla</b> elini aç ya da geri bırak';
    else msg = '<b class="gold">Taş at:</b> sağ alttaki alana sürükle';
    el.innerHTML = `<span>${msg}</span>${op ? `<span class="okok">${op.route === 'pairs' ? 'Çiftle açtın' : 'Açtın: ' + op.value}</span>` : `<span class="${ge.points >= th.points ? 'okok' : ''}">Seri ${ge.points}/${th.points}</span><span class="${ge.pairs >= th.pairs ? 'okok' : ''}">Çift ${ge.pairs}/${th.pairs}</span>`}`;
  }
  function renderRack() {
    const el = $('#okRack'); const H = O.v.hand;
    if (!H) { el.innerHTML = '<div class="okrackmark">101</div>'; return; }
    let html = '<div class="okrackmark">101</div>'; for (let i = 0; i < SLOTS; i++) { const id = O.slots[i]; html += `<div class="okslot" data-slot="${i}">${id != null ? tileHtml(id, `${O.sel === id ? 'sel' : ''} ${O.fresh === id ? 'fresh' : ''} ${H.took && H.took.id === id ? 'took' : ''}`, `data-rack="${i}"`) : ''}</div>`; }
    el.innerHTML = html; O.fresh = null;
  }
  function renderWait() {
    const v = O.v, el = $('#okWait');
    if (v.status !== 'waiting') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const humans = v.seats.filter(x => x && x.human).length, left = v.fillAt ? Math.max(0, Math.ceil((v.fillAt - (Date.now() - O.skew)) / 1000)) : null;
    el.innerHTML = `<b class="gold" style="font-size:20px">${v.cfg.private ? '🔒 Özel oda' : '🟢 Oyuncu aranıyor'}</b>
      <p>${v.cfg.mode === 'esli' ? 'Eşli' : 'Tekli'} · ${v.cfg.katlamali ? 'Katlamalı' : 'Katlamasız'} · ${v.cfg.rounds} el · ${humans} gerçek oyuncu masada${v.cfg.private || !v.cfg.bots ? '' : ` · <span id="okFill">${left != null ? left + ' sn sonra boş koltuklara bot oturur' : ''}</span>`}</p>
      ${v.code ? `<p>Oda kodu: <b class="okcode">${v.code}</b></p>` : ''}
      <div class="row" style="justify-content:center;gap:8px"><button class="okbtn2" id="okInvite">👥 Arkadaş Davet Et</button>${(v.cfg.private && !v.owner) || v.cfg.bots === false ? '' : '<button class="okbtn2 go" id="okStart">🤖 Botlarla Başlat</button>'}</div>
      ${v.cfg.mode === 'esli' ? '<p class="small">Eşli: karşılıklı oturanlar takım. Boş koltuktaki “Otur” ile yerini seçebilirsin.</p>' : ''}`;
    $('#okInvite').onclick = inviteModal; $('#okStart') && ($('#okStart').onclick = () => guard($('#okStart'), async () => { await Api.post(`/api/okey/${O.id}/start`, {}); poll(true); }));
  }
  function timers() {
    const v = O.v; if (!v || O.screen !== 'table') return;
    const t = Date.now() - (O.skew || 0), turnMs = (v.cfg && v.cfg.turnMs) || 30000;
    if (v.status === 'playing' && v.deadline) {
      const rem = Math.max(0, v.deadline - t), frac = rem / turnMs;
      $$('.okseat').forEach(el => { const c = el.querySelector('.okring circle'); if (!c) return; c.style.strokeDashoffset = el.classList.contains('turn') ? String(126 * (1 - frac)) : '126'; });
      const ck = $('#okClock'); if (ck) { ck.textContent = Math.ceil(rem / 1000) + ' sn'; ck.parentElement.classList.toggle('hurry', myTurn() && rem < 8000); }
      if (myTurn() && rem < 8000 && rem > 0 && Math.floor(rem / 1000) !== O.lastTick) { O.lastTick = Math.floor(rem / 1000); Sound.play('tick'); }
    } else { const ck = $('#okClock'); if (ck) ck.textContent = v.status === 'waiting' ? 'Bekleniyor' : '—'; }
    if (v.status === 'waiting' && v.fillAt) { const f = $('#okFill'); if (f) f.textContent = `${Math.max(0, Math.ceil((v.fillAt - t) / 1000))} sn sonra boş koltuklara bot oturur`; }
  }

  /* ---------- olaylar (ses, animasyon, sohbet) ---------- */
  function events(prev, v) {
    const H = v.hand; if (!H) return;
    const fresh = H.log.filter(e => e.k > O.lastLog); if (prev) for (const e of fresh) {
      if (e.t === 'discard' && e.s !== v.me) { Sound.play('stop'); flyFrom(e.s, e.tile); if (e.pen) toast(`${v.seats[e.s].name}: +${e.pen} ceza`); }
      if (e.t === 'take' && e.s !== v.me) Sound.play('click');
      if (e.t === 'open') { Sound.play('win'); if (e.s !== v.me) toast(`${v.seats[e.s].name} ${e.route === 'pairs' ? e.value + ' çiftle' : e.value + ' ile'} açtı`); }
      if (e.t === 'retrieve' && e.s !== v.me) toast(`${v.seats[e.s].name} masadan okey aldı!`);
      if (e.t === 'round_end') Sound.play('bigwin');
    }
    if (H.log.length) O.lastLog = H.log[H.log.length - 1].k;
    if (prev && prev.hand && prev.hand.turn !== H.turn && H.turn === v.me && v.status === 'playing') { Sound.play('orb'); Sound.vibrate && Sound.vibrate(40); }
    const ch = (v.chat || []).filter(c => c.at > O.lastChat); if (ch.length) { O.lastChat = ch[ch.length - 1].at; if (prev) ch.forEach(c => bubble(c.s, CHAT[c.m])); }
  }
  function bubble(s, text) {
    const b = document.createElement('div'); b.className = 'okbubble p' + pos(s); b.textContent = text; $('#okBubbles').appendChild(b); setTimeout(() => b.remove(), 3500);
  }
  function flyFrom(s, tile) {
    const p = pos(s), st = $('#okStage'), from = { 1: [905, 190], 2: [480, 24], 3: [55, 190], 0: [480, 330] }[p], to = { 0: [868, 330], 1: [852, 80], 2: [130, 80], 3: [86, 330] }[p];
    if (!from || tile == null) return;
    const d = document.createElement('div'); d.className = 'okfly'; d.innerHTML = tileHtml(tile); d.style.transform = `translate(${from[0]}px,${from[1]}px) scale(.6)`; st.appendChild(d);
    requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = `translate(${to[0] - 23}px,${to[1] - 28}px) scale(1)`; }));
    setTimeout(() => d.remove(), 450);
  }

  /* ---------- hamleler ---------- */
  async function act(a, quiet) {
    if (O.acting) return null;
    if (O.fail) { toast('Bağlantı yok — yeniden bağlanınca hamle yapabilirsin.', true); return null; }
    O.acting = true;
    try { const r = await Api.post(`/api/okey/${O.id}/act`, a); await poll(true); return r; }
    catch (e) { if (!quiet) toast(e.message, true); if (e.code === 'network') { O.fail = Math.max(O.fail, 2); netBanner(true); } else await poll(true); return null; }
    finally { O.acting = false; }
  }
  async function drawTo(slot) { const H = O.v.hand; if (O.acting || !myTurn() || H.phase !== 'draw') return; O.pendingSlot = slot; Sound.play('click'); await act({ type: 'draw' }); }
  async function takeTo(slot) { const H = O.v.hand; if (O.acting || !myTurn() || H.phase !== 'draw') return; O.pendingSlot = slot; Sound.play('click'); await act({ type: 'take' }); }
  async function discard(id) {
    const H = O.v.hand, K = OR.kit(H.okey);
    if (O.acting) return;
    if (!myTurn() || H.phase !== 'play') { toast(H.phase === 'draw' && myTurn() ? 'Önce taş çekmelisin.' : 'Sıra sende değil.', true); return; }
    if (H.rack.length > 1) {
      if (K.isJoker(id) && !(await UI.confirm('Okey atarsan 101 ceza yazılır ve sonraki oyuncu alamaz. Yine de atılsın mı?', 'At'))) return;
      if (!K.isJoker(id) && OR.isCommittable(id, H.melds, K) && !(await UI.confirm('Bu taş masadaki bir pere işlenebilir. Atarsan 101 ceza yazılır. Yine de atılsın mı?', 'At'))) return;
    }
    const i = O.slots.indexOf(id); if (i >= 0) { O.slots[i] = null; renderRack(); }
    O.sel = null; Sound.play('stop'); await act({ type: 'discard', tile: id });
  }
  const need = (k) => { const a = abilities(); if (!a[k]) { toast(a.why[k] || 'Şu anda yapılamaz.', true); return false; } return true; };
  /** Seri Aç / Çift Aç (açmadıysa) — Per Koy / Çift Koy (açtıysa). Önce istakadaki dizilişi, yetmezse en iyi dizilişi kullanır. */
  async function openWith(route) {
    if (!need(route === 'points' ? 'openRun' : 'openPair')) return;
    const H = O.v.hand, K = OR.kit(H.okey), op = H.opened[O.v.me], th = H.threshold || { points: 101, pairs: 5 }, rack = H.rack;
    const keep = (gs) => { const n = gs.flat().length; if (n < rack.length) return gs; const g = gs.slice().sort((a, b) => a.length - b.length); g.shift(); return g; };
    let groups;
    if (route === 'points') {
      const ge = groupEval();
      if (!op && ge.points >= th.points) groups = ge.pg;
      else if (op && ge.pg.length) groups = ge.pg;
      else { const b = bestRunGroups(rack); groups = b.groups; arrangeRuns(); }
    } else {
      const ge = groupEval();
      if ((!op && ge.pairs >= th.pairs) || (op && ge.prg.length)) groups = ge.prg;
      else { const src = op ? rack.filter(id => !K.isJoker(id)) : rack; groups = OR.bestPairs(src, K).pairs; arrangePairs(); }
    }
    groups = keep(groups);
    if (!op) {
      const val = route === 'points' ? groups.reduce((a, g) => a + (OR.analyze(g, K) || { value: 0 }).value, 0) : groups.length;
      const t = route === 'points' ? th.points : th.pairs;
      if (val < t) return toast(`Bir taş atmak için elde kalması gerektiğinden açış ${val}'e düşüyor; en az ${t} gerekli.`, true);
      if (H.took && !groups.flat().includes(H.took.id)) return toast('Yandan aldığın taş açışta kullanılmıyor. Önce “Geri Bırak” ile iade et ya da onu kullanan bir dizilişle aç.', true);
      const r = await act({ type: 'open', route, groups }); if (r) { Sound.play('bigwin'); toast(route === 'pairs' ? `${r.value} çiftle açtın!` : `${r.value} ile açtın!`); }
      return;
    }
    let left = rack.length, n = 0;
    for (const g of groups) { if (left - g.length < 1) break; const r = await act({ type: 'lay', group: g }); if (!r) break; left -= g.length; n++; }
    if (n) Sound.play('win');
  }
  /** Taş İşle: seçili taşı (yoksa işlenebilen tüm taşları) masadaki perlere ekler; uygun okey varsa alır. */
  async function commitTiles() {
    if (!need('commit')) return;
    const one = async (id) => {
      const H = O.v.hand, K = OR.kit(H.okey);
      for (const m of H.melds) { const jx = m.tiles.findIndex((t, i) => OR.canRetrieve(m, i, id, K)); if (jx >= 0) { const r = await act({ type: 'retrieve', meld: m.id, index: jx, tile: id }); if (r) toast('Masadaki okeyi aldın!'); return !!r; } }
      const m = H.melds.find(x => OR.addToMeld(x, id, K)); if (!m) return false;
      const t = m.tiles, side = m.kind === 'run' ? (K.isJoker(id) ? 'R' : (K.face(id).n < t[0].n ? 'L' : 'R')) : undefined;
      return !!(await act({ type: 'add', tile: id, meld: m.id, side }));
    };
    let n = 0;
    if (O.sel != null) { if (await one(O.sel)) n++; O.sel = null; }
    else for (let guardN = 0; guardN < 22; guardN++) {
      const H = O.v.hand, K = OR.kit(H.okey); if (H.rack.length <= 1) break;
      const id = H.rack.find(x => !K.isJoker(x) && H.melds.some(m => OR.addToMeld(m, x, K) || m.tiles.some((t, i) => OR.canRetrieve(m, i, x, K))));
      if (id == null || !(await one(id))) break; n++;
    }
    if (n) { Sound.play('pop'); toast(`${n} taş işlendi.`); }
  }
  async function undoTurn() { if (!need('undo')) return; const r = await act({ type: 'undo' }); if (r) { toast('Bu tur koyduğun taşlar ıstakana toplandı.'); Sound.play('click'); } }
  async function toMeld(id, meldId, side) {
    const H = O.v.hand, K = OR.kit(H.okey), m = H.melds.find(x => x.id === meldId); if (!m) return;
    if (!playPhase()) return toast('Sıra sende değil.', true);
    if (!H.opened[O.v.me]) return toast('İşlemek için önce elini açmalısın.', true);
    if (H.rack.length <= 1) return toast('Son taşını atarak bitirmelisin.', true);
    const jx = m.tiles.findIndex((t, i) => OR.canRetrieve(m, i, id, K));
    if (jx >= 0) { const r = await act({ type: 'retrieve', meld: meldId, index: jx, tile: id }); if (r) { Sound.play('win'); toast('Okeyi aldın!'); } return; }
    if (!OR.addToMeld(m, id, K, side) && !OR.addToMeld(m, id, K)) return toast('Bu taş bu pere işlenemez.', true);
    const r = await act({ type: 'add', tile: id, meld: meldId, side: OR.addToMeld(m, id, K, side) ? side : undefined }); if (r) Sound.play('pop');
  }

  /* ---------- dokunma / sürükleme ---------- */
  function bindPointer() {
    const st = $('#okStage');
    st.addEventListener('pointerdown', (e) => {
      if (!O.v || !O.v.hand) return;
      if (e.target.closest('button')) return;
      const tEl = e.target.closest('[data-rack]'), pile = e.target.closest('[data-zone="pile"]'), take = e.target.closest('[data-zone="take"]');
      let kind = null, id = null, from = null;
      if (tEl) { kind = 'rack'; from = +tEl.dataset.rack; id = O.slots[from]; }
      else if (pile && myTurn() && O.v.hand.phase === 'draw' && O.v.hand.pile) kind = 'pile';
      else if (take && myTurn() && O.v.hand.phase === 'draw') { const d = O.v.hand.discards[seatAt(3)]; if (d.length && !O.v.hand.okeyBlocked) { kind = 'take'; id = d[d.length - 1]; } }
      if (!kind) return;
      e.preventDefault();
      const p0 = toLocal(e.clientX, e.clientY);
      O.drag = { kind, id, from, x0: p0.x, y0: p0.y, moved: false, ghost: null, src: tEl };
      try { st.setPointerCapture(e.pointerId); } catch (x) { /* */ }
    });
    st.addEventListener('pointermove', (e) => {
      const D = O.drag; if (!D) return;
      const p = toLocal(e.clientX, e.clientY);
      if (!D.moved && Math.hypot(p.x - D.x0, p.y - D.y0) > 7) {
        D.moved = true; const g = document.createElement('div'); g.className = 'okghost'; g.innerHTML = D.kind === 'pile' ? backTile() : tileHtml(D.id); st.appendChild(g); D.ghost = g;
        if (D.src) D.src.classList.add('lift');
      }
      if (D.moved) { D.ghost.style.transform = `translate(${p.x - 23}px,${p.y - 40}px) scale(1.08)`; hilite(e.clientX, e.clientY); }
    });
    const end = (e) => {
      const D = O.drag; if (!D) return; O.drag = null;
      if (D.ghost) D.ghost.remove(); if (D.src) D.src.classList.remove('lift'); hilite(null);
      const tgt = hitTest(e.clientX, e.clientY);
      if (!D.moved) { tap(D); return; }
      if (D.kind === 'rack') {
        if (tgt.slot != null) { moveTile(D.from, tgt.slot); renderRack(); renderStatus(); renderCol(); }
        else if (tgt.zone === 'discard') discard(D.id);
        else if (tgt.meld != null) toMeld(D.id, tgt.meld, tgt.side);
        else renderRack();
      } else if (D.kind === 'pile') drawTo(tgt.slot != null && O.slots[tgt.slot] == null ? tgt.slot : null);
      else if (D.kind === 'take') takeTo(tgt.slot != null && O.slots[tgt.slot] == null ? tgt.slot : null);
    };
    st.addEventListener('pointerup', end);
    st.addEventListener('pointercancel', () => { const D = O.drag; O.drag = null; if (D && D.ghost) D.ghost.remove(); if (D && D.src) D.src.classList.remove('lift'); hilite(null); renderRack(); });
    st.addEventListener('click', (e) => {
      if (O.drag || O.sel == null) return;
      const slot = e.target.closest('.okslot'), disc = e.target.closest('[data-zone="discard"]'), meld = e.target.closest('[data-meld]');
      if (slot && !slot.querySelector('[data-rack]')) { moveTile(O.slots.indexOf(O.sel), +slot.dataset.slot); O.sel = null; renderRack(); renderStatus(); renderCol(); }
      else if (disc) discard(O.sel);
      else if (meld) { const mi = e.target.closest('[data-mi]'); const n = meld.querySelectorAll('[data-mi]').length; toMeld(O.sel, +meld.dataset.meld, mi && +mi.dataset.mi < n / 2 ? 'L' : 'R'); O.sel = null; }
    });
  }
  function tap(D) {
    if (D.kind === 'pile') return drawTo(null);
    if (D.kind === 'take') return takeTo(null);
    if (D.kind === 'rack') { O.sel = O.sel === D.id ? null : D.id; Sound.play('click'); renderRack(); renderCol(); }
  }
  function hitTest(cx, cy) {
    const el = document.elementFromPoint(cx, cy); const out = {}; if (!el) return out;
    const slot = el.closest('.okslot'); if (slot) out.slot = +slot.dataset.slot;
    const z = el.closest('[data-zone]'); if (z) out.zone = z.dataset.zone;
    const m = el.closest('[data-meld]'); if (m) { out.meld = +m.dataset.meld; const mi = el.closest('[data-mi]'); const n = m.querySelectorAll('[data-mi]').length; out.side = mi ? (+mi.dataset.mi < n / 2 ? 'L' : 'R') : 'R'; }
    return out;
  }
  function hilite(cx, cy) {
    $$('.okhl').forEach(x => x.classList.remove('okhl')); if (cx == null) return;
    const el = document.elementFromPoint(cx, cy); if (!el) return;
    const t = el.closest('.okslot,[data-zone="discard"],[data-meld]'); if (t) t.classList.add('okhl');
  }

  /* ---------- modallar ---------- */
  async function leaveTable() {
    const v = O.v;
    if (v && (v.status === 'playing' || v.status === 'round_end')) {
      if (!(await UI.confirm(`Masadan ayrılırsan yerine bot oynar${v.cfg.stake ? ' ve giriş jetonun iade edilmez' : ''}. Oyun sürdüğü sürece lobiden geri dönebilirsin. Ayrılmak istiyor musun?`, 'Ayrıl'))) return;
    }
    const id = O.id; stopTable(); O.screen = null;
    if (v && v.status !== 'finished') { try { const r = await Api.post(`/api/okey/${id}/leave`, {}); if (r.refunded) toast(`Giriş jetonu iade edildi: ${fmt(r.refunded)}`); } catch (e) { /* bağlantı yoksa sunucu süre dolunca otomatik oynatır */ } }
    Screens.refresh && Screens.refresh().catch(() => {});
    lobby();
  }
  function menuModal() {
    modal(`<h3 class="gold">Menü</h3><div class="list">
      <button class="btn ghost block" data-x="scores">📊 Puan Tablosu</button><button class="btn ghost block" data-x="rules">📖 Kurallar</button>
      <button class="btn ghost block" data-x="sound">${Sound.get().sound ? '🔇 Sesi Kapat' : '🔊 Sesi Aç'}</button><button class="btn red block" data-x="leave">⟵ Masadan Çık</button></div>`, {
      onOpen(m) { $$('[data-x]', m).forEach(b => b.onclick = () => { const x = b.dataset.x; closeModal(); if (x === 'scores') scoresModal(); if (x === 'rules') rulesModal(); if (x === 'sound') Sound.set('sound', !Sound.get().sound); if (x === 'leave') leaveTable(); }); },
    });
  }
  async function buyModal() {
    let r; try { r = await Api.get('/api/shop'); } catch (e) { return toast(e.message, true); }
    modal(`<h3 class="gold">$ Jeton Satın Al</h3><div class="list">${r.packages.map(p => `<div class="li"><div class="grow"><b>${esc(p.name)}</b><small>${fmt(p.coins)} jeton${p.bonusLabel ? ' · ' + esc(p.bonusLabel) : ''}</small></div><button class="btn green sm" data-buy="${p.productId}" ${p.available ? '' : 'disabled'}>${esc(p.priceLabel)}</button></div>`).join('')}</div><p class="small muted center">${esc(r.notice || '')}</p>`, {
      onOpen(m) { $$('[data-buy]', m).forEach(b => b.onclick = () => { closeModal(); window.Billing && Billing.buy(b.dataset.buy, r.billingAccountId); }); },
    });
  }
  function chatModal() {
    modal(`<h3 class="gold">💬 Hızlı Mesaj</h3><div class="row wrap" style="justify-content:center">${CHAT.map((c, i) => `<button class="btn ghost sm" data-c="${i}">${c}</button>`).join('')}</div>`, {
      onOpen(m) { $$('[data-c]', m).forEach(b => b.onclick = async () => { closeModal(); try { await Api.post(`/api/okey/${O.id}/chat`, { msg: +b.dataset.c }); poll(true); } catch (e) { toast(e.message, true); } }); },
    });
  }
  async function inviteModal() {
    let fr = []; try { fr = (await Api.get('/api/friends')).friends; } catch (e) { /* */ }
    modal(`<h3 class="gold">👥 Arkadaş Davet Et</h3>${O.v.code ? `<p class="center">Oda kodu: <b class="okcode">${O.v.code}</b></p>` : ''}
      <div class="list">${fr.map(f => `<div class="li"><span class="avatar" style="width:34px;height:34px;font-size:18px">${AVATARS[f.avatar] || '🙂'}</span><div class="grow"><b>${esc(f.username)}</b><small>Sv${f.level}</small></div><button class="btn green sm" data-f="${f.id}">Davet</button></div>`).join('') || '<p class="center muted small">Henüz arkadaşın yok. Arkadaşlar sekmesinden kullanıcı adıyla ekleyebilirsin.</p>'}</div>`, {
      onOpen(m) { $$('[data-f]', m).forEach(b => b.onclick = () => guard(b, async () => { await Api.post(`/api/okey/${O.id}/invite`, { friendId: +b.dataset.f }); b.textContent = 'Gönderildi ✓'; })); },
    });
  }
  function scoresTable(v) {
    const names = v.seats.map(x => (x ? esc(x.name) : '—'));
    return `<table class="tbl okscoret"><tr><th>El</th>${names.map((n, s) => `<th style="color:${SEATCOL[s]}">${n}</th>`).join('')}</tr>
      ${v.history.map((h, i) => `<tr><td>${i + 1}</td>${h.map(x => `<td class="${x < 0 ? 'neg' : ''}">${x}</td>`).join('')}</tr>`).join('')}
      <tr class="tot"><td>Toplam</td>${v.totals.map(x => `<td class="${x < 0 ? 'neg' : ''}">${x}</td>`).join('')}</tr></table>
      ${v.cfg.mode === 'esli' ? `<p class="center small">Takım A (${names[0]} + ${names[2]}): <b>${v.totals[0] + v.totals[2]}</b> · Takım B (${names[1]} + ${names[3]}): <b>${v.totals[1] + v.totals[3]}</b></p>` : ''}`;
  }
  function scoresModal() { if (!O.v) return; modal(`<h3 class="gold">📊 Puan Tablosu</h3>${scoresTable(O.v)}<p class="small muted center">En düşük puan kazanır.</p>`); }
  function roundModal(v, thenFinal) {
    const r = v.hand.result, fin = r.finisher;
    modal(`<h3 class="gold">${fin != null ? `🏁 ${esc(v.seats[fin].name)} bitirdi!` : '🀫 Deste bitti'}</h3>
      <div class="list">${r.detail.map(d => `<div class="li"><b style="color:${SEATCOL[d.s]};min-width:80px">${esc(v.seats[d.s].name)}</b><div class="grow"><small>${esc(d.note || '')}${d.penalties ? ` · ceza +${d.penalties}` : ''}${d.siler ? ' · siler −101' : ''}</small><div class="okrev">${(r.racks[d.s] || []).slice(0, 22).map(id => tileHtml(id, 'xs')).join('')}</div></div><b class="${d.score < 0 ? 'okneg' : ''}">${d.score > 0 ? '+' : ''}${d.score}</b></div>`).join('')}</div>
      ${scoresTable(v)}${thenFinal ? '<button class="btn gold block" data-close="1">Sonuçlar ▶</button>' : `<p class="center small muted">Sonraki el birkaç saniye içinde başlar.</p>`}`).then(() => { if (thenFinal) finalModal(O.v); });
    if (!thenFinal) setTimeout(() => { if (O.v && O.v.status !== 'round_end') closeModal(); }, 9500);
  }
  function finalModal(v) {
    const F = v.final; if (!F) return; const me = v.me;
    const won = F.winners.includes(me) && F.winners.length < 4;
    if (won) { Sound.play('bigwin'); UI.confetti && UI.confetti(80); }
    modal(`<h3 class="gold">${won ? '🏆 KAZANDIN!' : 'Oyun bitti'}</h3>
      <div class="list">${F.ranking.map((s, i) => `<div class="li ${s === me ? 'okme' : ''}"><b style="width:26px">${i + 1}.</b><span class="avatar" style="width:34px;height:34px;font-size:18px">${AVATARS[v.seats[s].avatar] || '🙂'}</span><div class="grow"><b>${esc(v.seats[s].name)}</b><small>${v.totals[s]} puan${v.xpGain && v.xpGain[s] ? ` · +${v.xpGain[s]} XP` : ''}</small></div>${v.payouts && v.payouts[s] ? `<b class="gold">+${fmt(v.payouts[s])} 🪙</b>` : ''}</div>`).join('')}</div>
      ${F.teams ? `<p class="center">Takım puanları: A ${F.teams[0]} · B ${F.teams[1]}</p>` : ''}
      <div class="row"><button class="btn ghost grow" data-close="lobby">Lobiye Dön</button>${v.cfg.private ? '' : '<button class="btn green grow" data-close="again">Tekrar Oyna</button>'}</div>`, { noClose: true }).then(async (x) => {
      Screens.refresh && Screens.refresh().catch(() => {});
      if (x === 'again') { try { await Api.post(`/api/okey/${O.id}/leave`, {}); const r = await Api.post('/api/okey/quick', { mode: v.cfg.mode, stake: v.cfg.stake, rounds: v.cfg.rounds, katlamali: v.cfg.katlamali }); openTable(r.tableId); } catch (e) { toast(e.message, true); lobby(); } }
      else { try { await Api.post(`/api/okey/${O.id}/leave`, {}); } catch (e) { /* */ } lobby(); }
    });
  }

  /* ---------- geri tuşu ---------- */
  function back() {
    if ($('#overlay').classList.contains('show')) { closeModal(); return true; }
    if (O.screen === 'table') { leaveTable(); return true; }
    if (O.screen === 'lobby') { O.screen = null; Screens.go('lobby'); return true; }
    return false;
  }
  /** Uygulama açılışında devam eden masa varsa sor */
  function offerResume(t) {
    if (!t || O.screen) return;
    UI.modal(`<h3 class="gold">🀄 101 Okey</h3><p class="center">${t.status === 'waiting' ? 'Oyuncu beklediğin bir masan var.' : 'Devam eden bir 101 Okey oyunun var.'}</p><div class="row"><button class="btn ghost grow" data-close="0">Sonra</button><button class="btn green grow" data-close="1">MASAYA DÖN</button></div>`).then(x => { if (x === '1') openTable(t.id); });
  }
  window.Okey = { lobby, openTable, offerResume, isOpen: () => !!O.screen && (($('#okeyRoot') && $('#okeyRoot').classList.contains('show')) || ($('#okeyLobby') && $('#okeyLobby').classList.contains('active'))), back, close: () => { stopTable(); O.screen = null; } };
})();
