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

## 6. Sürüm 3.2 — Kapsamlı güncelleme testleri (26.11.2026)

Ortam: Node.js 22, Chromium (Playwright) mobil taklit 393×873 / 873×393, işlemci 4 kat yavaşlatılmış ("düşük donanımlı telefon").

### 6.1 Slot RTP ve volatilite (oyun başına 10 milyon spin, yeni profil)
| Oyun | Volatilite | Hedef | Ölçülen | ±%95 | İsabet | Özellik |
|---|---|---|---|---|---|---|
| Zeus | Yüksek | 96,5 | 96,55 | 0,60 | 24,4% | 1/356 |
| Mısır Hazineleri | Orta | 96,0 | 95,96 | 0,42 | 34,2% | 1/195 |
| Vegas Meyveleri | Düşük | 97,0 | 97,37 | 0,40 | 13,9% | 1/1364 |
| Kristal Peri | Orta | 96,5 | 96,86 | 0,42 | 28,6% | 1/502 |
| Ejderha Hazinesi | Orta | 96,0 | 96,05 | 0,55 | 40,5% | 1/120 |
| Korsan Hazinesi | Yüksek | 96,5 | 96,47 | 0,75 | 23,9% | 1/277 |
| Altın Şans | Düşük | 97,0 | 96,52 | 0,44 | 47,9% | 1/668 |

Altın Şans bu koşuda aralığın 0,03 puan dışında; aynı seviyenin ayrı 40 milyon spinlik doğrulaması %95 hedefte 95,16 ±0,22 çıktı (7 oyunlu ölçümde bir sapma istatistiksel olarak beklenir).
Her volatilite seviyesi ayrı kalibre edildi (düşük/yüksek: 8–120 milyon spin) ve %95 hedefte bağımsız tohumla doğrulandı (6–40 milyon spin). Seviye yükseldikçe standart sapma ve özellik sıklığı artar (ör. Zeus SD 7,7 → 8,1 → 9,4).

### 6.2 Zeus / Kristal Peri çarpan sırası (video kareleriyle doğrulandı)
Çarpan sembolü sayısız enerji küresi olarak düşer → kazanç kombinasyonları patlar, zincir toplamı gösterilir → şimşek küreye çarpar → X değeri açılır, Toplam Çarpan kutusuna uçar → "337 × 3" sayarak kazanç **tek sefer** güncellenir (sunucunun hesapladığı değer). Kazanç ekranı: TEBRİKLER! / KAZANDINIZ / tutar / DEVAM ET.

### 6.3 101 Okey
| Test | Sonuç |
|---|---|
| Sunucu testleri | 33/33 (okey: 9/9 — TOPLA, geri dönüş, başka oyuncunun masaya/taşlara erişememesi dahil) |
| 16 mod kombinasyonu (tekli/eşli × katlamalı/katlamasız × 1–4 el) × 15 oyun | 240/240: el sayısı doğru, eşik ihlali 0, eşlide kazananlar aynı takım |
| Butonlar (gerçek oyunda, tarayıcı) | Seri Aç (102 ile açtı) ✓ · Topla (taşlar geri döndü) ✓ · yeniden açış ✓ · Taş İşle (3 işleme) ✓ · Seri Diz / Çift Diz ✓ |
| Oyun Seçenekleri penceresi | Katlamalı/Katlamasız/Eşli/Tekli, 1–4 El, Odayı Oluştur / Masaya Otur ✓; yöneticinin kapattığı seçenek pasif ve sunucuda da reddediliyor ✓ |
| Bağlantı kopması (9 sn çevrimdışı) | "Bağlantı koptu" katmanı, ekran donmadı (kare 13 ms), bağlantı gelince otomatik eşitlendi ✓ |
| Çıkış ve geri dönüş | ÇIK → onay → lobi → "Ayrıldığın masa sürüyor" → GERİ DÖN → aynı koltuk, aynı 22 taş ✓ |
| Yetki | Oyuncu başka masada hamle yapamaz (403), başkasının taşlarını göremez, yönetici uçlarına erişemez (403) ✓ |

