# Makulbul mobil uygulaması (iOS + Android)

Expo (React Native, Expo Router, TypeScript). Canlı `https://makulbul.com` API'sini kullanır
(`/api/products`, `/api/ai-search`, `/api/products/:id/price-history`, `/satici-git/:id`) — ayrı bir sunucu yoktur.

## Özellikler
- Telefon / laptop kataloğu, marka filtresi, sıralama
- Yapay zekâ ile arama (web ile aynı motor; ilgisiz aramalarda "anlayamadım" der)
- Ürün detayı: GB/renk seçici, satıcılar, fiyat geçmişi grafiği, teknik özellikler, paylaş
- Favoriler (yalnızca cihazda saklanır, hesap/e-posta yok)
- Satıcıya git: `makulbul.com/satici-git/...` üzerinden (tıklama sayılır, affiliate etiketi sunucuda)
- Stokta olmayan ürünlerde fiyat gösterilmez ("Şu an stokta yok")

## Geliştirme
```bash
cd mobile
npm install
npx expo start          # QR kodu telefondaki Expo Go ile okut; i = iOS simülatörü
npx tsc --noEmit        # tip kontrolü
npx expo-doctor         # yapılandırma kontrolü
```
API adresini değiştirmek için `app.json` > `expo.extra.apiBase`.

## Mağazaya çıkış (senin yapacakların)
1. [expo.dev](https://expo.dev) hesabı aç, `npx eas-cli@latest login`.
2. Apple Developer Program (≈99 USD/yıl) ve Google Play Console (≈25 USD tek sefer) hesapları.
3. `npx eas-cli@latest build --platform ios --profile production` ve `--platform android` (bulutta derler).
4. `npx eas-cli@latest submit --platform ios|android` ile gönder.
5. Mağaza sayfası için: gizlilik politikası URL'si `https://makulbul.com/gizlilik-politikasi.html`, ekran görüntüleri,
   açıklama, destek e-postası `iletisim@makulbul.com`. Apple "App Privacy" formunda: veri toplanmıyor (favoriler yalnızca cihazda).
6. Paket kimlikleri `app.json` içinde: `com.makulbul.app` (iOS bundleIdentifier / Android package) — mağazada
   alınmış bir kimlikle çakışırsa değiştir.

Mağaza incelemesi günler sürebilir; kabul garantisi yoktur. Affiliate bağlantıları uygulama içinde "Reklam" notuyla belirtilir.
