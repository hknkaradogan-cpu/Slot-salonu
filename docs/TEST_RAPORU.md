# SLOT SALONU 3.0 — Test ve Performans Raporu

Tarih: 26.11.2026 · Ortam: Linux, Node.js 22, Chromium (Playwright), mobil görünüm 412×915.
Canlı sunucu: Supabase (PostgreSQL), GitHub Actions üzerinden test edilip dağıtıldı.

## Özet

| Alan | Sonuç |
|---|---|
| Sunucu + oyun motoru otomatik testleri | **24 / 24 geçti** (`cd server && npm test`), her gönderimde CI'da tekrar çalışır |
| Canlı sunucu duman testi (Supabase) | sağlık ✓ · kurulum durumu ✓ · oyun listesi ✓ · kayıt + spin ✓ · oyuncu → yönetici ucu **403** ✓ |
| RTP simülasyonu (oyun profilleri) | 7 oyun × **10 milyon spin**, hepsi hedef RTP'nin %95 güven aralığında |
| RTP ölçekleme | 7 oyun × 5 milyon spin, hedef %90 → hepsi %89,4–%90,5 |
| Önceki doğrulama | 7 oyun × 50 milyon spin (%95), bonus satın alma 4 milyon alım/oyun |
| Tarayıcı uçtan uca | ilk kurulum → yönetici paneli (tüm sekmeler) → RTP değiştirme → oyuncu kaydı → seviye ödülleri → mağaza → profil → **e-posta ile giriş** → Zeus çarpanlı spin: **hatasız** |
| Akıcılık (CPU 4× yavaşlatılmış mobil emülasyon, 45 sn sürekli spin) | Zeus **58,1 FPS**, Kristal Peri **58,9 FPS** (2.3 öncesi sürüm: 2,4 FPS) |
| APK | **Derlendi** — 3.0.9 (versionCode 109), sabit anahtarla imzalı (SHA-256 71:8E:A3…D8:8D), GitHub Releases + sunucu güncelleme kanalı |

## 1. Otomatik testler
1. 1.000.000 seviye: XP formülü kesin (BigInt), sınırlar, taşma yok
2. Hızlı seviye atlama engeli: dev bahisle bile bir seviye en az ~25 spin
3. İlk kurulum: anahtarsız yönetici oluşturulamaz; kurulumdan sonra kapanır
4. Kayıt: e-posta doğrulaması yok, kullanıcı adı benzersiz, kullanıcı adı veya e-postayla giriş
5. Yönetici girişi: oyuncu yönetici girişi yapamaz; normal oturumla panel açılmaz
6. Spin: bahis/kazanç, XP sınırı, defter tutarlılığı, tekrar isteği çift işlem yapmaz
7. Oyun bazlı RTP: profiller farklı, yönetici değiştirir, kayıt tutulur, sonuç tohumdan yeniden üretilir
8. Bonus satın alma, yetersiz bakiye
9. Seviye ödülleri toplu ve bir kez; yüksek seviyede taşma yok
10. Günlük ödül 24 saatte bir; 100. seviye üstünde ölçeklenir
11. Ödeme: satın alındı, tekrar, bekleyen, iptal, başka hesap, iade
12. Yönetici işlemleri: jeton, seviye, şifre sıfırlama, askıya alma, işlem geçmişi, sınırsız jeton, performans raporu
13. Şifremi unuttum: kod tek kullanımlık
14. Görevler, etkinlik, arkadaş, hediye
15. Sürüm yükleme yalnızca CI kimliğiyle
16. Kalıcılık: sunucu yeniden başladığında bakiye/seviye/oturum korunur
17. Supabase paketinin (server-bundle.js) uçtan uca çalışması
18–24. Oyun motoru: kalibrasyon, azami kazanç, tumble kuralları, çarpanlar, özellik tetikleme, RNG belirleyiciliği ve düzgün dağılım (ki-kare)

## 2. RTP — 10 milyon spin/oyun (profil RTP'leri)

| Oyun | Hedef | Ölçülen | ±%95 GA | İsabet | Özellik |
|---|---|---|---|---|---|
| Zeus | 96,5% | 96,79% | ±0,57 | 25,0% | 1/637 |
| Mısır Hazineleri | 95,0% | 94,69% | ±0,43 | 34,3% | 1/194 |
| Vegas Meyveleri | 96,0% | 95,87% | ±0,48 | 13,7% | 1/584 |
| Kristal Peri | 95,5% | 95,27% | ±0,40 | 28,6% | 1/507 |
| Ejderha Hazinesi | 94,0% | 94,02% | ±0,56 | 40,5% | 1/119 |
| Korsan Hazinesi | 94,5% | 94,91% | ±0,68 | 24,4% | 1/447 |
| Altın Şans | 95,0% | 95,55% | ±0,58 | 47,5% | 1/284 |