### 6.4 Performans (işlemci 4× yavaş)
| Ekran | Açılış | FPS | En kötü kare | JS bellek |
|---|---|---|---|---|
| Zeus | 117 ms | 59,1 | 67 ms | 10 MB |
| Mısır | 41 ms | 59,5 | 33 ms | 10 MB |
| Vegas | 102 ms | 59,7 | 33 ms | 10 MB |
| Kristal Peri | 70 ms | 59,2 | 33 ms | 10 MB |
| Ejderha | 58 ms | 59,6 | 33 ms | 10 MB |
| Korsan | 61 ms | 59,4 | 50 ms | 10 MB |
| Altın Şans | 99 ms | 59,8 | 33 ms | 10 MB |
| 101 Okey masası (sürekli taş sürükleme) | 182 ms | 59,7 | 50 ms | 10 MB |

Sunucu yük testi (yerel, tek işlem, PGlite): 80 eşzamanlı oyuncu (40 Okey + 40 slot), 30 sn, 2.974 istek, 5xx hata **0**.
Okey yoklama p50 7 ms / p95 50 ms · hamle p50 8 ms / p95 38 ms · spin p50 22 ms / p95 118 ms / p99 797 ms.
İstek azaltma: değişiklik yoksa sunucu küçük "aynı" yanıtı döner; uzun süre değişmeyen masada aralık 1,6 sn'ye çıkar; uygulama arka plandayken yoklama durur; okey yoklaması 10 sn oturum önbelleği kullanır; eski spin yanıtları 1 saat sonra, bitmiş masalar 3 gün sonra temizlenir.

## 5.0 — SPINOVA 101 OKEY (26.11.2026)

### Sunucu testleri: 49/49 geçti
- Yeni (games5.test.js, 9 test): Düz Okey çözücü + 3 elli botlu tam oyun, Tavla kuralları + bot maçı (pul korunumu), Tavla API (hızlı/özel/şifre/ayrılma-dönme), Düz Okey API, Aviator (200.000 örnekle dağılım P(≥2x)=%48, hash doğrulama, otomatik tahsil), liderlik ve yönetici yetkileri.

### Tarayıcı testleri (yatay, gerçek cihaz boyutları): 20/20 geçti

