# SLOT SALONU 2.0 — Test Raporu

Tarih: 26.11.2026 · Ortam: Linux, Node.js 22.23, Chromium (Playwright 1.63), mobil görünüm 412×915

## Özet

| Alan | Sonuç |
|---|---|
| Sunucu + oyun motoru otomatik testleri | **22 / 22 geçti** (`cd server && npm test`) |
| Oyun matematiği simülasyonu | **7 oyun × 50 milyon spin = 350 milyon spin**, hepsi %95 ± güven aralığı içinde |
| Kalibrasyon | Oyun başına 120 milyon spin (ayrı tohumla) |
| Tarayıcıda uçtan uca akış | Kayıt → e-posta doğrulama → günlük ödül → 7 oyun → mağaza (test satın alma) → görevler → profil → seviye ödülleri → yönetici paneli: **hatasız** |
| 7 oyunun bonus animasyonları | Kare kare kaydedildi ve incelendi (ekran-goruntuleri/) |
| Kalıcılık / çevrimdışı | **8 / 8 kontrol geçti** |
| Android Java kaynakları | API taslaklarına karşı `javac` ile derlendi (gerçek SDK ile değil, aşağıya bakın) |
| **APK** | **Bu ortamda üretilemedi** — Google SDK/Maven sunucularına erişim engelli (403). GitHub Actions akışı ve Gradle projesi hazır. |

## 1. Otomatik testler (server/test)

1. Seviye tablosu: 1→2 için 500 XP, her seviyede +100, 100'de sınır
2. Günlük ödül seviyeye göre (Sv1 500, Sv5 720, Sv10 1.000, Sv15 1.500, Sv55 5.500, Sv100 10.000)
3. Kayıt, benzersiz kullanıcı adı/e-posta (büyük-küçük harf duyarsız), şifre kuralı, e-posta **veya** kullanıcı adıyla giriş, scrypt özeti
4. E-posta doğrulama kodu; şifremi unuttum (hesap varlığını sızdırmaz, kod tek kullanımlık, eski oturumlar kapanır)
5. Spin: bahis düşer, kazanç eklenir, her 100 jeton = 1 XP, jeton defteri toplamı = bakiye, aynı istek anahtarı tekrarında çift işlem yok
6. Yetersiz bakiyede spin reddi, bakiye eksiye düşmez
7. 7 oyun API'den oynanır; tohum açıklanınca her spin bağımsız olarak yeniden hesaplanır ve aynı sonucu verir
8. Seviye ödülleri: seviye şartı, tek seferlik, toplam 550.000, 100. seviyede kutlama bayrağı, 100'de XP durur
9. Günlük ödül: 23 saatte reddedilir, 24 saatte verilir (sunucu saati)
10. Ödeme: doğrulanmamış e-posta engeli, satın alındı → jeton + consume, tekrar gönderimde çift yükleme yok, **bekleyen** → jeton yok, RTDN ile tamamlanınca yüklenir, **iptal**, başka hesabın belirteci reddedilir, **iade** jetonları geri alır, başlangıç paketi tek seferlik
11. Yönetici: oyuncu 403 / oturumsuz 401; jeton ekle/çıkar, seviye düzenle, işlem kaydı, sınırsız jeton (bahiste bakiye düşmez), ayar ve paket yönetimi, askıya alma; rol yükseltme ucu yok
12. Görevler, etkinlik 2x XP ve bonus jeton, arkadaşlık isteği/kabul, hediye gönderme/alma ve limitler
13. Destek talebi ve yönetici yanıtı
14. Sunucu kapatılıp açıldığında bakiye, XP ve oturum korunur
15. Bozuk JSON ve hız sınırı
16–22. Oyun motoru: kalibrasyon, kazanç sınırları, kayıtlı/kayıtsız tutarlılık, tumble kuralları (8+ eşleşme, patlama, 30 hücre), çarpan formülü, tüm bonusların tetiklenmesi, RNG belirleyiciliği ve ki-kare düzgünlük testi

## 2. Oyun matematiği (tools/simulate.js, tohum `verify-final-2026`)

| Oyun | Spin | RTP | %95 GA | İsabet | SS (x) | Bonus sıklığı | Bonusun RTP payı | En büyük |
|---|---|---|---|---|---|---|---|---|
| Zeus | 50M | 94,87% | ±0,24 | 25,0% | 8,75 | 1/632 | 10% | 5000x |
| Mısır Hazineleri | 50M | 94,89% | ±0,19 | 34,3% | 6,93 | 1/194 | 31% | 5000x |
| Vegas Meyveleri | 50M | 94,94% | ±0,21 | 13,7% | 7,74 | 1/587 | 13% | 1470x |
| Kristal Peri | 50M | 95,10% | ±0,18 | 28,6% | 6,58 | 1/506 | 16% | 2562x |
| Ejderha Hazinesi | 50M | 94,88% | ±0,24 | 40,5% | 8,78 | 1/120 | 38% | 5000x |
| Korsan Hazinesi | 50M | 94,85% | ±0,29 | 24,4% | 10,31 | 1/445 | 26% | 2593x |
| Altın Şans | 50M | 95,03% | ±0,26 | 47,6% | 9,26 | 1/288 | 25% | 1121x |