Yüksek volatiliteli oyunlarda kısa vadeli sapma doğaldır; RTP uzun vadeli teorik değerdir.
Yeniden üretmek için: `cd server && node tools/simulate.js --rtp profil --spins 10000000`.

## 3. Akıcılık
- Parçacıklar önceden çizilmiş sprite'larla tek tuvalde (DPR 1), `shadowBlur` ve sembol filtreleri yok.
- Zeus yıldırımı: yalnızca SVG çizgi + transform/opacity animasyonu, bulanıklık filtresi yok.
- Uzun oturum: animasyonlar oyun kapanınca nesil sayacıyla iptal edilir; DOM düğümleri temizlenir.
- Cihazlardan gelen gerçek FPS değerleri yönetici paneli → **Performans** sekmesinde görülür (oyun açıkken dakikada bir).

## 4. Dürüst notlar / sınırlamalar
- Gerçek telefonda test bu ortamda yapılamadı; FPS değerleri emülasyondur. Gerçek değerler Performans sekmesine düşer.
- “Şifremi unuttum” e-postası için Resend hesabı/API anahtarı girilmelidir; girilmeden kod gönderilmez
  (yönetici panelinden şifre sıfırlama her zaman çalışır).
- Canlı sunucu şu an **ödeme test modunda** (`BILLING_MODE=mock`): mağazada satın alma gerçek ödeme almadan test
  jetonu yükler ve ekranda “test modu” yazar. Gerçek satış için Play Console'da ürünler + hizmet hesabı tanımlanıp
  `slot.server_config`'e `BILLING_MODE=google` ve `GOOGLE_SERVICE_ACCOUNT_JSON` girilmelidir; bundan sonra sunucu
  her satın almayı Google'a doğrulatmadan jeton vermez.
- Uygulama içi güncelleme yalnızca Play Store dışı dağıtımda kullanılır; Play sürümünde kapatılmalıdır.

## 5. 101 Okey (3.1)

| Alan | Sonuç |
|---|---|
| Kural ve masa testleri | 8/8 geçti (`server/test/okey.test.js`) — toplam sunucu testleri **32/32** |
| Bot-bot simülasyonu | 300 oyun × 3 el = 900 el: hata 0, kilitlenme 0, taş kaybı 0, geçersiz per 0 |
| Çözücü (Seri Diz / bot) | 22 taşlık elde ortalama 0,3 ms, en kötü 8 ms; 2.000 elde ürettiği tüm perler geçerli |
| Tarayıcıda online | 2 gerçek oyuncu aynı masaya eşleşti, botlarla başlatıldı, sürükle-bırak çekme/atma, Seri Diz, el sonu ve oyun sonu ekranları, havuz dağıtımı: hatasız |
| Yatay ekran | Android'de masa açılınca yatay + tam ekran; dikey tarayıcıda masa otomatik döndürülür |

**Uygulanan kurallar** (okey-gg 101 kurallarıyla karşılaştırıldı): 106 taş, başlayan 22 / diğerleri 21, gösterge → okey (13 → 1), sahte okey;
seri (1-2-3 geçerli, 12-13-1 geçersiz), aynı sayı 3–4 farklı renk, çift; 101 sayı veya 5 çiftle açma, katlamalı (rakiplerin en yüksek açışı + 1; eşlide yalnızca karşı takım);
siler (150+ / 7+ çift → −101); yandan alınan taşla açma/işleme zorunluluğu ve geri bırakma; işleme (çift açan yalnızca çift koyar, işleyebilir);
masadan okey alma (perde 4 renk tamamsa), koyana +101; okey atma +101 (sonraki alamaz), işlek taş atma +101, attığı taşla açılana ×10 (çiftte ×20);
bitiş −101 / okeyle −202 / çiftle −202 (okeyle −404) / elden −202 (okeyle −404); açmayan 202 / 404 / 808; açanın eli (çiftte ×2) + elde okey 101;
deste biterse kimse açmadıysa el sayılmaz; eşlide bitenin eşi 0; en düşük toplam kazanır.

**Bilinçli sadeleştirmeler:** göstergeyi gösterme (çift yolunda okey sayılması) ve “seriye bir turda en fazla 2 taş işleme” sınırı uygulanmadı.
Hatalı açış denemesi ceza yerine reddedilir (uygulamalar gibi). Botlar masada **BOT** etiketiyle gösterilir.

**Jeton:** masa girişi havuza girer (botların payı sanal); tekli 1. %60 · 2. %30 · 3. %10, eşlide kazanan takım paylaşır, eşitlikte paylar bölünür.
Bekleme sırasında ayrılan iade alır; oyun sırasında ayrılanın yerine bot oynar ve ödül alamaz. Ücretsiz masalarda yalnızca XP verilir.