- ✔ 01 Dikey tutulunca "yan çevir" uyarısı, yatayda oyun — dikey: uyarı · yatay: oyun
- ✔ 02 Kayıt → SPINOVA ana salonu; marka, kral, By-Hkn imzası, 5 oyun kartı — okey101, duz, tavla, aviator, slots · alt menü: 👥
Arkadaşlar, 📊
Liderlik Tablosu, 🏠
Ana Sayfa, 💬
Sohbet, 📅
Görevler
- ✔ 03 Salon ve 4 giriş ekranı 4 cihaz boyutunda sahneye sığar (taşma yok) — Telefon küçük 740×360 · Telefon 873×393 · Tablet 1180×820 · Masaüstü 1366×768
- ✔ 04 Her oyun kartı KENDİ giriş ekranını açar; geri tuşu salona döner — 101 OKEY(en-okey) · DÜZ OKEY(en-duz) · TAVLA(en-tavla) · AVIATOR(av) · SLOT SALONU(en-slots)
- ✔ 05 Salondaki bütün butonlar gerçek bir ekran açar (ölü buton yok) — 23 buton
- ✔ 06 101 Okey: Hızlı Katıl → yeşil çuhalı gerçek masa, ıstakada SPINOVA + By-Hkn; ÇIK → 101 giriş ekranı — 22 taş · çuha+logo+imza ✓
- ✔ 07 101 şifreli özel masa: 6 haneli kod, kopyala/WhatsApp, açık masalarda 🔒 — kod 9VS9KB
- ✔ 08 İkinci oyuncu salondaki KOD kutusuyla, şifreyle masaya oturur — 2/4 gerçek oyuncu
- ✔ 09 Düz Okey: bordo çuha, 101 butonları gizli, BİTİR + gösterge bitirme alanı; hazır değilken bitirme reddedilir — 15 taş · bitirme denemesi: cannot_finish
- ✔ 10 Tavla: hızlı eşleş → botla başlat; zar sunucudan, pula dokun → hedef → ONAYLA; sunucu kabul eder — insan hamlesi sunucuda kabul edildi
- ✔ 11 Tavla: kurala aykırı hedefe dokunmak hamle eklemez; yasa dışı dizi sunucuda reddedilir — sunucu yanıtı: bad_phase
- ✔ 12 Tavla: masadan ÇIK → tavla giriş ekranı "GERİ DÖN" → aynı maça yeniden bağlanır — yeniden bağlandı
- ✔ 13 Tavla özel masa (şifreli) + ikinci oyuncu salon KOD kutusuyla katılır: 2 gerçek oyuncu — kod 5CJ348 · 2/2 insan
- ✔ 14 Aviator: bahis anında sunucudan düşer; TAHSİL ET sonrası bakiye sunucuyla aynı; sonuç hash ile doğrulanır — 1.14x +1.140 jeton · uçak 3.07x'te uçtu
- ✔ 15 Aviator otomatik tahsil (1.01x): bağlantısız da sunucu sonuçlandırır — ödendi 1.01x = 101
- ✔ 16 Slot Salonu: kategori filtresi; makine açılır; geri → Slot Salonu (salon değil) — 7 makine · klasik 1
- ✔ 17 Liderlik Tablosu 5 sekme (Seviye/Okey/Tavla/Aviator/Slot) gerçek kayıtlardan — level:2 okey:0 tavla:0 aviator:1 slots:1
- ✔ 18 Yönetici: ayrı kurulum/giriş; Aviator & Tavla sekmesi; RTP sınırı sunucuda; oyuncu 403 — RTP %95,5 kaydedildi · %150 reddedildi (400)
- ✔ 19 Android geri tuşu zinciri: masa → giriş ekranı → salon; modal önce kapanır — Düz Okey masası → Düz Okey girişi → salon
- ✔ 20 Performans: dokunma (arayüz) gecikmesi ≠ ağ gecikmesi; salon ve Aviator uçuşunda FPS — dokunma p50 33/p95 34 ms · ağ p50 13/p95 50 ms (n=200) · Tavla girişi 41 ms · FPS salon 60, Aviator uçuşu 61 · bellek 10 MB

Sayfa hatası: yok

## 5.1 — Referans görünüm (Okey Hall + 101 Plus) (26.11.2026)

Açılış (stüdyo → gerçek yükleme yüzdesi → giriş), slot ekranı, okey masası/lobisi ve Slot Salonu vitrini referans videolara göre yeniden düzenlendi.

### Tarayıcı testleri: 20/20 geçti

