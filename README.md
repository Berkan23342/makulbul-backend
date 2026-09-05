# Cepfiyat Backend — Kurulum ve Çalıştırma

## 1. Node.js'i kur (eğer kurulu değilse)

[nodejs.org](https://nodejs.org) adresinden **LTS** sürümünü indir, kur.
Kurulumdan sonra terminal/komut satırında kontrol et:

```bash
node -v
npm -v
```

İkisi de bir sürüm numarası döndürmeli.

## 2. Bağımlılıkları kur

Bu klasörün içinde (yani `cepfiyat-backend/`) bir terminal aç ve şunu çalıştır:

```bash
npm install
```

Bu komut `package.json`'daki express, pg, cors, dotenv paketlerini indirir.

## 3. Bağlantı bilgini ayarla

1. `.env.example` dosyasını kopyala, adını `.env` yap.
2. İçindeki `DATABASE_URL` satırını, PostgreSQL kurulumunda aldığın gerçek
   bağlantı adresiyle değiştir:
   - **Yerel PostgreSQL kullanıyorsan:**
     ```
     DATABASE_URL=postgresql://postgres:SIFREN@localhost:5432/cepfiyat
     DB_SSL=false
     ```
   - **Neon (bulut) kullanıyorsan:**
     ```
     DATABASE_URL=postgresql://kullanici:sifre@ep-xxxx.eu-central-1.aws.neon.tech/cepfiyat?sslmode=require
     DB_SSL=true
     ```

**ÖNEMLİ:** `.env` dosyasını asla GitHub'a veya herhangi bir yere paylaşma —
içinde veritabanı şifren var.

## 4. Sunucuyu çalıştır

```bash
npm start
```

Terminalde şunu görmen lazım:
```
✔ PostgreSQL bağlantısı başarılı
Cepfiyat API çalışıyor: http://localhost:3000
```

"PostgreSQL bağlantı hatası" görürsen: `.env` dosyasındaki `DATABASE_URL`'i,
şifreyi ve (bulut kullanıyorsan) `DB_SSL=true` olup olmadığını kontrol et.

## 5. Test et

Tarayıcında şu adresi aç:

```
http://localhost:3000/api/products
```

12 telefonun JSON listesini, her birinin altında satıcı tekliflerini görmen lazım.

Tek bir ürünü test etmek için (id'yi products listesinden kopyala):
```
http://localhost:3000/api/products/BURAYA-ID-YAPISTIR
```

AI arama uç noktasını test etmek için terminalde:
```bash
curl -X POST http://localhost:3000/api/ai-search \
  -H "Content-Type: application/json" \
  -d '{"query":"NFC'\''li 20000 TL altı"}'
```

## 6. Geliştirme sırasında otomatik yeniden başlatma (opsiyonel)

Kod değiştirdikçe sunucuyu elle yeniden başlatmak istemiyorsan:

```bash
npm install -D nodemon
npm run dev
```

## 7. Backend'i yayına alma (canlıya çıkarma)

Yerelde çalıştığını doğruladıktan sonra, siteni gerçek kullanıcıların
erişebileceği hale getirmek için backend'i bir sunucuya koyman lazım.
En kolay ücretsiz seçenekler:

- **Render.com** — GitHub reponu bağlarsın, otomatik build+deploy eder.
- **Railway.app** — benzer, GitHub bağlantılı otomatik deploy.

`.env` dosyası deploy edilmez (`.gitignore`'da) — bu yüzden aşağıdaki
değişkenlerin **hepsini** o platformun "Environment Variables" ayarına
elle girmen gerekiyor. Sadece `DATABASE_URL`/`DB_SSL` girip diğerlerini
atlarsan site **çalışmaz** — CORS, gerçek frontend adresini bilmediği
için tüm API isteklerini reddeder.

**Zorunlu:**

| Değişken | Ne işe yarar |
|---|---|
| `DATABASE_URL`, `DB_SSL` | Veritabanı bağlantısı (bkz. madde 3) |
| `FRONTEND_URL` | Siteni nereye deploy ettiysen o adres (örn. `https://cepfiyat.com`). CORS **sadece** bu adrese izin verir — yanlış/eksikse site tamamen açılmaz. |
| `BACKEND_URL` | Backend'in kendi canlı adresi (örn. `https://cepfiyat-api.onrender.com`). Ürün sayfaları ve sitemap.xml bunu kullanır. |
| `NODE_ENV` | `production` yaz — http→https yönlendirmesi ve HSTS güvenlik başlığı ancak o zaman devreye girer. |

**Opsiyonel (boş bırakılırsa ilgili özellik "ücretsiz/stub" modda çalışmaya devam eder):**

| Değişken | Ne işe yarar |
|---|---|
| `ANTHROPIC_API_KEY` | "En güçlü model" aramasını Claude'a soydurmak için — ücretsiz çip+RAM yöntemi zaten var, bu tamamen opsiyonel bir yükseltme (madde 10). |
| `STATS_KEY` | `GET /api/stats`'ı (birinci taraf ziyaret istatistikleri) herkese açık bırakmamak için bir parola. |

Ayrıntılı açıklamalar ve örnek değerler için `.env.example` dosyasına bak.

**Frontend'i de ayrıca deploy etmen lazım** (backend'den bağımsız statik
bir site) — Netlify, Vercel veya Cloudflare Pages ile `cepfiyat-frontend/`
klasörünü yayınlayabilirsin. Deploy ettikten sonra `index.html`'deki
`const API_BASE = 'http://localhost:3000';` satırını gerçek backend
adresinle (`BACKEND_URL` ile aynı değer) değiştirmeyi **unutma** — hem bu
satırı hem de `<meta http-equiv="Content-Security-Policy">` içindeki
`connect-src`'i güncellemen gerekiyor, aksi halde site "Ürünler
yüklenemedi" hatası verir.

## 8. Otomatik ürün eşleştirmeyi test et

Bu, farklı satıcılardaki farklı isimli aynı ürünleri otomatik olarak aynı
`product_id`'ye bağlayan motordur (`match-product.js`).

**Hızlı test (terminal):**
```bash
node test-match.js
```

Bu, veritabanındaki gerçek ürünlere karşı birkaç örnek ham başlık dener ve
her biri için hangi karara vardığını (`matched` / `needs_review` /
`new_candidate`) ve benzerlik skorunu ekrana yazar. **Güvenli**: tüm
işlemler tek bir transaction içinde yapılıp sonunda geri alınır (ROLLBACK)
— veritabanına hiçbir kalıcı iz bırakmaz, canlı veritabanına karşı bile
tekrar tekrar çalıştırabilirsin.

**API üzerinden gerçek bir teklif eklemek istersen** (bu, `test-match.js`'in
aksine **kalıcı** yazar — sadece gerçek bir teklifi girmek/güncellemek
istediğinde kullan):
```bash
curl -X POST http://localhost:3000/api/ingest-offer \
  -H "Content-Type: application/json" \
  -d '{
    "sellerName": "Trendyol",
    "rawTitle": "Apple iPhone 17 256 GB Mavi Cep Telefonu",
    "price": 84500,
    "productUrl": "https://www.trendyol.com/gercek-urun-linki-buraya"
  }'
```

`productUrl` gerçek olmayan (örn. `example.com`) bir adres verirsen, o
sahte adres kalıcı olarak `offers` tablosuna yazılır ve gerçek kullanıcılara
"Satıcıya Git" linki olarak gösterilir — mutlaka gerçek bir satıcı linki
kullan. Cevapta `"status": "matched"` ve doğru `productId`'yi görmen
lazım. Aynı satıcı+ürün için tekrar çağırırsan yeni satır **eklemez**,
mevcut fiyatı günceller (`ON CONFLICT ... DO UPDATE`).

## 9. "En güçlü model" araması artık çip+RAM'i birlikte değerlendiriyor (ücretsiz)

Daha önce bu arama sadece RAM miktarına bakıyordu. Artık `chip-tiers.js`
dosyasındaki bilinen çip güç puanlarıyla (Snapdragon 8 Elite Gen 5,
A19 Pro, Exynos 2600, Dimensity 8400 Ultra, vb.) RAM'i birlikte
değerlendirip karar veriyor. **Bu tamamen ücretsiz** — hiçbir API çağrısı
yapmaz, ekstra kurulum gerektirmez, `.env` dosyasına dokunmana gerek yok.

Yeni bir telefon eklediğinde, o telefonun çipi tabloda yoksa sistem
otomatik olarak nesil ipuçlarına göre (örn. isimde "elite" veya "pro"
geçiyorsa) kaba bir tahmin yapar. Daha isabetli olması için yeni çip
çıktıkça `chip-tiers.js`'e bir satır eklemen yeterli.

**Opsiyonel (isteğe bağlı) yükseltme:** Daha nüanslı bir değerlendirme
istersen, `.env` dosyasına bir `ANTHROPIC_API_KEY` ekleyerek bu kararı
Claude'a da soydurabilirsin (çok küçük bir maliyet karşılığında — ayrıntı
için sohbette konuştuğumuz maliyet açıklamasına bakabilirsin). Bu tamamen
opsiyonel; anahtar eklemezsen sistem yukarıdaki ücretsiz yöntemle sorunsuz
çalışmaya devam eder.


## 10. Özellik tablosunu genişletmek istersen (ağırlık, su geçirmezlik, şarj hızı, kamera detayı)

`products.specs` bir JSONB kolonu — yeni bir özellik eklemek için ilgili
ürünün specs alanına `UPDATE products SET specs = specs || '{"weight_g": 187}' WHERE id = '...'`
gibi bir sorguyla istediğin alanı ekleyebilir/güncelleyebilirsin.
Backend'i yeniden başlatmana gerek yok — veri her istekte taze çekiliyor,
sadece tarayıcıda sayfayı yenile (Cmd+R).

Şu an desteklenen/kullanılan alanlar: `ram_gb`, `storage_gb`, `screen_inch`,
`battery_mah`, `chip`, `main_camera_mp`, `ultra_wide_mp`, `telephoto_mp`,
`optical_zoom_x`, `front_camera_mp`, `weight_g`, `ip_rating`,
`wired_charging_watts`, `wireless_charging_watts`, `has_nfc`, `has_5g`,
`release_year`.

## 11. Diğer önemli özellikler (kısa özet)

Zamanla eklenen ve koddaki yorumlarda ayrıntısı olan, ama başka yerde
belgelenmemiş özellikler:

- **Ürün detay sayfaları + SEO** (`product-page.js`, `GET /urun/:id/:slug`) —
  her ürün için sunucu tarafında render edilmiş (SSR), gerçek meta
  etiketleri ve JSON-LD içeren bir sayfa. `GET /sitemap.xml` ve
  `GET /robots.txt` da bunun için var.
- **Taksit hesaplama** (`installments.js`) — sadece belirli satıcılarda,
  BDDK'nın telefon/elektronikte taksiti 6 ay ile sınırlayan düzenlemesine
  uygun (3/6 ay).
- **Birinci taraf, kimliksiz kullanım istatistiği** (`POST /api/track`,
  `GET /api/stats`) — dış bir analitik hesabı gerektirmez.
- **Güvenlik**: rate limiting (`rate-limit.js`), CORS kısıtlaması, CSP +
  diğer güvenlik başlıkları, tüm satıcı URL'lerinin http(s) şema kontrolü
  (hem `POST /api/ingest-offer`'da hem de `match-product.js`'in kendisinde
  — iki katmanlı savunma).
