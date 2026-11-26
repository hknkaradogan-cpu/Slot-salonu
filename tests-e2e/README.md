# Uçtan uca (tarayıcı) testleri

Sunucuyu `BILLING_MODE=mock` ile başlatın (`ADMIN_PASSWORD=Admin12345`), sonra:

```
npm i playwright && npx playwright install chromium
mkdir -p shots
node fixtures.js      # her oyun için bonuslu örnek sonuçlar üretir (fixtures.json)
node e2e2.js          # kayıt, e-posta doğrulama, günlük ödül, 7 oyun, mağaza, görevler, profil, yönetici
node e2e3.js          # 7 oyunun bonus animasyonlarını kare kare kaydeder
node e2e4.js          # kapat-aç kalıcılığı, çevrimdışı/bağlantı hatası, yetki kontrolü
node promo.js         # 30 sn tanıtım videosunun 10 sahnesini kaydeder
```
`e2e2.js` e-posta kodunu sunucu günlüğünden okur; sunucu çıktısını `server.log` dosyasına yönlendirin.
Demo sonuçları yalnızca `SLOT_CONFIG.demo=true` iken oynatılır ve bakiyeyi değiştirmez.