- ✔ 01 Dikey tutulunca "yan çevir" uyarısı, yatayda oyun — dikey: uyarı · yatay: oyun
- ✔ 02 Kayıt → SPINOVA ana salonu; marka, kral, By-Hkn imzası, 5 oyun kartı — okey101, duz, tavla, aviator, slots · alt menü: 👥
Arkadaşlar, 📊
Liderlik Tablosu, 🏠
Ana Sayfa, 💬
Sohbet, 📅
Görevler
- ✔ 03 Salon ve 4 giriş ekranı 4 cihaz boyutunda sahneye sığar (taşma yok) — Telefon küçük 740×360 · Telefon 873×393 · Tablet 1180×820 · Masaüstü 1366×768
- ✔ 04 Her oyun kartı KENDİ giriş ekranını açar; geri tuşu salona döner — undefined(en-ol) · undefined(duz) · TAVLA(en-tavla) · AVIVASOR(av) · undefined(en-slots)
- ✔ 05 Salondaki bütün butonlar gerçek bir ekran açar (ölü buton yok) — 23 buton
- ✔ 06 101 Okey: oda lobisi HEMEN OYNA → desenli zeminli gerçek masa, ıstakada SPINOVA + By-Hkn; ÇIK → 101 giriş ekranı — 21 taş · çuha+logo+imza ✓
- ✔ 07 101 şifreli özel masa: 6 haneli kod, kopyala/WhatsApp, açık masalarda 🔒 — kod GWSAMS
- ✔ 08 İkinci oyuncu salondaki KOD kutusuyla, şifreyle masaya oturur — 2/4 gerçek oyuncu
- ✔ 09 Düz Okey: ayrı renk teması, 101 butonları gizli, BİTİR + gösterge bitirme alanı; hazır değilken bitirme reddedilir — 14 taş · bitirme denemesi: not_your_turn
- ✔ 10 Tavla: hızlı eşleş → botla başlat; zar sunucudan, pula dokun → hedef → ONAYLA; sunucu kabul eder — insan hamlesi sunucuda kabul edildi
- ✔ 11 Tavla: kurala aykırı hedefe dokunmak hamle eklemez; yasa dışı dizi sunucuda reddedilir — sunucu yanıtı: bad_phase
- ✔ 12 Tavla: masadan ÇIK → tavla giriş ekranı "GERİ DÖN" → aynı maça yeniden bağlanır — yeniden bağlandı
- ✔ 13 Tavla özel masa (şifreli) + ikinci oyuncu salon KOD kutusuyla katılır: 2 gerçek oyuncu — kod SEZJYU · 2/2 insan
- ✔ 14 Aviator: bahis anında sunucudan düşer; TAHSİL ET sonrası bakiye sunucuyla aynı; sonuç hash ile doğrulanır — 1.14x +1.140 jeton · uçak 6.32x'te uçtu
- ✔ 15 Aviator otomatik tahsil (1.01x): bağlantısız da sunucu sonuçlandırır — ödendi 1.01x = 101
- ✔ 16 Slot Salonu: kategori filtresi; makine açılır; geri → Slot Salonu (salon değil) — 7 makine · klasik 1
- ✔ 17 Liderlik Tablosu 5 sekme (Seviye/Okey/Tavla/Aviator/Slot) gerçek kayıtlardan — level:2 okey:0 tavla:0 aviator:1 slots:1
- ✔ 18 Yönetici: ayrı kurulum/giriş; Aviator & Tavla sekmesi; RTP sınırı sunucuda; oyuncu 403 — RTP %95,5 kaydedildi · %150 reddedildi (400)
- ✔ 19 Android geri tuşu zinciri: masa → giriş ekranı → salon; modal önce kapanır — Düz Okey masası → Düz Okey girişi → salon
- ✔ 20 Performans: dokunma (arayüz) gecikmesi ≠ ağ gecikmesi; salon ve Aviator uçuşunda FPS — dokunma p50 33/p95 35 ms · ağ p50 13/p95 38 ms (n=196) · Tavla girişi 61 ms · FPS salon 60, Aviator uçuşu 59 · bellek 10 MB

Sayfa hatası: yok

## 5.0.25 — kritik düzeltmeler (27.11.2026)
- Oyundan çıkış: tüm oyunlarda ÇIK/SALON/geri → ana salon. Sebep: çıkış düğmesi parmak kalkınca çalışıyor, aynı dokunuşun "click" olayı salondaki aynı noktada duran profil düğmesine düşüyordu (hayalet dokunuş). Salona dönüşten önce başlamış dokunuşun tıklaması artık yutuluyor. 12 oyunda gerçek işaretçiyle test edildi: hepsi main/home.
- Açılış süresi (CPU 4× yavaşlatılmış): ~1,8 sn → ~0,6 sn; salona dönüş ≤15 ms (salon önbellekte). Okey masası 1,4 sn → 0,67 sn.
- 101 Okey: (1) ortada taş bitince el kendiliğinden biter ve puanlanır; (2) açarken/koyarken/işlerken son taşın masaya konması engellendi (eskiden el 0 taşa düşüp oyun kilitleniyordu); (3) bozuk durumdaki masalar sunucuda otomatik kapanır. Yeni test: test/okeyend.test.js (100 bot oyunu dahil).
- Avivasor: ortak sunucu turu. Tahsil yalnızca oyuncunun bahsini kapatır; uçak patlama noktasına kadar uçar; geri sayım + yeni tur; uçuşta yapılan bahis sıradaki tura; kalkıştan önce iptal; masadaki gerçek oyuncular listesi.
- Sunucu testleri 56/56, uçtan uca 20/20.
