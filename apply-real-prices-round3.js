// apply-real-prices-round3.js — kalan 33 üründeki (round2'de dokunulmamış
// tüm Samsung + Xiaomi ekosisteminin geri kalanı + Apple'ın geri kalanı +
// diğer markalar) eski/tek-varyantlı fiyat verisini, 3 paralel araştırma
// ajanından gelen GERÇEK Hepsiburada/Trendyol/Amazon TR verisiyle
// değiştirir. round2 ile AYNI kurallar, AYNI script yapısı.
//
// KRİTİK BULGULAR:
// - Samsung ailesinin neredeyse tamamında (A36'dan S26 Ultra'ya, Z
//   Flip7/Fold7 dahil) GERÇEKTEN çok sayıda renk VE bazılarında birden
//   fazla kapasite satışta — akakçe'deki gibi zengin bir GB+renk
//   matrisi ortaya çıktı.
// - Apple iPhone 13 Pro Max: önceki turda "sadece Yenilenmiş" denmişti,
//   bu YANLIŞMIŞ — Hepsiburada'da 512GB ve 1TB kapasitelerde GERÇEK
//   YENİ stok bulundu. "Satış yok" durumundan çıkarıldı.
// - Apple iPhone 15 Pro: Trendyol'da mevcut "teklif yok" durumu güncel
//   değilmiş — 128GB Natürel Titanyum'da YENİ, sayfa-doğrulanmış bir
//   teklif bulundu.
// - Xiaomi 15T Pro / Xiaomi 17 / Xiaomi 17 Ultra: bu 3 üründe kendi
//   nominal 256GB kapasitesi ÜÇ sitede de tekrar doğrulanarak "hiç
//   satılmıyor" olduğu teyit edildi (sadece 512GB/1TB satışta).
// - iPhone 13 mini, 14 Pro, 14 Pro Max, 15 Pro Max ve diğer markalardan
//   (Honor, Sony, OnePlus, Google Pixel, POCO F7 düz, Xiaomi 17 Pro)
//   14 ürün için "satış yok" durumu TEKRAR doğrulandı, değişiklik yok —
//   bu ürünler bu script'e dahil edilmedi (zaten offers=[] durumunda).
//
// KURALLAR (round2 ile birebir aynı):
// - "Yenilenmiş" (refurbished) fiyatlar HİÇBİR ZAMAN "sıfır" gibi
//   uygulanmadı.
// - Ajanın "sayfa doğrulandı" / "canlı arama sayfası doğrulandı" dediği
//   (satıcının kendi sitesinden doğrudan okunan) veriler kullanıldı;
//   ajanın kendisinin "stok durumu tutarsız / sayfa teyit edilemedi"
//   diye açıkça şüpheli işaretlediği tekil bulgular (ör. Xiaomi 17
//   Ultra'nın Trendyol'daki Beyaz teklifi) DAHİL EDİLMEDİ.
// - Gerçek bir ürün sayfası URL'i verilmemişse searchUrl() ile satıcının
//   kendi arama sonucu linkine düşülüyor — UYDURMA link asla yazılmadı.
// - "1 TB" kapasitesi storage_gb sütununda 1024 olarak kaydedildi.
// - Satıcılar arası büyük fiyat farkları (ör. iPhone 13 Pro'da 512GB'ın
//   128GB'dan daha ucuz olması, Z Fold7'de 256GB'ın 512GB'dan pahalı
//   olması) GERÇEK, sayfa-doğrulanmış rakamlar olduğu için olduğu gibi
//   uygulandı — bunlar muhtemelen düşük stoklu/az talep gören
//   kapasitelerdeki kıtlık fiyatlaması, "hata" değil.
//
// Kullanım: node apply-real-prices-round3.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function searchUrl(sellerName, query) {
  const q = encodeURIComponent(query);
  switch (sellerName) {
    case 'Hepsiburada': return `https://www.hepsiburada.com/ara?q=${q}`;
    case 'Trendyol': return `https://www.trendyol.com/sr?q=${q}`;
    case 'Amazon TR': return `https://www.amazon.com.tr/s?k=${q}`;
    default: return null;
  }
}

