// update-real-links.js — Arama linkleri yerine gerçek ürün sayfası linkleri.
// Her satıcı için ayrı ayrı, canlı sitede doğrulanmış gerçek ürün linkleriyle
// offers.product_url / affiliate_url günceller. Tek seferlik migration.
//
// Kullanım: node update-real-links.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// { canonical_name -> gerçek ürün URL'si }, satıcı bazında
const UPDATES = {
  'Hepsiburada': {
    'Apple iPhone 13 128GB': 'https://www.hepsiburada.com/apple-iphone-13-128-gb-siyah-p-HBCV00000ODHHF',
    'Apple iPhone 13 Pro 128GB': 'https://www.hepsiburada.com/apple-iphone-13-pro-128-gb-kursun-gri-p-HBCV00000ODIGK',
    'Apple iPhone 13 Pro Max 128GB': 'https://www.hepsiburada.com/apple-iphone-13-pro-max-512-gb-yesil-p-HBCV00001TJXCF',
    'Apple iPhone 14 128GB': 'https://www.hepsiburada.com/apple-iphone-14-128-gb-siyah-p-HBCV00002VUQ7R',
    'Apple iPhone 14 Plus 128GB': 'https://www.hepsiburada.com/apple-iphone-14-plus-128-gb-siyah-p-HBCV00002W2807',
    'Apple iPhone 14 Pro Max 128GB': 'https://www.hepsiburada.com/iphone-14-pro-max-128gb-derin-mor-yenilenmis-outlet-p-HBCV000076RAHD',
    'Apple iPhone 15 128GB': 'https://www.hepsiburada.com/apple-iphone-15-128-gb-siyah-p-HBCV00004X9ZCH',
    'Apple iPhone 15 Plus 128GB': 'https://www.hepsiburada.com/iphone-15-plus-128-gb-pm-HBC00004XA25S',
    'Apple iPhone 15 Pro 128GB': 'https://www.hepsiburada.com/apple-iphone-15-pro-128-gb-naturel-titanyum-p-HBCV00004XA874',
    'Apple iPhone 15 Pro Max 256GB': 'https://www.hepsiburada.com/yenilenmis-apple-iphone-15-pro-max-256-gb-naturel-titanyum-12-ay-garantili-a-grade-pm-HBC00007CR1I5',
    'Apple iPhone 16 128GB': 'https://www.hepsiburada.com/apple-iphone-16-128gb-siyah-p-HBCV00006Y4HFJ',
    'Apple iPhone 16 Plus 128GB': 'https://www.hepsiburada.com/apple-iphone-16-plus-128gb-siyah-p-HBCV00006Y4HG5',
    'Apple iPhone 16 Pro 128GB': 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-siyah-p-HBCV00006Y4HBH',
    'Apple iPhone 17 256GB': 'https://www.hepsiburada.com/apple-iphone-17-256-gb-siyah-p-HBCV00009Z3Y49',
    'Apple iPhone 17 Pro Max 256GB': 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-abis-p-HBCV00009Z3XOE',
    'Apple iPhone 17e 256GB': 'https://www.hepsiburada.com/apple-iphone-17e-256-gb-siyah-p-HBCV0000D58K86',
    'Apple iPhone Air 256GB': 'https://www.hepsiburada.com/apple-iphone-air-256-gb-uzay-siyahi-p-HBCV00009Z40TG',
    'POCO F7 256GB NFC': 'https://www.hepsiburada.com/poco-f7-pro-512-gb-12-gb-ram-poco-turkiye-garantili-siyah-p-HBCV00008CECO4',
    'POCO X7 Pro 256GB NFC': 'https://www.hepsiburada.com/poco-x7-pro-512-gb-12-gb-ram-poco-turkiye-garantili-siyah-p-HBCV00007MJ4IF',
    'Redmi Note 15 Pro 5G 256GB NFC': 'https://www.hepsiburada.com/redmi-note-15-pro-5g-256-gb-8-gb-ram-xiaomi-turkiye-garantili-siyah-p-HBCV0000BMXZQT',
    'Samsung Galaxy S26+ 256GB': 'https://www.hepsiburada.com/samsung-galaxy-s26-256-gb-12-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV0000CVGX60',
    'Samsung Galaxy Z Flip7 256GB': 'https://www.hepsiburada.com/samsung-galaxy-z-flip7-256-gb-12-gb-ram-samsung-turkiye-garantili-gece-siyahi-p-HBCV000096XB98',
    'Samsung Galaxy Z Fold7 512GB': 'https://www.hepsiburada.com/samsung-galaxy-z-fold7-512-gb-12-gb-ram-samsung-turkiye-garantili-gece-siyahi-p-HBCV000096WLYV',
    'Xiaomi 15T 256GB': 'https://www.hepsiburada.com/xiaomi-15t-256-gb-12-gb-ram-xiaomi-turkiye-garantili-siyah-p-HBCV00009YFHZ8',
    'Xiaomi 15T Pro 256GB': 'https://www.hepsiburada.com/xiaomi-15t-pro-512-gb-12-gb-ram-xiaomi-turkiye-garantili-mocha-gold-p-HBCV00009X6PHE',
    // Xiaomi 17 Ultra 256GB: Hepsiburada'da bu model bulunamadı (yalnızca 17T/17T Pro
    // serisi satılıyor) — yanlış satıcıya yönlendirmemek için arama linki korunuyor.
  },
  'Trendyol': {
    'Apple iPhone 13 128GB': 'https://www.trendyol.com/apple/iphone-13-128-gb-yildiz-isigi-cep-telefonu-apple-turkiye-garantili-p-150059024',
    'Apple iPhone 13 Pro 128GB': 'https://www.trendyol.com/apple/yenilenmis-iphone-13-pro-128-gb-grafit-cep-telefonu-12-ay-garantili-b-kalite-p-689225265',
    'Apple iPhone 14 128GB': 'https://www.trendyol.com/apple/yenilenmis-iphone-14-128-gb-mavi-cep-telefonu-12-ay-garantili-b-kalite-p-820711905',
    'Apple iPhone 14 Pro 128GB': 'https://www.trendyol.com/apple/yenilenmis-iphone-14-pro-128-gb-uzay-siyahi-cep-telefonu-12-ay-garantili-a-kalite-p-865706168',
    'Apple iPhone 14 Pro Max 128GB': 'https://www.trendyol.com/apple/yenilenmis-iphone-14-pro-max-128-gb-mor-cep-telefonu-12-ay-garantili-a-kalite-p-815069897',
    'Apple iPhone 15 128GB': 'https://www.trendyol.com/apple/iphone-15-128-gb-mavi-p-762254881',
    'Apple iPhone 15 Pro 128GB': 'https://www.trendyol.com/apple/yenilenmis-15-pro-128-gb-naturel-titanyum-uyumlu-cep-telefonu-12-ay-garantili-a-kalite-p-848556676',
    'Apple iPhone 15 Pro Max 256GB': 'https://www.trendyol.com/apple/yenilenmis-iphone-15-pro-max-256-gb-naturel-titanyum-cep-telefonu-12-ay-garantili-a-kalite-p-848556047',
    'Apple iPhone 16 Pro 128GB': 'https://www.trendyol.com/apple/yenilenmis-iphone-16-pro-128-gb-naturel-titanyum-12-ay-garantili-a-grade-p-1073402964',
    'Apple iPhone 17 256GB': 'https://www.trendyol.com/apple/iphone-17-256gb-beyaz-p-985256845',
    'Apple iPhone 17 Pro Max 256GB': 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-gumus-p-985256821',
    'POCO X7 Pro 256GB NFC': 'https://www.trendyol.com/poco/x7-pro-12gb-ram-512gb-rom-siyah-p-887495923',
    'Redmi Note 15 Pro 5G 256GB NFC': 'https://www.trendyol.com/xiaomi/redmi-note-15-pro-5g-8-gb-256-gb-siyah-xiaomi-turkiye-garantili-p-1074984339',
    'Samsung Galaxy A56 5G 256GB': 'https://www.trendyol.com/samsung/galaxy-a56-5g-8-gb-ram-256-gb-siyah-p-917839674',
    'Samsung Galaxy S26 256GB': 'https://www.trendyol.com/samsung/galaxy-s26-12gb-256gb-siyah-cep-telefonu-p-1100212110',
    'Samsung Galaxy Z Fold7 512GB': 'https://www.trendyol.com/samsung/galaxy-z-fold7-sm-f966bdbctur-12-gb-512-gb-golge-mavisi-telefon-samsung-turkiye-garantili-p-948923570',
    // Bulunamadı, arama linki korunuyor: iPhone 13 mini, iPhone 14 Plus, iPhone 15 Plus,
    // iPhone 16 Plus, iPhone 17e, POCO F7, Xiaomi 15T, Xiaomi 17 (bu SKU'lar Trendyol'da
    // şu an listelenmiyor).
  },
  'MediaMarkt': {
    'Apple iPhone 14 Pro 128GB': 'https://www.mediamarkt.com.tr/tr/product/_apple-yenilenmis-g1-iphone-14-pro-128-gb-akilli-telefon-beyaz-1233833.html',
    'Apple iPhone 16 Pro Max 256GB': 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-pro-max-256-gb-akilli-telefon-siyah-147051791.html',
    'Apple iPhone 17 Pro 256GB': 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-17-pro-256gb-akilli-telefon-gumus-1249236.html',
    'Samsung Galaxy A56 5G 256GB': 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-a56-8-gb-256-gb-akilli-telefon-gri-167820640.html',
    'Samsung Galaxy S26 Ultra 256GB': 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-s26-ultra-5g-12256gb-akilli-telefon-siyah-1252481.html',
    'Samsung Galaxy Z Fold7 512GB': 'https://www.mediamarkt.com.tr/tr/product/_samsung-galaxy-z-fold-7-12512gb-akilli-telefon-golge-mavisi-1248050.html',
    // Bulunamadı, arama linki korunuyor: POCO X7 Pro, Xiaomi 15T Pro.
  },
  'N11': {
    'Apple iPhone 13 mini 128GB': 'https://www.n11.com/urun/yenilenmis-apple-iphone-13-mini-128gb-b-kalite-12-ay-garantili-50239987',
    'POCO F7 256GB NFC': 'https://www.n11.com/urun/xiaomi-poco-f7-ultra-5g-12-gb-256-gb-xiaomi-turkiye-garantili-123748446',
    'Redmi Note 15 Pro 5G 256GB NFC': 'https://www.n11.com/urun/xiaomi-redmi-note-15-pro-5g-8-gb256-gb-xiaomi-turkiye-garantili-117448102',
    'Samsung Galaxy S26 256GB': 'https://www.n11.com/urun/samsung-galaxy-s26-12-gb-256-gb-samsung-turkiye-garantili-120593615',
    'Samsung Galaxy S26 Ultra 256GB': 'https://www.n11.com/urun/samsung-galaxy-s26-ultra-256-gb-samsung-turkiye-garantili-120593847',
    'Samsung Galaxy Z Flip7 256GB': 'https://www.n11.com/urun/samsung-galaxy-z-flip7-256-gb-samsung-turkiye-garantili-89333363',
    'Xiaomi 15T 256GB': 'https://www.n11.com/urun/xiaomi-15t-12-gb-256-gb-xiaomi-distributor-garantili-102487303',
  },
  'Vatan Bilgisayar': {
    'Apple iPhone 16 Pro Max 256GB': 'https://www.vatanbilgisayar.com/iphone-16-pro-max-akilli-telefon.html',
    'Apple iPhone 17 256GB': 'https://www.vatanbilgisayar.com/iphone-17-256-gb-akilli-telefon-beyaz.html',
    'Samsung Galaxy A56 5G 256GB': 'https://www.vatanbilgisayar.com/samsung-galaxy-a56.html',
    'Samsung Galaxy S26 Ultra 256GB': 'https://www.vatanbilgisayar.com/samsung-galaxy-s26-ultra-akilli-telefon.html',
    'Samsung Galaxy Z Flip7 256GB': 'https://www.vatanbilgisayar.com/samsung-galaxy-z-flip7-akilli-telefon.html',
    'Xiaomi 15T Pro 256GB': 'https://www.vatanbilgisayar.com/xiaomi-15t-pro-12-512gb-akilli-telefon-siyah.html',
    // Bulunamadı, arama linki korunuyor: iPhone 13 Pro Max (Vatan'da stokta yok).
  },
  'Amazon TR': {
    'Apple iPhone 17 256GB': 'https://www.amazon.com.tr/dp/B0FQFPJ86G',
  },
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0, skipped = 0;

    for (const [sellerName, products] of Object.entries(UPDATES)) {
      for (const [canonicalName, url] of Object.entries(products)) {
        const { rows } = await client.query(
          `UPDATE offers o
           SET product_url = $1, affiliate_url = $1
           FROM products p, sellers s
           WHERE o.product_id = p.id AND o.seller_id = s.id
             AND p.canonical_name = $2 AND s.name = $3
           RETURNING o.id`,
          [url, canonicalName, sellerName]
        );
        if (rows.length) {
          updated++;
          console.log(`✔ ${sellerName} | ${canonicalName}`);
        } else {
          skipped++;
          console.log(`⚠ Eşleşme yok: ${sellerName} | ${canonicalName}`);
        }
      }
    }

    await client.query('COMMIT');
    console.log(`\n✔ Tamamlandı. ${updated} güncellendi, ${skipped} eşleşmedi.`);
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
