# SLOT SALONU 3.0 — Kurulum, Yönetici ve Ticari Dağıtım Kılavuzu

> Sanal jeton (social casino) uygulamasıdır. Jetonlar yalnızca oyun içinde kullanılır; nakde çevrilemez,
> para veya ödül olarak çekilemez. Gerçek para karşılığı bahis veya nakit ödül sistemi **yoktur**.

## 1. İlk yönetici hesabını oluşturma (bir kez)

Kaynak kodda hiçbir şifre yoktur. İlk yönetici, sunucu sahibine verilen **tek kullanımlık kurulum anahtarı**
ile oluşturulur. Sunucu bu anahtarın yalnızca SHA-256 özetini saklar.

1. Uygulamayı açın → giriş ekranının altındaki **🛡️ Yönetici Girişi**'ne dokunun.
2. Sunucuda henüz yönetici yoksa **İlk Kurulum** formu açılır.
3. Kurulum anahtarını, yönetici kullanıcı adını, e-postayı ve güçlü bir şifre girin → **YÖNETİCİYİ OLUŞTUR**.
4. Hesap oluşur, yönetici paneli açılır. Bu ekran bir daha görünmez (ikinci kurulum sunucu tarafından reddedilir).

Kendi sunucunuzda (Node) kurulum anahtarı `SETUP_TOKEN` ortam değişkeniyle verilir. Alternatif olarak
`ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` ortam değişkenleri ilk açılışta yöneticiyi doğrudan oluşturur.
Supabase kurulumunda anahtar özeti `slot.server_config` tablosundaki `SETUP_TOKEN_SHA256` satırındadır.

## 2. Yönetici girişi

- Giriş ekranı → **🛡️ Yönetici Girişi** → kullanıcı adı/e-posta + şifre.
- Sunucu rolü doğrular ve **12 saat** geçerli ayrı bir yönetici oturumu açar. Oyuncu hesapları bu girişi kullanamaz
  (tüm `/api/admin/*` istekleri yönetici oturumu olmadan 403 döner).
- Oyuncu girişiyle girmiş bir yönetici, Profil → Yönetici Paneli'ne dokunduğunda şifresini yeniden girer.
- Yöneticinin jetonu sınırsızdır (∞).

### Paneldeki bölümler
| Sekme | İşlev |
|---|---|
| Özet | oyuncu sayısı, bakiyeler, satın almalar, açık destek |
| Oyuncular | arama, profil, jeton ekle/çıkar, seviye/XP düzenle (1–1.000.000), askıya al, şifre sıfırla |
| Oyunlar & RTP | oyun bazlı teorik RTP (%85–98), volatilite, aktif/pasif, gerçekleşen RTP, değişiklik kayıtları |
| Ödüller | günlük ödül tablosu, seviye ödülleri (her N seviyede bir), başlangıç jetonu |
| Paketler | mağaza paketleri |
| Satın Almalar | tüm Google Play satın alma kayıtları |
| Etkinlikler / Görevler | etkinlik ve günlük görev yönetimi |
| Destek | oyuncu destek talepleri |
| Performans | cihazlardan gelen FPS raporları, sunucu yanıt süreleri |
| İşlem Geçmişi | tüm yönetici işlemlerinin denetim kaydı |

RTP değişiklikleri her zaman kayda geçer; oyuncu geçmişi olasılıkları etkilemez (sonuçlar denetlenebilir
HMAC-SHA256 RNG ile bağımsız üretilir). Ödeme tablosu hedef RTP ile orantılı ölçeklenir; bonus satın alma
RTP'si de aynı değere eşit kalır.

## 3. Şifremi unuttum (e-posta)