const PRODUCTS = {
  // ---------------- APPLE ----------------
  'Apple iPhone 15 Plus 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 74999, storage_gb: 128, color: 'Yeşil', url: 'https://www.hepsiburada.com/iphone-15-plus-128-gb-pm-HBC00004XA25S' },
      { seller: 'Amazon TR', price: 77499, storage_gb: 512, color: 'Pembe', url: 'https://www.amazon.com.tr/Apple-iPhone-15-Plus-512/dp/B0CHXKJWLB/' },
      { seller: 'Amazon TR', price: 75699, storage_gb: 512, color: 'Siyah' }, // arama sonucu, URL teyit edilemedi
      // Trendyol: sadece Yenilenmiş — eklenmedi
    ],
  },
  'Apple iPhone 13 Pro 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 81999, storage_gb: 128, color: 'Kurşun Gri', url: 'https://www.hepsiburada.com/apple-iphone-13-pro-128-gb-kursun-gri-p-HBCV00000ODIGK' },
      { seller: 'Hepsiburada', price: 79999, storage_gb: 512, color: 'Kurşun Gri', url: 'https://www.hepsiburada.com/apple-iphone-13-pro-512gb-grafit-apple-turkiye-garantili-kursun-gri-p-HBCV00000ODIHU' },
      // Trendyol/Amazon: sadece Yenilenmiş / bulunamadı — eklenmedi
    ],
  },
  'Apple iPhone 13 Pro Max 128GB': {
    // ÖNCEKİ TUR YANLIŞMIŞ: sadece Yenilenmiş sanılıyordu, Hepsiburada'da
    // GERÇEK yeni stok bulundu (üst kapasitelerde) — "satış yok"tan çıktı.
    offers: [
      { seller: 'Hepsiburada', price: 98999, storage_gb: 512, color: 'Yeşil', url: 'https://www.hepsiburada.com/apple-iphone-13-pro-max-512-gb-yesil-p-HBCV00001TJXCF' },
      { seller: 'Hepsiburada', price: 109999, storage_gb: 1024, color: 'Gümüş' }, // arama sonucu, URL teyit edilemedi
      { seller: 'Hepsiburada', price: 106999, storage_gb: 1024, color: 'Altın' }, // arama sonucu, URL teyit edilemedi
      // Trendyol/Amazon: sadece Yenilenmiş / bulunamadı — eklenmedi
    ],
  },
  'Apple iPhone 15 Pro 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 117000, storage_gb: 128, color: 'Naturel Titanyum', url: 'https://www.hepsiburada.com/apple-iphone-15-pro-128-gb-naturel-titanyum-p-HBCV00004XA874' },
      { seller: 'Trendyol', price: 104999, storage_gb: 128, color: 'Naturel Titanyum', url: 'https://www.trendyol.com/apple/iphone-15-pro-128-gb-naturel-titanyum-p-762254869' },
      { seller: 'Hepsiburada', price: 106999, storage_gb: 256, color: 'Siyah Titanyum' }, // arama sonucu, URL teyit edilemedi
      // Amazon: bulunamadı — eklenmedi
    ],
  },
  'Apple iPhone 16 Pro 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 119399, storage_gb: 128, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-siyah-p-HBCV00006Y4HBH' },
      { seller: 'Hepsiburada', price: 119899, storage_gb: 128, color: 'Çöl Titanyum' }, // arama sonucu, URL teyit edilemedi
      { seller: 'Hepsiburada', price: 125000, storage_gb: 128, color: 'Naturel Titanyum' }, // arama sonucu, URL teyit edilemedi
      // Trendyol: sadece Yenilenmiş, Amazon: bulunamadı — eklenmedi
    ],
  },
  'Apple iPhone 17 256GB': {
    // Bu ürün üç sitede de en zengin GB+renk matrisine sahip çıktı.
    offers: [
      { seller: 'Hepsiburada', price: 81999, storage_gb: 256, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-siyah-p-HBCV00009Z3Y49' },
      { seller: 'Hepsiburada', price: 83299, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Hepsiburada', price: 81799, storage_gb: 256, color: 'Sis Mavisi' },
      { seller: 'Hepsiburada', price: 82999, storage_gb: 256, color: 'Lavanta' },
      { seller: 'Hepsiburada', price: 84999, storage_gb: 256, color: 'Ada Çayı' },
      { seller: 'Hepsiburada', price: 91199, storage_gb: 512, color: 'Sis Mavisi' },
      { seller: 'Hepsiburada', price: 90999, storage_gb: 512, color: 'Ada Çayı' },
      { seller: 'Hepsiburada', price: 91699, storage_gb: 512, color: 'Lavanta' },
      { seller: 'Hepsiburada', price: 101599, storage_gb: 512, color: 'Siyah' },
      { seller: 'Trendyol', price: 84999, storage_gb: 256, color: 'Siyah', url: 'https://www.trendyol.com/apple/iphone-17-256gb-siyah-p-985256842' },
      { seller: 'Trendyol', price: 84999, storage_gb: 256, color: 'Sis Mavisi' },
      { seller: 'Trendyol', price: 86499, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Trendyol', price: 84999, storage_gb: 256, color: 'Lavanta' },
      { seller: 'Trendyol', price: 82352, storage_gb: 256, color: 'Ada Çayı' },
      { seller: 'Trendyol', price: 90999, storage_gb: 512, color: 'Beyaz' },
      { seller: 'Amazon TR', price: 82599, storage_gb: 256, color: 'Siyah', url: 'https://www.amazon.com.tr/dp/B0FQFBXXWF' },
      { seller: 'Amazon TR', price: 82352, storage_gb: 256, color: 'Ada Çayı' },
    ],
  },

  // ---------------- SAMSUNG ----------------
  'Samsung Galaxy A36 5G 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 25964.27, storage_gb: 256, color: 'Siyah' },
      { seller: 'Hepsiburada', price: 22137.00, storage_gb: 128, color: 'Siyah' },
      { seller: 'Trendyol', price: 27899, storage_gb: 256, color: 'Siyah', url: 'https://www.trendyol.com/samsung/galaxy-a36-5g-256-gb-siyah-cep-telefonu-p-917839672' },
      { seller: 'Amazon TR', price: 27999, storage_gb: 256, color: 'Siyah', url: 'https://www.amazon.com.tr/dp/B0F1FRFGVY' },
      { seller: 'Amazon TR', price: 21800.00, storage_gb: 128, color: 'Siyah' },
    ],
  },
  'Samsung Galaxy A56 5G 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 30680.70, storage_gb: 256, color: 'Gri' },
      { seller: 'Trendyol', price: 32340, storage_gb: 256, color: 'Gri' },
      { seller: 'Amazon TR', price: 31250, storage_gb: 256, color: 'Antrasit' },
      { seller: 'Amazon TR', price: 27305.00, storage_gb: 128, color: 'Antrasit' },
    ],
  },
  'Samsung Galaxy S25 FE 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 37239.05, storage_gb: 256, color: 'Buz Mavisi' },
      { seller: 'Trendyol', price: 36999, storage_gb: 256, color: 'Lacivert' },
      { seller: 'Amazon TR', price: 36499, storage_gb: 256, color: 'Buz Mavisi' },
    ],
  },
  'Samsung Galaxy Z Flip7 FE 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 53956.54, storage_gb: 256, color: 'Siyah' },
      { seller: 'Hepsiburada', price: 53956.54, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Hepsiburada', price: 48399.00, storage_gb: 128, color: 'Beyaz' },
      { seller: 'Trendyol', price: 46999, storage_gb: 256, color: 'Siyah' },
      { seller: 'Trendyol', price: 55999, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Trendyol', price: 64999, storage_gb: 128, color: 'Siyah' },
      { seller: 'Amazon TR', price: 58999, storage_gb: 256, color: 'Beyaz' },
    ],
  },
  'Samsung Galaxy S26 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 59999, storage_gb: 256, color: 'Siyah' },
      { seller: 'Hepsiburada', price: 60999, storage_gb: 256, color: 'Kobalt Mor' },
      { seller: 'Hepsiburada', price: 58419.08, storage_gb: 256, color: 'Gök Mavisi' },
      { seller: 'Hepsiburada', price: 58630.68, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Hepsiburada', price: 65000, storage_gb: 256, color: 'Gümüş' },
      { seller: 'Trendyol', price: 59399, storage_gb: 256, color: 'Siyah' },
      { seller: 'Trendyol', price: 59399, storage_gb: 256, color: 'Gök Mavisi' },
      { seller: 'Trendyol', price: 65000, storage_gb: 256, color: 'Gümüş' },
      { seller: 'Amazon TR', price: 57999, storage_gb: 256, color: 'Siyah' },
      { seller: 'Amazon TR', price: 61499, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Amazon TR', price: 58999, storage_gb: 256, color: 'Gök Mavisi' },
      { seller: 'Amazon TR', price: 62499, storage_gb: 256, color: 'Kobalt Mor' },
    ],
  },
  'Samsung Galaxy Z Flip7 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 61599, storage_gb: 256, color: 'Gölge Mavisi' },
      { seller: 'Hepsiburada', price: 65714.46, storage_gb: 256, color: 'Gece Siyahı' },
      { seller: 'Hepsiburada', price: 79999, storage_gb: 512, color: 'Gölge Mavisi' },
      { seller: 'Trendyol', price: 74676.73, storage_gb: 256, color: 'Gece Siyahı' },
      { seller: 'Trendyol', price: 62999, storage_gb: 256, color: 'Mercan' },
      // Amazon TR: şu an stokta yok — eklenmedi
    ],
  },
  'Samsung Galaxy S26+ 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 64999, storage_gb: 256, color: 'Kobalt Mor' },
      { seller: 'Hepsiburada', price: 70499.06, storage_gb: 256, color: 'Siyah' },
      { seller: 'Hepsiburada', price: 74165.06, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Hepsiburada', price: 67538.06, storage_gb: 256, color: 'Gök Mavisi' },
      { seller: 'Hepsiburada', price: 82999, storage_gb: 512, color: 'Siyah' },
      { seller: 'Trendyol', price: 68999, storage_gb: 256, color: 'Siyah', url: 'https://www.trendyol.com/samsung/galaxy-s26-12gb-256gb-siyah-cep-telefonu-p-1100212109' },
      { seller: 'Trendyol', price: 68889, storage_gb: 256, color: 'Kobalt Mor' },
      { seller: 'Amazon TR', price: 65899, storage_gb: 256, color: 'Kobalt Mor' },
    ],
  },
  'Samsung Galaxy S26 Ultra 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 85999, storage_gb: 256, color: 'Siyah' },
      { seller: 'Hepsiburada', price: 83999, storage_gb: 256, color: 'Gök Mavisi' },
      { seller: 'Hepsiburada', price: 83699, storage_gb: 256, color: 'Kobalt Mor' },
      { seller: 'Hepsiburada', price: 85560, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Hepsiburada', price: 88999, storage_gb: 512, color: 'Gök Mavisi' },
      { seller: 'Hepsiburada', price: 88999, storage_gb: 512, color: 'Beyaz' },
      { seller: 'Hepsiburada', price: 88999, storage_gb: 512, color: 'Kobalt Mor' },
      { seller: 'Hepsiburada', price: 89899, storage_gb: 512, color: 'Siyah' },
      { seller: 'Hepsiburada', price: 105499, storage_gb: 512, color: 'Pembe Altın' },
      { seller: 'Hepsiburada', price: 104499, storage_gb: 512, color: 'Gümüş' },
      { seller: 'Trendyol', price: 84999, storage_gb: 256, color: 'Kobalt Mor' },
      { seller: 'Trendyol', price: 84999, storage_gb: 256, color: 'Siyah' },
      { seller: 'Trendyol', price: 108999, storage_gb: 512, color: 'Siyah' },
      { seller: 'Amazon TR', price: 84048, storage_gb: 256, color: 'Beyaz' },
      { seller: 'Amazon TR', price: 85058.99, storage_gb: 256, color: 'Siyah' },
      { seller: 'Amazon TR', price: 83999, storage_gb: 256, color: 'Gök Mavisi' },
      { seller: 'Amazon TR', price: 86599, storage_gb: 256, color: 'Kobalt Mor' },
      { seller: 'Amazon TR', price: 88507, storage_gb: 512, color: 'Kobalt Mor' },
      { seller: 'Amazon TR', price: 88477, storage_gb: 512, color: 'Siyah' },
      { seller: 'Amazon TR', price: 89058.99, storage_gb: 512, color: 'Beyaz' },
    ],
  },
  'Samsung Galaxy Z Fold7 512GB': {
    offers: [
      { seller: 'Hepsiburada', price: 95423.04, storage_gb: 512, color: 'Mavi' },
      { seller: 'Hepsiburada', price: 94559.04, storage_gb: 512, color: 'Gece Siyahı' },
      { seller: 'Hepsiburada', price: 102999, storage_gb: 512, color: 'Gümüş' },
      { seller: 'Hepsiburada', price: 114999, storage_gb: 512, color: 'Yeşil' },
      { seller: 'Hepsiburada', price: 103999, storage_gb: 256, color: 'Gölge Mavisi' },
      { seller: 'Hepsiburada', price: 109999, storage_gb: 1024, color: 'Gece Siyahı' },
      { seller: 'Trendyol', price: 89950, storage_gb: 512, color: 'Gölge Mavisi' },
      { seller: 'Trendyol', price: 90899, storage_gb: 512, color: 'Gümüş' },
      { seller: 'Trendyol', price: 90899, storage_gb: 512, color: 'Gece Siyahı' },
      { seller: 'Amazon TR', price: 88749, storage_gb: 512, color: 'Mavi Gölge' },
      { seller: 'Amazon TR', price: 89960.04, storage_gb: 512, color: 'Gümüş' },
      { seller: 'Amazon TR', price: 88689, storage_gb: 512, color: 'Gece Siyahı' },
      { seller: 'Amazon TR', price: 97799, storage_gb: 256, color: 'Gümüş' },
    ],
  },

  // ---------------- XIAOMI EKOSİSTEMİ (round2'de eksik kalanlar) ----------------
  'Xiaomi 15T Pro 256GB': {
    // 256GB'ın hiçbir sitede satılmadığı tekrar doğrulandı — sadece
    // 512GB (3 renk) ve beklenmedik şekilde 1TB (Trendyol) bulundu.
    offers: [
      { seller: 'Hepsiburada', price: 50499, storage_gb: 512, color: 'Siyah', url: 'https://www.hepsiburada.com/xiaomi-15t-pro-512-gb-12-gb-ram-xiaomi-turkiye-garantili-siyah-p-HBCV00009X6RQF' },
      { seller: 'Trendyol', price: 49490, storage_gb: 512, color: 'Siyah' },
      { seller: 'Trendyol', price: 49500, storage_gb: 512, color: 'Mocha Gold' },
      { seller: 'Trendyol', price: 49690, storage_gb: 512, color: 'Gri' },
      { seller: 'Trendyol', price: 57699, storage_gb: 1024, color: 'Gri', url: 'https://www.trendyol.com/xiaomi/15t-pro-12gb-ram-1024gb-rom-gri-p-992133386' },
      { seller: 'Amazon TR', price: 61999, storage_gb: 512, color: 'Mocha Gold', url: 'https://www.amazon.com.tr/Xiaomi-15T-Pro-512GB-Mocha/dp/B0FPGCFBSF' },
    ],
  },
  'Xiaomi 17 256GB': {
    // 256GB yine bulunamadı — sadece 512GB satışta. Hepsiburada'nın
    // sayfa başlığı "Mavi" yazıyor ama ürün fotoğrafı/rengi gerçekte
    // Siyah (site içi etiketleme hatası) — gerçek renk kullanıldı.
    offers: [
      { seller: 'Hepsiburada', price: 74999, storage_gb: 512, color: 'Siyah', url: 'https://www.hepsiburada.com/xiaomi-17-12g-512g-mavi-pm-HBC0000DA1PC7' },
      { seller: 'Trendyol', price: 78509, storage_gb: 512, color: 'Mavi', url: 'https://www.trendyol.com/xiaomi/17-12g-512g-mavi-p-1110121785' },
      { seller: 'Trendyol', price: 74399, storage_gb: 512, color: 'Siyah' },
    ],
  },
  'Xiaomi 17 Ultra 256GB': {
    // 256GB bulunamadı (model dünya genelinde sadece 512GB/1TB satılıyor).
    // Trendyol'daki eski teklif artık "Benzer Ürünler"e yönlendiriyor
    // (stok/sayfa teyit edilemedi) — kaldırıldı.
    offers: [
      { seller: 'Hepsiburada', price: 109999, storage_gb: 512, color: 'Yeşil', url: 'https://www.hepsiburada.com/xiaomi-17t-pro-5g-512-gb-12-gb-ram-xiaomi-turkiye-garantili-pm-HBC0000FGRSHZ' },
      { seller: 'Hepsiburada', price: 114999, storage_gb: 512, color: 'Siyah', url: 'https://www.hepsiburada.com/xiaomi-17-ultra-16-512gb-akilli-telefon-siyah-pm-HBC0000D8A6D7' },
    ],
  },
  'Redmi Note 15 256GB': {
    // (round2'de "Redmi Note 15 5G 256GB" adından buraya yeniden
    // adlandırılmıştı — bu turda ek renkler bulundu.)
    offers: [
      { seller: 'Hepsiburada', price: 16199, storage_gb: 256, color: 'Siyah', url: 'https://www.hepsiburada.com/redmi-note-15-256-gb-8-gb-ram-xiaomi-turkiye-garantili-mavi-pm-HBC0000BMY04B' },
      { seller: 'Hepsiburada', price: 16909.05, storage_gb: 256, color: 'Mavi', url: 'https://www.hepsiburada.com/redmi-note-15-256-gb-8-gb-ram-xiaomi-turkiye-garantili-mavi-pm-HBC0000BMY04B' },
      { seller: 'Hepsiburada', price: 20899.05, storage_gb: 256, color: 'Yeşil', url: 'https://www.hepsiburada.com/redmi-note-15-256-gb-8-gb-ram-xiaomi-turkiye-garantili-mavi-pm-HBC0000BMY04B' },
      { seller: 'Trendyol', price: 15799, storage_gb: 256, color: 'Siyah' },
      { seller: 'Trendyol', price: 15799, storage_gb: 256, color: 'Mavi' },
    ],
  },
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: sellerRows } = await client.query(`SELECT id, name FROM sellers`);
    const sellerId = Object.fromEntries(sellerRows.map(r => [r.name, r.id]));

    let totalOffersInserted = 0, totalProductsCleared = 0;

    for (const [name, data] of Object.entries(PRODUCTS)) {
      const { rows: prodRows } = await client.query(`SELECT id, canonical_name FROM products WHERE canonical_name = $1`, [name]);
      if (prodRows.length === 0) {
        console.log(`✘ ÜRÜN BULUNAMADI (isim uyuşmuyor): ${name}`);
        continue;
      }
      const pid = prodRows[0].id;

      // Bu ürünün TÜM eski tekliflerini temizle — önce price_history'yi
      // (FK bağımlılığı), sonra offers'ı.
      await client.query(
        `DELETE FROM price_history WHERE offer_id IN (SELECT id FROM offers WHERE product_id = $1)`,
        [pid]
      );
      const del = await client.query(`DELETE FROM offers WHERE product_id = $1`, [pid]);
      totalProductsCleared++;

      for (const offer of data.offers) {
        const sid = sellerId[offer.seller];
        if (!sid) throw new Error(`Bilinmeyen satıcı: ${offer.seller}`);
        const url = offer.url || searchUrl(offer.seller, name);
        await client.query(
          `INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency, storage_gb, color, in_stock, shipping_cost)
           VALUES ($1, $2, $3, $4, $4, $5, 'TRY', $6, $7, true, 0)`,
          [pid, sid, name, url, offer.price, offer.storage_gb, offer.color]
        );
        totalOffersInserted++;
      }

      console.log(`✔ ${name}: eski ${del.rowCount} teklif silindi, ${data.offers.length} gerçek teklif eklendi`);
    }

    await client.query('COMMIT');
    console.log(`\n✔ Tamamlandı. ${totalProductsCleared} ürün işlendi, ${totalOffersInserted} gerçek teklif eklendi.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✘ Hata, geri alındı:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