Tüm sonuçların %95 güven aralığı hedef %95 RTP'yi kapsıyor. Ham veriler: `simulation-results.json`.

**Volatilite notu:** Standart sapma 6,6–10,3x aralığında; bu sektörde "orta-yüksek" sayılır. Daha sert "yüksek" volatilite (SS 15x+) isterseniz bonus ağırlıkları ve çarpan dağılımları artırılıp `npm run calibrate` ile yeniden kalibre edilebilir; RTP %95'te kalır.

**Adillik:** Sonuçlar HMAC-SHA256(sunucu tohumu, istemci tohumu:nonce) akışından üretilir. Oyuncu geçmişi, bakiye veya satın alma, olasılıkları etkilemez (kodda böyle bir girdi yoktur). Oyuncu Profil > Adil Oyun'dan tohumu değiştirip eskisini açıklatabilir ve `tools/verify-spin.js` ile her spini doğrulayabilir.

## 3. Tarayıcı testleri (tests-e2e/)

- `e2e2.js`: tam kullanıcı akışı + yönetici paneli — konsolda hata yok (yalnızca isteğe bağlı `assets/*.webp` 404'leri; varsayılan ayarda artık istenmiyor).
- `e2e3.js`: her oyunun bonus özelliği (FS girişi, yıldırımlar, çarpan topları, genişleyen semboller, Tut&Döndür, jackpot çarkları, büyük kazanç) kare kare kaydedildi.
- `e2e4.js` (8/8): yeniden açılışta oturum ve bakiye korunuyor; çevrimdışı uyarısı; çevrimdışı spinde buton geri açılıyor ve bakiye sunucuyla eşleşiyor; bağlantı dönünce uyarı kalkıyor ve spin çalışıyor; oyuncu belirteciyle yönetici API'si 403.

Test sırasında bulunup düzeltilen hatalar: e-posta doğrulama penceresinin günlük ödül penceresi tarafından kapatılması; oyundan bonus sırasında çıkılınca animasyonun sonraki oyuna taşması; çevrimdışı yeniden denemede gereksiz son bekleme.

## 4. Test edilemeyenler (açıkça)

- **Gerçek APK derlemesi ve cihazda çalıştırma**: Android SDK indirilemediği için yapılamadı. Java kodu Billing Library 8 / WebView / WebViewAssetLoader API'lerinin beklenen imzalarına göre yazılmış taslaklarla derlendi; gerçek kütüphaneyle ilk derlemede küçük imza farkları çıkarsa CI günlüğünde görünür.
- **Gerçek Google Play ödemesi**: Play Console hesabı ve servis anahtarı gerektirir. Sunucu tarafı tüm durumlar (satın alındı, bekleyen, iptal, iade, tekrar, hesap uyuşmazlığı) sahte doğrulayıcıyla test edildi; Google API çağrıları belgelenmiş uç noktalara göre yazıldı ancak canlı denenmedi.
- **Gerçek e-posta gönderimi**: SMTP bilgisi gerekir; akış outbox tablosu üzerinden test edildi.
- **Gönderdiğiniz oyun videoları ve eski proje kaynakları**: bana ulaşmadı; yalnızca web prototipinin HTML'i ve tasarım referansı (10 kareli GIF) vardı. Görseller bu yüzden kodla çizildi.

## 5. Güncelleme 2.2 — Bonus satın alma (FREE SPIN SATIN AL)

Fiyatlar, satın alınan bonusun beklenen kazancının %95'i olacak şekilde simülasyonla belirlendi (oyun başına 4 milyon satın alma, ayrı tohumla doğrulama):

| Oyun | Tür | Fiyat (bahis katı) | Doğrulanan RTP |
|---|---|---|---|
| Zeus | Free Spin | 51x | 95,28% ±0,22 |
| Zeus | Süper Free Spin | 91,1x | 95,02% ±0,18 |
| Kristal Peri | Free Spin | 71,2x | 94,83% ±0,11 |
| Kristal Peri | Süper Free Spin | 97,8x | 94,91% ±0,11 |
| Mısır Hazineleri | Free Spin | 49,4x | 94,86% ±0,12 |
| Ejderha Hazinesi | 10 Free Spin | 44,8x | 94,74% ±0,20 |
| Korsan Hazinesi | Sandık Altını | 113,8x | 95,04% ±0,16 |

Ham veriler: `simulation-buy-results.json`. Sunucu testi: 23/23 geçti (bonus satın alma testi eklendi).
