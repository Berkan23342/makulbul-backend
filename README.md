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

İkisinde de yapman gereken tek şey: `DATABASE_URL` ve `DB_SSL` ortam
değişkenlerini o platformun ayarlarına (Environment Variables) elle girmek —
`.env` dosyası deploy edilmez, her platformda bu bilgiyi ayrıca girersin.

## 8. index.html'i backend'e bağlama (sıradaki adım)

Şu anki site verideki 12 telefonu kod içinde sabit (`const PHONES = [...]`)
tutuyor. Backend hazır olduğunda bu satırı, sayfa açıldığında
`fetch('http://localhost:3000/api/products')` ile veritabanından veri çeken
bir yapıya çevirmemiz gerekiyor — bunu istersen bir sonraki adımda birlikte
yapalım.

## 9. Otomatik ürün eşleştirmeyi test et

Bu, farklı satıcılardaki farklı isimli aynı ürünleri otomatik olarak aynı
`product_id`'ye bağlayan motordur (`match-product.js`).

**Hızlı test (terminal):**
```bash
node test-match.js
```

Bu, veritabanındaki gerçek ürünlere karşı birkaç örnek ham başlık dener ve
her biri için hangi karara vardığını (`matched` / `needs_review` /
`new_candidate`) ve benzerlik skorunu ekrana yazar.

**API üzerinden test (sunucu çalışırken, başka bir terminalde):**
```bash
curl -X POST http://localhost:3000/api/ingest-offer \
  -H "Content-Type: application/json" \
  -d '{
    "sellerName": "Trendyol",
    "rawTitle": "Apple iPhone 17 256 GB Mavi Cep Telefonu",
    "price": 84500,
    "productUrl": "https://www.trendyol.com/ornek-urun"
  }'
```

Cevapta `"status": "matched"` ve doğru `productId`'yi görmen lazım — bu,
sistemin bu ham başlığı doğru kanonik ürüne bağladığı anlamına gelir ve
`offers` tablosuna yeni bir satır eklenmiş olur.

`SELECT * FROM offers ORDER BY created_at DESC LIMIT 1;` ile pgAdmin'den
bu yeni eklenen teklifi görebilirsin.

## 10. "En güçlü model" araması artık çip+RAM'i birlikte değerlendiriyor (ücretsiz)

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


## 11. Özellik tablosunu genişlet (ağırlık, su geçirmezlik, şarj hızı, kamera detayı)

pgAdmin'de yeni bir sorgu sekmesi aç, `products-update-specs.sql` dosyasının
içeriğini yapıştır, çalıştır. Bu, mevcut 12 ürünün üzerine gerçek/doğrulanmış
yeni özellik alanları ekler (ağırlık, IP derecesi, kablolu/kablosuz şarj
gücü, ön/geniş açı/telefoto kamera çözünürlükleri) — hepsi Apple/Samsung/
Xiaomi'nin resmi sayfalarından derlendi.

Bunu çalıştırdıktan sonra backend'i yeniden başlatmana gerek yok — veri
her istekte veritabanından taze çekiliyor. Sadece tarayıcıda sayfayı
yenile (Cmd+R) ve "Hafif · Kompakt", "Hızlı Şarj" veya "Kablosuz Şarj"
gibi yeni etiketleri dene. Karşılaştırma penceresinde de artık ağırlık,
su/toz direnci ve şarj hızlarını yan yana görebilirsin.
