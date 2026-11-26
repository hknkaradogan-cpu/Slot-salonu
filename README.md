# SLOT SALONU 2.0

7 oyunlu sosyal casino uygulaması: Node.js sunucu + mobil web istemcisi + Android (WebView + Google Play Billing) kabuğu.
Sanal jetonlar yalnızca eğlence amaçlıdır; nakde çevrilemez, para veya ödül olarak çekilemez.

```
server/      Sunucu (Node 22, bağımlılıksız; SQLite = node:sqlite)
  src/games/ 7 oyunun motoru, denetlenebilir RNG, calibration.json (RTP katsayıları)
  test/      22 otomatik test (API + oyun motoru)
  tools/     simulate.js (milyonlarca spin), verify-spin.js (spin denetimi)
client/      Mobil istemci (HTML/CSS/JS, derleme adımı yok)
android/     Android Studio / Gradle projesi (APK + AAB)
tests-e2e/   Playwright tarayıcı testleri ve tanıtım videosu kaydı
docs/        Test raporu, simülasyon sonuçları, ekran görüntüleri, tanıtım videosu, Play ikonu
.github/     APK'yı derleyen GitHub Actions akışı
```

## Hızlı başlangıç (yerel)

```bash
cd server
ADMIN_EMAIL=admin@ornek.com ADMIN_PASSWORD=Admin12345 npm start
# http://localhost:8080  -> web sürümü (mobil görünüm)
npm test                     # 22 test
npm run simulate             # oyun başına 10 milyon spin RTP raporu
```
Geliştirmede `BILLING_MODE=mock` varsayılandır: mağazada "test satın alma" ile sunucu doğrulaması denenebilir, gerçek ödeme alınmaz. E-postalar konsola yazılır.

## Canlıya alma

1. **Sunucu**: `server/Dockerfile` ile (`docker build -f server/Dockerfile -t slotsalonu .`) veya doğrudan Node 22.13+ ile çalıştırın. `server/.env.example` içindeki değişkenleri tanımlayın. `/data` kalıcı disk olmalı. HTTPS arkasında çalıştırın (`TRUST_PROXY=1`).
2. **Yönetici**: `ADMIN_EMAIL/ADMIN_USERNAME/ADMIN_PASSWORD` ilk açılışta yönetici hesabını oluşturur. Sınırsız jeton yetkisi yalnızca bu hesaba sunucuda atanır; API üzerinden kimseye yönetici rolü verilemez.
3. **E-posta**: `npm i nodemailer` ve `SMTP_URL` tanımlayın.
4. **Google Play**:
   - Play Console'da `com.slotsalonu.app` uygulamasını oluşturun, uygulama içi ürünleri (tüketilebilir) şu kimliklerle ekleyin: `coins_starter, coins_small, coins_medium, coins_large, coins_mega, coins_vip`. Gerçek fiyatlar Play Console'da belirlenir; uygulama fiyatı Play'den okur.
   - Google Cloud'da servis hesabı oluşturup Play Console > Kullanıcılar ve izinler'den "finansal veriler / siparişleri yönetme" izni verin; JSON anahtarını `GOOGLE_SERVICE_ACCOUNT_FILE` ile gösterin, `BILLING_MODE=google` yapın.
   - Gerçek zamanlı geliştirici bildirimleri (RTDN): Pub/Sub push aboneliğini `https://SUNUCU/api/billing/rtdn?secret=RTDN_SECRET` adresine yönlendirin (bekleyen ödemelerin tamamlanması ve iadeler için). Sunucu ayrıca iade listesini saatlik senkronize eder.
   - Uygulama içeriği beyanında "simüle kumar" işaretleyin; 18+ hedef kitle ve sosyal casino kurallarına uyun. Hangi ülkelerde yayımlayacağınızı Play politikasına ve yerel mevzuata göre seçin.
5. **APK / AAB**: bkz. aşağı.

## APK derleme

Bu çalışmanın yapıldığı ortamda Google'ın Android SDK ve Maven sunucularına erişim engelli olduğundan APK burada derlenemedi. Proje iki yoldan derlenir:

- **GitHub Actions (önerilen)**: Projeyi bir GitHub deposuna gönderin. Depo ayarları > Variables'a `SLOT_API_BASE=https://sunucunuz` ekleyin. Her push'ta `.github/workflows/build.yml` testleri çalıştırır ve `slot-salonu-debug-apk` çıktısını üretir. İmzalı sürüm ve Play Console için AAB: `KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD` gizlilerini ekleyin.
- **Android Studio / komut satırı**: `cd android && ./gradlew assembleDebug -PslotApiBase=https://sunucunuz` (JDK 17, Android SDK 36). Çıktı: `android/app/build/outputs/apk/debug/app-debug.apk`. Emülatörde yerel sunucu için `-PslotApiBase=http://10.0.2.2:8080`.

Derleme, `client/` klasörünü APK içine kopyalar ve `config.js` dosyasına sunucu adresini yazar.

## Eski prototipin görselleri

Eski prototipin `assets/*.webp` dosyalarını `client/assets/` içine koyup `client/config.js` içinde `assets: true` yaparsanız lobi kartlarında kullanılır. Bu dosyalar bana ulaşmadığı için semboller SVG taşlar ve emoji karolarla çiziliyor.
