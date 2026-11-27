/* SPINOVA — ÇİZİM SEMBOLLER (5.0.26)
 * Önceden emoji olan slot sembollerinin yerine SPINOVA'ya özgü, her cihazda aynı görünen vektör çizimler.
 * Hepsi 100×100 görüntü alanında; parlaklık ve gölge degradeyle verilir (filtre yok → hızlı). */
(function () {
  'use strict';
  const W = (id, body) => `<svg class="ssvg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
  const ART = {
    orange: W('or', `<defs><radialGradient id="or1" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffe2a0"/><stop offset=".35" stop-color="#ffa21a"/><stop offset=".8" stop-color="#e86400"/><stop offset="1" stop-color="#a83a00"/></radialGradient><linearGradient id="or2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ce06a"/><stop offset="1" stop-color="#1f7a2a"/></linearGradient></defs>
      <ellipse cx="50" cy="90" rx="30" ry="5" fill="rgba(0,0,0,.35)"/><circle cx="50" cy="56" r="33" fill="url(#or1)"/>
      <g fill="#c25200" opacity=".35"><circle cx="38" cy="62" r="1.6"/><circle cx="58" cy="70" r="1.6"/><circle cx="66" cy="52" r="1.6"/><circle cx="46" cy="76" r="1.6"/><circle cx="30" cy="50" r="1.4"/></g>
      <ellipse cx="38" cy="42" rx="11" ry="7" fill="#fff" opacity=".55" transform="rotate(-30 38 42)"/>
      <path d="M50 24 C52 16 58 12 64 12 C62 18 58 23 50 24Z" fill="url(#or2)" stroke="#145a1e" stroke-width="1.2"/><rect x="48" y="20" width="4" height="8" rx="2" fill="#6b3a12"/>`),
    parrot: W('pr', `<defs><linearGradient id="pr1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4b3a"/><stop offset="1" stop-color="#b8100c"/></linearGradient><linearGradient id="pr2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3fd0ff"/><stop offset="1" stop-color="#1050c8"/></linearGradient><linearGradient id="pr3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe14a"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs>
      <ellipse cx="50" cy="92" rx="26" ry="4" fill="rgba(0,0,0,.35)"/>
      <path d="M44 60 L30 92 L40 90 L46 70Z" fill="url(#pr2)"/><path d="M50 62 L44 94 L54 90 L56 68Z" fill="url(#pr3)"/>
      <path d="M58 30 C76 30 80 52 72 66 C66 76 50 78 42 70 C34 62 36 44 44 36 C48 32 52 30 58 30Z" fill="url(#pr1)"/>
      <path d="M46 46 C58 50 64 62 60 72 C52 74 44 70 40 62 C38 54 40 48 46 46Z" fill="url(#pr2)"/><path d="M48 54 C56 58 58 64 56 70 C50 70 46 66 44 60Z" fill="url(#pr3)"/>
      <path d="M70 30 C80 30 86 38 84 46 C80 44 76 44 72 46 C74 40 72 34 70 30Z" fill="#f4e9d6" stroke="#5a4630" stroke-width="1.5"/><path d="M72 46 C76 44 80 45 82 48 C78 50 74 50 72 46Z" fill="#3a2a1a"/>
      <circle cx="64" cy="38" r="6" fill="#fff"/><circle cx="65" cy="38" r="3" fill="#111"/><circle cx="66" cy="37" r="1" fill="#fff"/>
      <ellipse cx="54" cy="36" rx="7" ry="4" fill="#fff" opacity=".35" transform="rotate(-25 54 36)"/>`),
    ship: W('sh', `<defs><linearGradient id="sh1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a0612a"/><stop offset="1" stop-color="#4a2408"/></linearGradient><linearGradient id="sh2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#d9cbb0"/></linearGradient><linearGradient id="sh3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fd0e0"/><stop offset="1" stop-color="#0a5a78"/></linearGradient></defs>
      <path d="M8 80 Q25 72 42 80 T76 80 T100 78 L100 100 L0 100 L0 80Z" fill="url(#sh3)" opacity=".9"/>
      <rect x="47" y="10" width="4" height="62" fill="#5a3410"/><path d="M51 14 L80 30 L51 46Z" fill="url(#sh2)" stroke="#a89470"/><path d="M47 18 L22 40 L47 50Z" fill="url(#sh2)" stroke="#a89470"/>
      <path d="M51 48 L74 58 L51 66Z" fill="url(#sh2)" stroke="#a89470"/><path d="M51 8 L64 11 L51 14Z" fill="#111"/>
      <circle cx="57" cy="11" r="1.6" fill="#fff"/>
      <path d="M14 66 L86 66 L76 84 L24 84Z" fill="url(#sh1)" stroke="#2a1404" stroke-width="1.5"/><path d="M18 70 H82" stroke="#d6a45a" stroke-width="2"/>
      <g fill="#2a1404"><circle cx="34" cy="76" r="2.2"/><circle cx="46" cy="76" r="2.2"/><circle cx="58" cy="76" r="2.2"/><circle cx="70" cy="76" r="2.2"/></g>`),
    coin: W('cn', `<defs><radialGradient id="cn1" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff6c0"/><stop offset=".45" stop-color="#f2b81c"/><stop offset="1" stop-color="#8a5a00"/></radialGradient><radialGradient id="cn2" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd84a"/><stop offset="1" stop-color="#c88a10"/></radialGradient></defs>
      <ellipse cx="50" cy="90" rx="30" ry="5" fill="rgba(0,0,0,.35)"/><circle cx="50" cy="50" r="38" fill="url(#cn1)" stroke="#7a5000" stroke-width="2"/><circle cx="50" cy="50" r="29" fill="url(#cn2)" stroke="#a8740a" stroke-width="2"/>
      <rect x="44" y="34" width="12" height="12" fill="none" stroke="#8a5a00" stroke-width="3" transform="rotate(45 50 40)"/>
      <path d="M33 60 H67 M38 66 H62" stroke="#8a5a00" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="38" cy="32" rx="10" ry="5" fill="#fff" opacity=".6" transform="rotate(-35 38 32)"/>`),
    lantern: W('ln', `<defs><radialGradient id="ln1" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffe08a"/><stop offset=".35" stop-color="#ff4030"/><stop offset="1" stop-color="#8a0a0a"/></radialGradient></defs>
      <ellipse cx="50" cy="92" rx="22" ry="4" fill="rgba(0,0,0,.35)"/><rect x="48" y="4" width="4" height="12" fill="#6b3a12"/>
      <rect x="34" y="14" width="32" height="8" rx="3" fill="#e6b84a" stroke="#7a5000"/><rect x="34" y="74" width="32" height="8" rx="3" fill="#e6b84a" stroke="#7a5000"/>
      <ellipse cx="50" cy="48" rx="30" ry="28" fill="url(#ln1)"/><g stroke="#7a0a0a" stroke-width="1.6" fill="none" opacity=".7"><ellipse cx="50" cy="48" rx="18" ry="28"/><ellipse cx="50" cy="48" rx="6" ry="28"/></g>
      <path d="M46 82 L44 96 M50 82 L50 98 M54 82 L56 96" stroke="#e6b84a" stroke-width="2"/><ellipse cx="38" cy="36" rx="8" ry="5" fill="#fff" opacity=".45" transform="rotate(-30 38 36)"/>`),
    dragon: W('dg', `<defs><linearGradient id="dg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dff8a"/><stop offset=".5" stop-color="#1fa84a"/><stop offset="1" stop-color="#0a4a20"/></linearGradient><linearGradient id="dg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe14a"/><stop offset="1" stop-color="#d48a00"/></linearGradient></defs>
      <ellipse cx="50" cy="92" rx="30" ry="5" fill="rgba(0,0,0,.35)"/>
      <path d="M20 80 C10 60 22 40 40 44 C30 52 32 64 44 66 C60 68 66 54 60 44 C76 50 82 70 68 82 C56 92 32 92 20 80Z" fill="url(#dg1)" stroke="#06381a" stroke-width="1.5"/>
      <path d="M30 70 C34 76 44 78 52 76" stroke="url(#dg2)" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M48 46 C46 30 56 16 72 16 C86 16 92 28 88 38 C84 46 74 48 66 46 C62 50 54 52 48 46Z" fill="url(#dg1)" stroke="#06381a" stroke-width="1.5"/>
      <path d="M70 18 L76 4 L80 18Z M82 22 L92 10 L90 26Z" fill="url(#dg2)"/><path d="M86 38 C92 40 96 44 94 48 C90 46 86 44 84 42Z" fill="#ff5a3a"/>
      <circle cx="74" cy="28" r="5" fill="#fff"/><circle cx="75" cy="28" r="2.6" fill="#c81010"/>
      <path d="M58 30 C54 26 52 22 54 18" stroke="#0a4a20" stroke-width="2" fill="none"/><ellipse cx="62" cy="22" rx="7" ry="3" fill="#fff" opacity=".4" transform="rotate(-20 62 22)"/>`),
    pearl: W('pl', `<defs><radialGradient id="pl1" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#e8c8ff"/><stop offset=".75" stop-color="#9a5ad8"/><stop offset="1" stop-color="#3a1a6a"/></radialGradient><linearGradient id="pl2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe28a"/><stop offset="1" stop-color="#a86a0a"/></linearGradient></defs>
      <path d="M22 80 Q50 66 78 80 L72 92 Q50 84 28 92Z" fill="url(#pl2)" stroke="#6b4a0a" stroke-width="1.5"/>
      <circle cx="50" cy="48" r="30" fill="url(#pl1)"/><circle cx="50" cy="48" r="30" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
      <ellipse cx="40" cy="36" rx="11" ry="7" fill="#fff" opacity=".7" transform="rotate(-30 40 36)"/><circle cx="62" cy="60" r="3" fill="#fff" opacity=".6"/>
      <path d="M50 26 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#fff" opacity=".8"/>`),
    book: W('bk', `<defs><linearGradient id="bk1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d48a2a"/><stop offset=".5" stop-color="#8a4a0a"/><stop offset="1" stop-color="#4a2004"/></linearGradient><linearGradient id="bk2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff3c2"/><stop offset="1" stop-color="#e0c070"/></linearGradient></defs>
      <ellipse cx="50" cy="92" rx="34" ry="5" fill="rgba(0,0,0,.35)"/>
      <path d="M14 22 L50 30 L86 22 L86 84 L50 92 L14 84Z" fill="url(#bk1)" stroke="#2a1004" stroke-width="2"/>
      <path d="M20 26 L48 33 L48 86 L20 80Z" fill="url(#bk2)"/><path d="M80 26 L52 33 L52 86 L80 80Z" fill="url(#bk2)"/>
      <g stroke="#a8740a" stroke-width="1.6" opacity=".7"><path d="M24 40 L44 44 M24 50 L44 54 M24 60 L44 64 M24 70 L44 74"/></g>
      <path d="M66 42 C60 42 58 50 62 54 C58 56 58 64 66 64 C62 60 62 56 66 54 C62 50 62 46 66 42Z M70 44 L72 62" stroke="#a8740a" stroke-width="2" fill="#e0a000"/>
      <circle cx="66" cy="72" r="4" fill="#1d5fd0" stroke="#fff3c2"/><path d="M50 30 L50 92" stroke="#2a1004" stroke-width="2"/>`),
  };
  window.SymArt = { ART, has: (k) => !!ART[k], html: (k) => ART[k] || '' };
})();