Kayıtta e-posta doğrulama kodu **yoktur**. Şifre sıfırlama e-postası için bir e-posta servisi gerekir:
[Resend](https://resend.com) hesabı açın, alan adınızı doğrulayın, API anahtarını
`slot.server_config` tablosuna `RESEND_API_KEY` (ve `MAIL_FROM`) olarak ekleyin. Yapılandırılmamışsa
sunucu "e-posta servisi yapılandırılmadı" der; bu durumda yönetici panelinden oyuncu şifresi sıfırlanabilir.

## 4. Uygulama içi güncelleme

- Her yeni sürüm GitHub Actions'ta **aynı imza anahtarıyla** derlenir ve sunucuya yüklenir.
- Uygulama açılışta `/api/app/version`'ı sorar; daha yeni sürüm varsa “Yeni sürüm” penceresi çıkar →
  **ŞİMDİ GÜNCELLE** → APK indirilir → Android yükleyicisi açılır → mevcut uygulamanın üzerine kurulur.
  Hesap, jeton ve seviye sunucuda olduğu için korunur.
- İlk seferde Android “bu kaynaktan yüklemeye izin ver” iznini ister.
- Profil → **Güncellemeleri denetle** ile elle de kontrol edilebilir.
- **Önemli:** 3.0'dan önceki sürümler farklı imza anahtarıyla derlendiği için eski uygulamayı **bir kez** silip
  3.0'ı kurun. Bundan sonraki tüm güncellemeler silmeden kurulur.
- Play Store'da yayınlarken kendi güncelleme sistemi kapatılmalıdır: `-PselfUpdate=false`
  (Google Play kendi dışında APK yükleyen uygulamalara izin vermez; güncellemeleri Play yapar).

## 5. Ticari dağıtım / beyaz etiket (white-label)

Her müşteri için **ayrı veritabanı** (ayrı Supabase projesi veya ayrı PostgreSQL) kullanılır; böylece
müşteri verileri birbirinden tamamen ayrıdır.

1. **Sunucu:** `server/src/schema.sql`'i müşterinin veritabanında çalıştırın (veya Node sunucusunu
   `DATABASE_URL` ile başlatın — şema otomatik kurulur). Supabase için `slot-api` edge fonksiyonunu dağıtın
   ve `slot.server_config` tablosuna `APP_SECRET`, `SETUP_TOKEN_SHA256`, gerekirse `RESEND_API_KEY`,
   `GOOGLE_SERVICE_ACCOUNT_JSON`, `ANDROID_PACKAGE` değerlerini girin.
2. **Marka:** Android derlemesinde Gradle özellikleri:
   ```
   ./gradlew assembleRelease -PappId=com.musteri.slot -PappName="Müşteri Slot" \
     -PslotApiBase=https://musteri-sunucusu/functions/v1/slot-api \
     -PversionCode=101 -PversionName=1.0.1 -PselfUpdate=false
   ```
   Logo: `android/app/src/main/res/mipmap-*`, renkler: `client/css/app.css` başındaki `:root` değişkenleri,
   isim: `BRAND_NAME` (sunucu) + `appName` (uygulama).
3. **İmza anahtarı:** her müşteri için ayrı `.jks` oluşturun ve güvenli saklayın; anahtar kaybolursa
   güncellemeler mevcut kurulumların üzerine yüklenemez.
4. **Google Play:** Play Console → uygulama oluştur → İçerik derecelendirmesi (Simüle kumar) →
   Uygulama içi ürünler (`coins_starter`, `coins_small`, `coins_medium`, `coins_large`, `coins_mega`, `coins_vip`) →
   Hizmet hesabı oluşturup Play Console'da “Finansal verileri görüntüle / siparişleri yönet” izni verin →
   JSON anahtarı sunucuya `GOOGLE_SERVICE_ACCOUNT_JSON` olarak girin → RTDN için Pub/Sub push adresini
   `/api/billing/rtdn?secret=…` yapın (aynı değeri `RTDN_SECRET` olarak girin). Son olarak `BILLING_MODE=google` girin (varsayılan `mock` test modudur ve gerçek ödeme almadan test jetonu verir). Bu moddan sonra sunucu her satın almayı Google'a doğrulatmadan jeton vermez.
5. **Lisans/konfigürasyon:** oyunlar, RTP, paketler, ödüller ve etkinlikler müşteri bazında yönetici
   panelinden ayarlanır; kod değişikliği gerekmez.

## 6. Kendi sunucunuzda çalıştırma (Supabase olmadan)

```
cd server && npm ci
DATA_DIR=./data SETUP_TOKEN=<uzun-rastgele-anahtar> APP_SECRET=<uzun-rastgele> npm start
# veya PostgreSQL ile: DATABASE_URL=postgres://… npm start
```
Sunucu `client/` klasörünü de servis eder (web sürümü `http://sunucu:8080`).
