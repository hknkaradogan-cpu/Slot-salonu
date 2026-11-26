/* SPINOVA 101 OKEY — YATAY PLATFORM
 * Bütün uygulama 960×440 tasarım sahnesinde çizilir ve ekrana ölçeklenir (telefon, tablet, bilgisayar).
 * Ana menü, paneller (profil, turnuvalar, mesajlar, canlı sohbet, başarımlar, istatistik, hediyeler, çark, bulmaca, diğer oyunlar)
 * ve dikey ekranda "telefonu yan çevir" uyarısı burada. Her buton gerçek bir sunucu işlevine bağlıdır. */
(function () {
  'use strict';
  const { $, $$, esc, fmt, toast, modal, closeModal, guard, AVATARS } = UI;
  const W0 = 960, H0 = 440;
  const P = { panel: null, chatTimer: null, chatLast: 0, thread: null, threadTimer: null, winners: [], winIdx: 0, winTimer: null };
  const S = () => Screens.state();

  /* ===================== SAHNE / YÖN ===================== */
  function fit() {
    const app = $('#app'); const W = innerWidth, H = innerHeight;
    const portrait = H > W * 1.05;
    document.body.classList.toggle('portrait', portrait);
    // Tam ekran: sahne telefonun en-boy oranına göre genişler/uzar (köşelerde boşluk kalmaz).
    // Çok kare ekranlarda (tablet) en fazla %25 uzar, kalan kısım aynı arka planla dolar.
    const sw = Math.max(W0, Math.round(H0 * W / H)), sh = Math.min(Math.round(H0 * 1.25), Math.max(H0, Math.round(W0 * H / W)));
    const u = Math.min(W / sw, H / sh);
    Object.assign(app.style, { width: sw + 'px', height: sh + 'px', left: (W - sw * u) / 2 + 'px', top: (H - sh * u) / 2 + 'px', transform: `scale(${u})` });
    document.documentElement.style.setProperty('--su', u); document.documentElement.style.setProperty('--sw', sw + 'px'); document.documentElement.style.setProperty('--sh', sh + 'px');
  }
  function lockLandscape() {
    try { window.AndroidApp && AndroidApp.setOrientation('landscape'); } catch (e) { /* */ }
  }
  async function webLandscape() {
    try { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch (e) { /* */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) { /* tarayıcı izin vermezse kullanıcı telefonu çevirir */ }
    setTimeout(fit, 300);
  }
  function initStage() {
    lockLandscape(); fit();
    addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 250));
    const r = document.createElement('div'); r.id = 'rotateMsg';
    r.innerHTML = `<div class="rphone">📱</div><b>Telefonunu yan çevir</b><span>SPINOVA 101 OKEY yatay ekranda oynanır.</span><button class="btn gold" id="rotGo">Tam ekran · Yatay</button>`;
    document.body.appendChild(r); $('#rotGo').onclick = webLandscape;
  }

  /* ===================== ANA MENÜ ===================== */
  const icon = (id, ic, t, badge) => `<button class="hicon" data-p="${id}"><span class="i">${ic}</span><span class="t">${t}</span>${badge ? `<span id="${badge}" class="hb"></span>` : ''}</button>`;
  function topHtml(home) {
    return `<div class="htop">
      <div class="hprof" data-p="profile"><div class="avatar" id="tAv"></div><div class="lvlbox"><div class="nm"><span id="tName"></span></div><div class="row" style="gap:4px"><span class="lvl" id="tLvl"></span><div class="xpbar grow"><i id="tXp"></i><em id="tXpT"></em></div></div></div></div>
      <div class="hcur" data-p="shop" id="tCoins"><i class="hcoin"></i><b id="tBal"></b><span class="hplus">+</span></div>
      <div class="hcur" data-p="tickets"><i class="hchip"></i><b id="tTk"></b><span class="hplus">+</span></div>
      <div class="grow"></div>
      <div class="hicons">${icon('gifts', '🎁', 'Hediye', 'bGift')}${icon('achievements', '🏆', 'Başarılar', 'bAch')}${icon('settings', '⚙️', 'Ayarlar')}${icon('logout', '🚪', 'Çıkış')}</div></div>`;
  }
  function bottomHtml(active) {
    const b = (id, ic, t, badge) => `<button class="bnav ${active === id ? 'on' : ''}" data-p="${id}"><span class="i">${ic}</span><span class="t">${t}</span>${badge ? `<span id="${badge}" class="hb"></span>` : ''}</button>`;
    return `<div class="hbottom">${b('friends', '👥', 'Arkadaşlar', 'bMsg')}${b('leaders', '📊', 'Liderlik Tablosu')}
      <button class="bhome ${active === 'home' ? 'on' : ''}" data-p="home"><span class="i">🏠</span><span class="t">Ana Sayfa</span></button>
      ${b('chat', '💬', 'Sohbet')}${b('quests', '📅', 'Görevler')}</div>`;
  }
  const rail = (id, ic, t, badge) => `<button class="rbtn" data-p="${id}"><span class="i">${ic}</span><span class="t">${t}</span>${badge ? `<span id="${badge}" class="hb"></span>` : ''}</button>`;
  // 12 canlı oyun kartı (her birinin kendi animasyonu: js/cardfx.js)
  const GAMES = [['okey101', '101 Okey'], ['duz', 'Düz Okey'], ['tavla', 'Tavla'], ['aviator', 'Avivasor'], ['slots', 'Slot Salonu'], ['zeus', 'Zeus'],
    ['misir', 'Mısır Hazineleri'], ['peri', 'Kristal Peri'], ['korsan', 'Korsan Hazinesi'], ['vegas', 'Vegas Meyveleri'], ['ejderha', 'Ejderha Hazinesi'], ['altin', 'Altın Şans']];
  function home() {
    Sound.theme('hall'); window.__navAt = Date.now();
    stopPanelTimers(); P.panel = 'home';
    // Salon önbelleği: salon DOM'u zaten hazırsa yeniden kurma (12 canlı kart, görseller, dinleyiciler korunur) — anında açılır
    const m = $('#main');
    if (m && m.dataset.hall === '1' && m.querySelector('.g12')) {
      UI.show('main'); Screens.renderTop(); renderBadges(); return;
    }
    UI.screen('main', `<div class="spbg"><img src="assets/hall_bg.webp" alt=""><i class="spfloor"></i></div>
      ${topHtml(true)}
      <img class="spking" src="assets/king_logo.webp" alt="SPINOVA 101 OKEY — Şansın En Eğlenceli Hali!">
      <div class="sprail l">${rail('tournaments', '🏆', 'Turnuvalar')}${rail('wheel', '🎡', 'Şans Çarkı', 'bWheel')}${rail('puzzle', '🧩', 'Bulmaca')}${rail('shop', '💎', 'Mağaza')}</div>
      <div class="sprail r">${rail('messages', '✉️', 'Mesajlar', 'bMsg2')}${rail('stats', '📈', 'İstatistik')}${rail('support', '🎧', 'Destek')}<div class="spcode"><input id="hCode" maxlength="6" placeholder="KOD" autocomplete="off"><button id="hJoin" title="Kodla masaya katıl">➜</button></div></div>
      <div class="spcards g12">${GAMES.map(([id, t]) => `<button class="spcard gc ${id}" data-p="${id}" data-card="${id}" aria-label="${t}"><span class="gcart"></span><span class="spplay">OYNA</span></button>`).join('')}</div>
      <button class="spchest" data-p="daily"><img src="assets/ic_chest.webp" alt=""><span>Günlük<br>Ödül</span><span id="bDaily2" class="hb"></span></button>
      <div class="spsig" aria-label="By-Hkn imzası"><i>👑</i>By-Hkn</div>
      ${bottomHtml('home')}`);
    UI.show('main'); bind($('#main')); Screens.renderTop(); renderBadges();
    if (window.CardFX) $$('#main .gc').forEach(c => { if (!c.__fx) c.__fx = CardFX.mount(c.querySelector('.gcart'), c.dataset.card); });
    $('#main').dataset.hall = '1';
    $('#hJoin').onclick = () => joinCode($('#hCode').value);
    $('#hCode').onkeydown = (e) => { if (e.key === 'Enter') joinCode(e.target.value); };
    Api.get('/api/wheel').then(w => { const e = $('#bWheel'); if (e) e.innerHTML = w.freeAvailable ? '<span class="dot">!</span>' : ''; }).catch(() => {});
  }
  async function joinCode(code) {
    code = String(code || '').trim().toUpperCase(); if (code.length !== 6) return toast('6 karakterlik masa kodunu gir.', true);
    // aynı kod hem okey hem tavla masaları için çalışır: önce okey, bulunamazsa tavla
    const tryJoin = async (pw) => {
      try { const r = await Api.post('/api/okey/join', { code, ...(pw ? { password: pw } : {}) }); Okey.openTable(r.tableId); return true; }
      catch (e) { if (e.code !== 'no_table') throw e; }
      const r = await Api.post('/api/tavla/join', { code, ...(pw ? { password: pw } : {}) }); Tavla.openTable(r.tableId); return true;
    };
    try { await tryJoin(); }
    catch (e) { if (e.code === 'bad_password') { const pw = await askText('🔒 Şifreli masa', 'Masa şifresi'); if (pw) { try { await tryJoin(pw); } catch (e2) { toast(e2.message, true); } } } else toast(e.code === 'no_table' ? 'Bu kodla masa bulunamadı.' : e.message, true); }
  }
  function askText(title, label, max = 20) {
    return modal(`<h3 class="gold">${title}</h3><label class="field"><span>${label}</span><input id="askI" type="password" maxlength="${max}"></label><button class="btn green block" id="askGo">Tamam</button>`, {
      onOpen() { $('#askI').focus(); $('#askGo').onclick = () => closeModal($('#askI').value); },
    });
  }
  async function loadWinners() {
    try { P.winners = (await Api.get('/api/winners/recent')).winners; } catch (e) { P.winners = []; }
    clearInterval(P.winTimer); P.winIdx = 0; showWinner(); if (P.winners.length > 1) P.winTimer = setInterval(showWinner, 4000);
  }
  function showWinner() {
    const el = $('#hWinBody'); if (!el) return clearInterval(P.winTimer);
    if (!P.winners.length) { el.innerHTML = '<div class="hwav">🏆</div><b>İlk büyük kazanç senin olsun!</b><small>Bahsin 10 katı ve üstü kazançlar burada görünür</small>'; return; }
    const w = P.winners[P.winIdx++ % P.winners.length], g = (S().games || []).find(x => x.id === w.game);
    el.innerHTML = `<div class="hwav">${AVATARS[w.avatar] || UI.AVATARS[0]}</div><b>${esc(w.username)}</b><div class="hwamt">${fmt(w.win)} <small>jeton</small></div><small>${esc(g ? g.name : w.game)} · ${Math.round(w.win / w.bet)}x</small><span class="hrib">Kazandı!</span>`;
  }
  function renderBadges() {
    const st = S(), n = st.badges || {}; const d = (id, v) => { const e = $('#' + id); if (e) e.innerHTML = v ? `<span class="dot">${v}</span>` : ''; };
    d('bGift', (n.gifts || 0) + (n.notifications || 0) + (st.levelRewards && st.levelRewards.pending ? st.levelRewards.pending.count : 0) || '');
    d('bMsg', (n.friendRequests || 0) || ''); d('bMsg2', (n.messages || 0) || ''); d('bDaily2', st.daily && st.daily.available ? '!' : '');
    $$('#tTk').forEach(e => { e.textContent = st.me ? (st.me.unlimited ? '∞' : fmt(st.me.tickets || 0)) : ''; });
    $$('#tWel').forEach(e => { e.textContent = st.me ? st.me.username : ''; });
  }

  /* ===================== GEZİNME ===================== */
  function bind(root) {
    if (root.__spBound) return; root.__spBound = true; // ekran öğesi yeniden kullanılır: dinleyici yalnızca bir kez eklenir
    // HAYALET DOKUNUŞ KORUMASI (kesin): salondaki bir düğme yalnızca parmak O düğmeye inip kalktıysa çalışır.
    // Oyundan çıkış dokunuşunun "click"i yeni açılan salonda sol üstteki profile düşse bile, o dokunuş
    // salonda başlamadığı için (pointerdown yok) yok sayılır. Süreye bağlı değildir; yavaş cihazlarda da çalışır.
    let pressed = null, pressedAt = 0;
    root.addEventListener('pointerdown', (e) => { pressed = e.target.closest('[data-p]'); pressedAt = Date.now(); }, true);
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-p]'); if (!t || t.tagName === 'INPUT') return;
      const fromPointer = e.detail > 0 || e.pointerType; // klavye/erişilebilirlik tıklamaları (detail 0) serbest
      if (fromPointer && (pressed !== t || Date.now() - pressedAt > 5000)) { e.stopPropagation(); return; }
      pressed = null;
      if (e.target.closest('#hCode,#hJoin')) return;
      Sound.play('click');
      // canlı oyun kartı: kart öne çıkıp ekranı doldurur, oyun arkada açılır
      if (t.dataset.card && window.CardFX) return CardFX.launch(t, t.dataset.card, () => open(t.dataset.p));
      open(t.dataset.p);
    });
  }
  function open(id) {
    const st = S();
    switch (id) {
      case 'home': return home();
      case 'okey': case 'okey101': return Entry.open('okey101');
      case 'duz': return Entry.open('duz');
      case 'tavla': return Entry.open('tavla');
      case 'aviator': return Aviator.open();
      case 'slots': return Entry.open('slots');
      case 'online': case 'private': return Okey.createPrivate('101');
      case 'quick': return quick();
      case 'zeus': case 'peri': case 'misir': case 'korsan': case 'vegas': case 'ejderha': case 'altin': return Games.open(id);
      case 'daily': return Screens.dailyModal();
      case 'settings': return Screens.settings();
      case 'support': return Screens.help();
      case 'logout': return UI.confirm('Hesabından çıkış yapılsın mı?', 'Çıkış').then(ok => ok && Screens.logout());
      case 'tickets': return ticketsInfo();
      default: return panel(id);
    }
  }
  async function quick() {
    // HIZLI GİRİŞ: kayıtlı Okey seçeneklerinle ücretsiz masada anında eşleş
    let o = { mode: 'tekli', rounds: 1, katlamali: true }; try { o = Object.assign(o, JSON.parse(localStorage.getItem('okey_opts')) || {}); } catch (e) { /* */ }
    try { const r = await Api.post('/api/okey/quick', { ...o, stake: 0 }); toast('Masaya oturuyorsun…'); Okey.openTable(r.tableId); } catch (e) { toast(e.message, true); }
  }
  function ticketsInfo() {
    modal(`<h3 class="gold">🎟️ Biletler</h3><p class="center">Biletin: <b>${fmt(S().me.tickets || 0)}</b></p><div class="list small">
      <div class="li"><span>🎁</span><div class="grow">Her günlük giriş ödülü <b>+1 bilet</b></div></div>
      <div class="li"><span>🏆</span><div class="grow">Başarımlar <b>1–10 bilet</b></div></div>
      <div class="li"><span>🎡</span><div class="grow">Şans Çarkı'ndan <b>1–3 bilet</b> çıkabilir</div></div>
      <div class="li"><span>👥</span><div class="grow">Arkadaşını davet et: <b>+2 bilet</b> (o da +2 alır)</div></div></div>
      <p class="small muted center">Biletler haftalık turnuvalara katılım ve ekstra çark çevirmek içindir. Satın alınamaz, nakde çevrilemez.</p>
      <div class="row"><button class="btn gold grow" data-close="t">🏆 Turnuvalar</button><button class="btn purple grow" data-close="w">🎡 Şans Çarkı</button></div>`).then(x => { if (x === 't') panel('tournaments'); if (x === 'w') panel('wheel'); });
  }

  /* ===================== PANELLER ===================== */
  const TITLES = { leaders: '📊 Liderlik Tablosu', profile: '👤 Profilim', tournaments: '🏆 Turnuvalar', messages: '✉️ Mesajlar ve Arkadaşlar', chat: '💬 Canlı Sohbet', achievements: '🏅 Başarılar ve Görevler', stats: '📊 İstatistiklerim',
    gifts: '🎁 Hediyeler ve Bildirimler', wheel: '🎡 Şans Çarkı', puzzle: '🧩 Bulmaca', others: '🎰 Diğer Oyunlar', shop: '💎 Mağaza', friends: '👥 Arkadaşlar', quests: '📜 Günlük Görevler' };
  function stopPanelTimers() { clearInterval(P.chatTimer); clearInterval(P.threadTimer); clearInterval(P.winTimer); P.chatTimer = P.threadTimer = P.winTimer = null; }
  function panel(id, arg) {
    stopPanelTimers(); P.panel = id; const mm = $('#main'); if (mm) mm.dataset.hall = '0';
    UI.screen('main', `<div class="pbg"></div>${topHtml(false)}
      <div class="phead"><button class="pback" data-p="home">◀ Ana Sayfa</button><b class="ptitle">${TITLES[id] || ''}</b><div class="ptabs" id="pTabs"></div></div>
      <div class="pbody" id="pBody"><p class="center muted">Yükleniyor…</p></div>${bottomHtml(id)}`);
    UI.show('main'); bind($('#main')); Screens.renderTop(); renderBadges();
    const body = $('#pBody');
    const R = { leaders: () => leaders(body, arg), profile: () => Screens.profile(body), shop: () => Screens.shop(body), friends: () => friendsTab(body), quests: () => Screens.quests(body),
      tournaments: () => tournaments(body), messages: () => messages(body, arg), chat: () => chat(body), achievements: () => achievements(body, arg), stats: () => stats(body),
      gifts: () => gifts(body), wheel: () => wheel(body), puzzle: () => puzzle(body), others: () => others(body) };
    Promise.resolve((R[id] || (() => { body.innerHTML = '<p class="center">Bulunamadı</p>'; }))()).catch(e => { body.innerHTML = `<p class="err center">${esc(e.message)}</p>`; });
  }
  const tabs = (list, cur, fn) => { const t = $('#pTabs'); t.innerHTML = list.map(([k, n]) => `<button class="${k === cur ? 'on' : ''}" data-tb="${k}">${n}</button>`).join(''); $$('[data-tb]', t).forEach(b => b.onclick = (e) => { e.stopPropagation(); Sound.play('click'); fn(b.dataset.tb); }); };
  const left = (ms) => { if (ms <= 0) return 'bitti'; const d = Math.floor(ms / 86400e3), h = Math.floor(ms % 86400e3 / 3600e3), m = Math.floor(ms % 3600e3 / 60e3); return d ? `${d}g ${h}s` : h ? `${h}s ${m}dk` : `${m}dk`; };
  const GAME_N = { slots: '🎰 Slot', okey: '🀄 101 Okey' };

  async function leaders(body, by) {
    by = by || 'level';
    tabs([['level', 'Seviye'], ['okey', 'Okey'], ['tavla', 'Tavla'], ['aviator', 'Avivasor'], ['slots', 'Slot']], by, (t) => leaders(body, t));
    const r = await Api.get('/api/leaderboard?by=' + by);
    const val = (x) => by === 'level' ? `Sv${x.level} · ${fmt(x.value)} XP` : by === 'aviator' ? `${x.value.toFixed(2)}x en iyi tahsil` : by === 'slots' ? `${fmt(x.value)} en büyük kazanç` : `${x.value} galibiyet · ${x.played} oyun`;
    body.innerHTML = `<div class="ldr">${r.top.map((x, i) => `<div class="ldrow ${x.me ? 'me' : ''} ${i < 3 ? 'top' + (i + 1) : ''}"><b class="ldn">${i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</b><span class="avatar sm">${AVATARS[x.avatar] || UI.AVATARS[0]}</span><b class="grow">${esc(x.username)}</b><span class="ldv">${val(x)}</span></div>`).join('') || '<p class="center muted">Henüz kayıt yok — ilk sen ol!</p>'}</div>
      <p class="small muted center">${by === 'aviator' || by === 'slots' ? 'Son 7 gün · ' : ''}Gerçek oyun kayıtlarından · yöneticiler listelenmez</p>`;
  }
  async function tournaments(body) {
    const r = await Api.get('/api/tournaments'); const now = r.now;
    body.innerHTML = `<div class="pgrid">${r.tournaments.map(t => `<div class="tcard ${t.kind} ${t.status}">
      <div class="row"><span class="pill">${t.kind === 'daily' ? 'GÜNLÜK' : t.kind === 'weekly' ? 'HAFTALIK' : 'ÖZEL'}</span><span class="pill">${GAME_N[t.game]}</span><span class="grow"></span><span class="small">${t.status === 'active' ? '⏳ ' + left(t.endsAt - now) : 'Bitti'}</span></div>
      <b class="tt">${esc(t.title)}</b>
      <div class="tpz">${t.prizes.slice(0, 3).map((p, i) => `<span>${['🥇', '🥈', '🥉'][i]} ${fmt(p)}</span>`).join('')}<small>+${t.prizes.length - 3} ödül</small></div>
      <div class="small muted">${t.players} oyuncu · Katılım: ${t.entryTickets ? t.entryTickets + ' 🎟️' : 'ücretsiz'} · ${t.game === 'slots' ? 'Puan = kazanç/bahis × 100' : 'Puan = masa sıralaması'}</div>
      ${t.joined ? `<div class="tme">Puanın <b>${fmt(t.myScore || 0)}</b>${t.myRank ? ` · ${t.myRank}. oldun${t.myPrize ? ' · +' + fmt(t.myPrize) : ''}` : ''}</div>` : ''}
      <div class="row">${t.status === 'active' && !t.joined ? `<button class="btn green sm grow" data-j="${t.id}">KATIL</button>` : ''}<button class="btn ghost sm grow" data-lb="${t.id}">Sıralama</button>${t.status === 'active' && t.joined ? `<button class="btn gold sm grow" data-go="${t.game}">Oyna ▶</button>` : ''}</div></div>`).join('')}</div>`;
    $$('[data-j]', body).forEach(b => b.onclick = (e) => { e.stopPropagation(); guard(b, async () => { await Api.post(`/api/tournaments/${b.dataset.j}/join`, {}); toast('Turnuvaya katıldın! Puanların bundan sonra sayılır.'); await Screens.refresh(); tournaments(body); }); });
    $$('[data-lb]', body).forEach(b => b.onclick = (e) => { e.stopPropagation(); board(+b.dataset.lb); });
    $$('[data-go]', body).forEach(b => b.onclick = (e) => { e.stopPropagation(); b.dataset.go === 'okey' ? Entry.open('okey101') : Entry.open('slots'); });
  }
  async function board(id) {
    const r = await Api.get('/api/tournaments/' + id);
    modal(`<h3 class="gold">${esc(r.tournament.title)}</h3>${r.me ? `<p class="center">Senin sıran: <b>${r.me.pos}.</b> · ${fmt(r.me.score)} puan</p>` : ''}
      <div class="list">${r.top.map((x, i) => `<div class="li"><b style="width:28px">${i + 1}.</b><span class="avatar" style="width:30px;height:30px;font-size:16px">${AVATARS[x.avatar] || UI.AVATARS[0]}</span><div class="grow"><b>${esc(x.username)}</b></div><span>${fmt(x.score)}</span>${r.tournament.prizes[i] ? `<small class="gold" style="margin-left:6px">${fmt(x.prize || r.tournament.prizes[i])}</small>` : ''}</div>`).join('') || '<p class="center muted">Henüz katılan yok.</p>'}</div>`);
  }

  async function messages(body, tab) {
    tab = tab || 'conv';
    tabs([['conv', 'Sohbetler'], ['friends', 'Arkadaşlar']], tab, (t) => messages(body, t));
    if (tab === 'friends') return friendsTab(body);
    const [c, f] = await Promise.all([Api.get('/api/messages'), Api.get('/api/friends')]);
    body.innerHTML = `<div class="msgw"><div class="msgl"><div class="section-t">💬 Sohbetler</div><div class="list" id="cvList">${c.conversations.map(x => `<div class="li cv" data-u="${x.id}"><span class="avatar sm">${AVATARS[x.avatar] || UI.AVATARS[0]}${x.online ? '<i class="on"></i>' : ''}</span><div class="grow"><b>${esc(x.username)}</b><small>${x.mine ? 'Sen: ' : ''}${esc(x.last)}</small></div>${x.unread ? `<span class="dot">${x.unread}</span>` : ''}</div>`).join('') || '<p class="small muted">Henüz mesaj yok.</p>'}</div>
      <div class="section-t">🟢 Arkadaşlar</div><div class="list">${f.friends.map(x => `<div class="li cv" data-u="${x.id}"><span class="avatar sm">${AVATARS[x.avatar] || UI.AVATARS[0]}${x.online ? '<i class="on"></i>' : ''}</span><div class="grow"><b>${esc(x.username)}</b><small>${x.online ? 'Çevrim içi' : 'Çevrim dışı'}</small></div></div>`).join('') || '<p class="small muted">Arkadaş eklemek için “Arkadaşlar” sekmesine geç.</p>'}</div></div>
      <div class="msgr" id="thread"><p class="center muted" style="margin-top:120px">Bir sohbet seç</p></div></div>`;
    $$('.cv', body).forEach(x => x.onclick = (e) => { e.stopPropagation(); openThread(+x.dataset.u); });
    if (P.thread) openThread(P.thread);
  }
  async function openThread(uid) {
    P.thread = uid; clearInterval(P.threadTimer);
    const el = $('#thread'); if (!el) return;
    const load = async () => {
      const r = await Api.get('/api/messages/' + uid).catch(() => null); if (!r || !$('#thread')) return;
      const box = $('#thBox'); const stick = !box || box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
      if (!box) {
        el.innerHTML = `<div class="thh"><span class="avatar sm">${AVATARS[r.user.avatar] || UI.AVATARS[0]}${r.user.online ? '<i class="on"></i>' : ''}</span><b>${esc(r.user.username)}</b><small>${r.user.online ? 'çevrim içi' : ''}</small></div><div class="thbox" id="thBox"></div>
          ${r.friends ? '<div class="thin"><input id="thI" maxlength="300" placeholder="Mesaj yaz…"><button class="btn green sm" id="thS">Gönder</button></div>' : '<p class="small muted center">Sadece arkadaşlarına mesaj gönderebilirsin.</p>'}`;
        const send = () => { const v = $('#thI').value.trim(); if (!v) return; $('#thI').value = ''; Api.post('/api/messages/' + uid, { body: v }).then(load).catch(e => toast(e.message, true)); };
        $('#thS') && ($('#thS').onclick = send); $('#thI') && ($('#thI').onkeydown = (e) => { if (e.key === 'Enter') send(); });
      }
      const me = S().me.id;
      $('#thBox').innerHTML = r.messages.map(m => `<div class="bub ${m.from_id === me ? 'me' : ''}"><span>${esc(m.body)}</span><small>${new Date(Number(m.created_at)).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') || '<p class="center small muted">İlk mesajı sen gönder 👋</p>';
      if (stick) $('#thBox').scrollTop = 1e9;
      Screens.refresh().then(renderBadges).catch(() => {});
    };
    await load(); P.threadTimer = setInterval(() => { if (!document.hidden) load(); }, 4000);
  }
  async function friendsTab(body) {
    await Screens.friends(body);
    const st = S(); const ref = st.me.username;
    const inv = document.createElement('div'); inv.className = 'card invite';
    inv.innerHTML = `<div class="section-t">📨 Arkadaşını SPINOVA'ya davet et</div><p class="small">Davetle katılan arkadaşın <b>+2 bilet</b>, sen <b>10.000 jeton + 2 bilet</b> kazanırsın. Kayıtta davet kodu olarak kullanıcı adını yazması yeterli: <b class="gold">${esc(ref)}</b></p>
      <div class="row"><button class="btn green sm grow" id="invWa">WhatsApp ile paylaş</button><button class="btn ghost sm grow" id="invCp">Kopyala</button></div>`;
    body.prepend(inv);
    const text = `SPINOVA 101 OKEY'de okey, tavla ve slot oynuyorum, sen de gel! Kayıt olurken davet kodu: ${ref} (sanal jeton, eğlence amaçlı)`;
    $('#invWa').onclick = () => share(text); $('#invCp').onclick = () => copy(text);
  }
  function chat(body) {
    P.chatLast = 0;
    body.innerHTML = `<div class="chatw"><div class="chatbox" id="chBox"></div><div class="thin"><input id="chI" maxlength="200" placeholder="Herkese yaz… (bağlantı paylaşılamaz)"><button class="btn green sm" id="chS">Gönder</button></div><p class="small muted" id="chOn"></p></div>`;
    const me = S().me.id;
    const load = async () => {
      const r = await Api.get('/api/chat?after=' + P.chatLast).catch(() => null); if (!r || !$('#chBox')) return;
      const box = $('#chBox'); const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 30;
      box.insertAdjacentHTML('beforeend', r.messages.map(m => `<div class="cm ${m.uid === me ? 'me' : ''}"><span class="avatar sm">${AVATARS[m.avatar] || UI.AVATARS[0]}</span><div><b>${esc(m.username)}${m.role === 'admin' ? ' <span class="pill">YÖNETİCİ</span>' : ''}</b><span>${esc(m.body)}</span></div><small>${new Date(Number(m.created_at)).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</small></div>`).join(''));
      if (r.messages.length) P.chatLast = r.messages[r.messages.length - 1].id;
      while (box.children.length > 120) box.firstChild.remove();
      if (stick || r.messages.length && r.messages[r.messages.length - 1].uid === me) box.scrollTop = 1e9;
      $('#chOn').textContent = `🟢 ${r.online} kişi çevrim içi · Saygılı ol; kişisel bilgi paylaşma.`;
    };
    const send = () => { const v = $('#chI').value.trim(); if (!v) return; $('#chI').value = ''; Api.post('/api/chat', { body: v }).then(load).catch(e => toast(e.message, true)); };
    $('#chS').onclick = send; $('#chI').onkeydown = (e) => { if (e.key === 'Enter') send(); };
    load(); P.chatTimer = setInterval(() => { if (!document.hidden) load(); }, 3000);
  }
  async function achievements(body, tab) {
    tab = tab || 'ach';
    tabs([['ach', 'Başarımlar'], ['quests', 'Günlük Görevler']], tab, (t) => achievements(body, t));
    if (tab === 'quests') return Screens.quests(body);
    const r = await Api.get('/api/achievements');
    body.innerHTML = `<div class="pgrid">${r.achievements.map(a => `<div class="acard ${a.claimed ? 'claimed' : a.done ? 'done' : ''}"><div class="aic">${a.claimed ? '✅' : a.done ? '🏅' : '🔒'}</div><div class="grow"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>
      <div class="xpbar" style="height:10px;margin-top:4px"><i style="width:${a.progress / a.goal * 100}%"></i><em>${fmt(a.progress)} / ${fmt(a.goal)}</em></div><small class="gold">${fmt(a.coins)} jeton${a.tickets ? ' + ' + a.tickets + ' 🎟️' : ''}</small></div>
      ${a.done && !a.claimed ? `<button class="btn green sm" data-a="${a.id}">AL</button>` : ''}</div>`).join('')}</div>`;
    $$('[data-a]', body).forEach(b => b.onclick = (e) => { e.stopPropagation(); guard(b, async () => { const x = await Api.post(`/api/achievements/${b.dataset.a}/claim`, {}); Sound.play('bigwin'); UI.coinShower(30); toast(`+${fmt(x.coins)} jeton${x.tickets ? ' +' + x.tickets + ' bilet' : ''}`); await Screens.refresh(); achievements(body, 'ach'); }); });
  }
  async function stats(body) {
    const s = (await Api.get('/api/me/stats')).stats; const g = (S().games || []).find(x => x.id === s.favoriteGame);
    const box = (ic, t, v) => `<div class="scard"><span>${ic}</span><b>${v}</b><small>${t}</small></div>`;
    body.innerHTML = `<div class="sgrid">${box('🎰', 'Slot turu', fmt(s.spins))}${box('💰', 'Toplam bahis', fmt(s.totalWagered))}${box('🪙', 'Toplam kazanç', fmt(s.totalWon))}${box('⚡', 'En büyük kazanç', fmt(s.biggestWin))}
      ${box('🔥', 'Büyük kazanç (20x+)', fmt(s.bigwins))}${box('⭐', 'Favori oyun', esc(g ? g.name : '—'))}${box('🀄', 'Okey oyunu', fmt(s.okeyPlayed))}${box('🏆', 'Okey galibiyeti', fmt(s.okeyWon))}
      ${box('🧩', 'Çözülen bulmaca', fmt(s.puzzles))}${box('🎡', 'Çark çevirme', fmt(s.wheelSpins))}${box('🏟️', 'Turnuva', fmt(s.tournaments))}${box('👥', 'Arkadaş', fmt(s.friends))}</div>
      <p class="small muted center">Gerçekleşen kazanç oranın: ${s.totalWagered ? (s.totalWon / s.totalWagered * 100).toFixed(1) + '%' : '—'} (kısa vadede oyunların teorik RTP'sinden sapabilir).</p>`;
  }
  async function gifts(body) {
    const st = S(); const [f, n] = await Promise.all([Api.get('/api/friends'), Api.get('/api/notifications')]);
    const lr = st.levelRewards;
    body.innerHTML = `<div class="pgrid">
      <div class="card"><div class="section-t">🎁 Günlük giriş ödülü</div><p class="small">${st.daily.available ? `Hazır: <b>${fmt(st.daily.amount)}</b> jeton + 1 🎟️` : 'Yarın tekrar gel!'}</p><button class="btn ${st.daily.available ? 'green' : 'ghost'} block" id="gD">${st.daily.available ? 'TOPLA' : 'Ayrıntılar'}</button></div>
      <div class="card"><div class="section-t">🏆 Seviye ödülleri</div><p class="small">${lr && lr.pending.count ? `${lr.pending.count} ödül hazır: <b>+${fmt(lr.pending.coins)}</b>` : 'Sıradaki ödül için seviye atla.'}</p><button class="btn ${lr && lr.pending.count ? 'green' : 'ghost'} block" id="gL">Seviye Ödülleri</button></div>
      <div class="card"><div class="section-t">👥 Arkadaşlarından hediyeler</div>${f.gifts.length ? `<div class="list">${f.gifts.map(g => `<div class="li"><span>🎁</span><div class="grow"><b>${esc(g.username)}</b><small>${fmt(g.amount)} jeton</small></div><button class="btn green sm" data-g="${g.id}">AL</button></div>`).join('')}</div>` : '<p class="small muted">Bekleyen hediye yok.</p>'}</div>
      <div class="card" style="grid-column:1/-1"><div class="section-t">🔔 Bildirimler</div><div class="list">${n.notifications.map(x => `<div class="li ${x.read_at ? '' : 'unread'}"><div class="grow"><b>${esc(x.title)}</b><small>${esc(x.body || '')}</small></div><small class="muted">${new Date(Number(x.created_at)).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('') || '<p class="small muted">Bildirim yok.</p>'}</div></div></div>`;
    $('#gD').onclick = (e) => { e.stopPropagation(); Screens.dailyModal(); }; $('#gL').onclick = (e) => { e.stopPropagation(); Screens.levelRewardsModal(); };
    $$('[data-g]', body).forEach(b => b.onclick = (e) => { e.stopPropagation(); guard(b, async () => { const r = await Api.post(`/api/gifts/${b.dataset.g}/claim`, {}); Screens.setBalance(r.balance, true); Sound.play('coin'); await Screens.refresh(); gifts(body); }); });
    if (n.notifications.some(x => !x.read_at)) Api.post('/api/notifications/read', {}).then(() => Screens.refresh()).then(renderBadges).catch(() => {});
  }
  async function wheel(body) {
    const w = await Api.get('/api/wheel'); const N = w.segments.length, seg = 360 / N;
    const cols = ['#ff4d6d', '#ffd34d', '#7dff6b', '#7fd8ff', '#ff9ae8', '#b37aff', '#ff9a3c', '#3ce0c8', '#ffe066', '#ff5ac8'];
    const grad = w.segments.map((s, i) => `${cols[i % cols.length]} ${i * seg}deg ${(i + 1) * seg}deg`).join(',');
    body.innerHTML = `<div class="whw"><div class="whwrap"><div class="whptr">▼</div><div class="wheel" id="whl" style="background:conic-gradient(${grad})">${w.segments.map((s, i) => `<span style="transform:rotate(${i * seg + seg / 2}deg)"><b>${esc(s.label)}</b></span>`).join('')}<i class="whhub">🎡</i></div></div>
      <div class="whside"><h3 class="gold">ŞANS ÇARKI</h3><p>${w.freeAvailable ? '<b class="gold">Günlük ücretsiz çevirmen hazır!</b>' : `Ücretsiz çevirme: <b>${left(w.nextFreeAt - Date.now())}</b> sonra`}</p>
        <button class="btn green block big" id="whGo">${w.freeAvailable ? 'ÜCRETSİZ ÇEVİR' : 'ÇEVİR · 1 🎟️'}</button><p class="small muted">Biletin: ${fmt(S().me.tickets || 0)} · Sonuç sunucuda güvenli rastgele sayıyla belirlenir.</p><div id="whRes"></div></div></div>`;
    $('#whGo').onclick = (e) => { e.stopPropagation(); guard($('#whGo'), async () => {
      const r = await Api.post('/api/wheel/spin', { useTicket: !w.freeAvailable }); Sound.play('spin');
      const el = $('#whl'); const target = 360 * 6 + (360 - (r.index * seg + seg / 2));
      el.style.transition = 'none'; el.style.transform = 'rotate(0deg)'; void el.offsetWidth;
      el.style.transition = 'transform 4.2s cubic-bezier(.12,.75,.15,1)'; el.style.transform = `rotate(${target}deg)`;
      await new Promise(res => setTimeout(res, 4300));
      Sound.play('bigwin'); UI.coinShower(25); $('#whRes').innerHTML = `<div class="whwin">🎉 ${esc(r.prize.label)}${r.prize.coins ? ' jeton' : ''} kazandın!</div>`;
      Screens.setBalance(r.balance, true); await Screens.refresh(); renderBadges();
      $('#whGo').textContent = 'ÇEVİR · 1 🎟️'; w.freeAvailable = false;
    }); };
  }
  async function puzzle(body, size) {
    size = size || 3;
    const r = await Api.post('/api/puzzle/start', { size }); const n = r.size; let b = r.board.slice(); const moves = []; const t0 = Date.now();
    const imgs = { puzzle: 'card_puzzle', zeus: 'card_zeusslot', okey: 'card_okey101', peri: 'menu_fairy' };
    const img = `assets/${imgs[r.image] || 'card_puzzle'}.webp`;
    body.innerHTML = `<div class="pzw"><div class="pzb" id="pzb" style="--n:${n}"></div>
      <div class="pzside"><h3 class="gold">BULMACA</h3><p class="small">Parçaları boşluğa kaydırarak resmi tamamla. Bir parçaya dokunman yeterli.</p>
      <div class="kv small"><b>Hamle</b><span id="pzM">0</span><b>Süre</b><span id="pzT">0 sn</span><b>Ödül</b><span>${r.rewardsLeft ? fmt(r.reward) + ' jeton' : 'bugünkü ödüller bitti'}</span><b>Kalan ödüllü</b><span>${r.rewardsLeft} / 5</span></div>
      <img src="${img}" class="pzprev" alt="">
      <div class="row"><button class="btn ghost sm grow" id="pz3">3×3 Yeni</button><button class="btn ghost sm grow" id="pz4">4×4 Yeni</button></div></div></div>`;
    const pzb = $('#pzb'), cell = 100 / n;
    const draw = () => { pzb.innerHTML = b.map((v, i) => v === 0 ? `<div class="pzt empty"></div>` : `<div class="pzt" data-i="${i}" style="background-image:url(${img});background-size:${n * 100}% ${n * 100}%;background-position:${((v - 1) % n) * 100 / (n - 1)}% ${Math.floor((v - 1) / n) * 100 / (n - 1)}%"><i>${v}</i></div>`).join(''); };
    draw();
    const tm = setInterval(() => { const e = $('#pzT'); if (!e) return clearInterval(tm); e.textContent = Math.round((Date.now() - t0) / 1000) + ' sn'; }, 1000);
    pzb.addEventListener('pointerdown', async (e) => {
      const t = e.target.closest('[data-i]'); if (!t) return; e.preventDefault();
      const i = +t.dataset.i, z = b.indexOf(0), r0 = Math.floor(i / n), c0 = i % n, rz = Math.floor(z / n), cz = z % n;
      if (Math.abs(r0 - rz) + Math.abs(c0 - cz) !== 1) return Sound.play('error');
      b[z] = b[i]; b[i] = 0; moves.push(i); Sound.play('click'); draw(); $('#pzM').textContent = moves.length;
      if (b.every((v, k) => v === (k + 1) % (n * n))) {
        clearInterval(tm);
        try { const s = await Api.post(`/api/puzzle/${r.id}/solve`, { moves }); Sound.play('bigwin'); UI.coinShower(30);
          modal(`<h3 class="gold">🧩 Tebrikler!</h3><p class="center">${s.moves} hamle · ${s.seconds} saniye</p>${s.reward ? `<p class="center gold" style="font-size:22px">+${fmt(s.reward)} jeton</p>` : '<p class="center small">Bugünkü ödüllü bulmaca hakkın doldu.</p>'}<button class="btn green block" data-close="1">Yeni Bulmaca</button>`).then(() => puzzle(body, n));
          if (s.balance != null) Screens.setBalance(s.balance, true);
        } catch (er) { toast(er.message, true); }
      }
    });
    $('#pz3').onclick = (e) => { e.stopPropagation(); clearInterval(tm); puzzle(body, 3); }; $('#pz4').onclick = (e) => { e.stopPropagation(); clearInterval(tm); puzzle(body, 4); };
  }
  function others(body) {
    const st = S();
    body.innerHTML = `<div class="ogrid">${st.games.map(g => { const th = Sym.THEMES[g.id]; return `<div class="ocard" data-id="${g.id}" style="--b1:${th.b1};--b2:${th.b2};--frame:${th.frame}"><img class="${th.cardAlpha ? 'alpha' : 'cover'}" src="assets/${th.card}.webp" alt=""><b>${esc(g.name)}</b><small>${esc(g.tag || '')} · ${esc(g.info && g.info.volatility || '')} volatilite</small></div>`; }).join('')}
      <div class="ocard okeyc" data-ok="1"><img class="cover" src="assets/card_okey101.webp" alt=""><b>101 Okey</b><small>Online · Tekli / Eşli</small></div></div>`;
    $$('.ocard[data-id]', body).forEach(c => c.onclick = (e) => { e.stopPropagation(); Sound.play('click'); Games.open(c.dataset.id); });
    $('.ocard[data-ok]', body).onclick = (e) => { e.stopPropagation(); Okey.lobby(); };
  }

  /* ===================== paylaşım ===================== */
  function share(text) {
    const url = 'https://wa.me/?text=' + encodeURIComponent(text);
    try { if (navigator.share) return navigator.share({ text }).catch(() => window.open(url, '_blank')); } catch (e) { /* */ }
    window.open(url, '_blank');
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Kopyalandı ✓'); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); toast('Kopyalandı ✓'); } catch (x) { toast('Kopyalanamadı', true); } t.remove(); }
  }

  window.Platform = { initStage, fit, home, panel, open, renderBadges, share, copy, current: () => P.panel, setCurrent: (x) => { stopPanelTimers(); P.panel = x; }, stop: stopPanelTimers, joinCode, askText };
})();
