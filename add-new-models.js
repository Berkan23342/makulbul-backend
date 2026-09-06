// add-new-models.js — Samsung ve Xiaomi kataloğuna yeni (2025) modelleri
// ekler: Z Fold7, Z Flip7, Galaxy A56 5G, Xiaomi 15T Pro, Xiaomi 15T, POCO F7.
// Tek seferlik migration scripti — çalıştırdıktan sonra silinebilir.
//
// Kullanım: node add-new-models.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const PRODUCTS = [
  {
    brand: 'Samsung',
    model: 'Galaxy Z Fold7',
    canonical_name: 'Samsung Galaxy Z Fold7 512GB',
    normalized_key: 'samsung-galaxy-z-fold7-512gb',
    specs: {
      chip: 'Snapdragon 8 Elite for Galaxy',
      note: 'Katlanabilir ekran, 200MP ana kamera',
      has_5g: true, ram_gb: 12, has_nfc: true, storage_gb: 512,
      battery_mah: 4400, screen_inch: 8.0, release_year: 2025,
      main_camera_mp: 200, refresh_rate_hz: 120,
    },
    offers: [
      { seller: 'Samsung Türkiye', price: 107999, url: 'https://www.samsung.com/tr/smartphones/galaxy-z-fold7/buy/' },
      { seller: 'Trendyol', price: 104999 },
      { seller: 'Hepsiburada', price: 105499 },
      { seller: 'MediaMarkt', price: 106999 },
    ],
  },
  {
    brand: 'Samsung',
    model: 'Galaxy Z Flip7',
    canonical_name: 'Samsung Galaxy Z Flip7 256GB',
    normalized_key: 'samsung-galaxy-z-flip7-256gb',
    specs: {
      chip: 'Exynos 2500',
      note: 'Katlanabilir kapak ekranlı',
      has_5g: true, ram_gb: 12, has_nfc: true, storage_gb: 256,
      battery_mah: 4300, screen_inch: 6.9, release_year: 2025,
      main_camera_mp: 50, refresh_rate_hz: 120,
    },
    offers: [
      { seller: 'Samsung Türkiye', price: 69999, url: 'https://www.samsung.com/tr/smartphones/galaxy-z-flip7/buy/' },
      { seller: 'Hepsiburada', price: 66999 },
      { seller: 'N11', price: 67449 },
      { seller: 'Vatan Bilgisayar', price: 68499 },
    ],
  },
  {
    brand: 'Samsung',
    model: 'Galaxy A56 5G',
    canonical_name: 'Samsung Galaxy A56 5G 256GB',
    normalized_key: 'samsung-galaxy-a56-5g-256gb',
    specs: {
      chip: 'Exynos 1580',
      has_5g: true, ram_gb: 8, has_nfc: true, storage_gb: 256,
      battery_mah: 5000, screen_inch: 6.7, release_year: 2025,
      main_camera_mp: 50, refresh_rate_hz: 120,
    },
    offers: [
      { seller: 'Samsung Türkiye', price: 25999, url: 'https://www.samsung.com/tr/smartphones/galaxy-a/galaxy-a56-5g/buy/' },
      { seller: 'MediaMarkt', price: 24499 },
      { seller: 'Trendyol', price: 24999 },
      { seller: 'Vatan Bilgisayar', price: 25499 },
    ],
  },
  {
    brand: 'Xiaomi',
    model: 'Xiaomi 15T Pro',
    canonical_name: 'Xiaomi 15T Pro 256GB',
    normalized_key: 'xiaomi-15t-pro-256gb',
    specs: {
      chip: 'Dimensity 9400+',
      note: 'Leica kamera sistemi, 90W hızlı şarj',
      has_5g: true, ram_gb: 12, has_nfc: true, storage_gb: 256,
      battery_mah: 5500, screen_inch: 6.83, release_year: 2025,
      main_camera_mp: 50, refresh_rate_hz: 144,
    },
    offers: [
      { seller: 'Xiaomi Türkiye', price: 46999, url: 'https://www.mi.com/tr/product/xiaomi-15t-pro/buy/' },
      { seller: 'Hepsiburada', price: 44999 },
      { seller: 'Vatan Bilgisayar', price: 45499 },
      { seller: 'MediaMarkt', price: 45999 },
    ],
  },
  {
    brand: 'Xiaomi',
    model: 'Xiaomi 15T',
    canonical_name: 'Xiaomi 15T 256GB',
    normalized_key: 'xiaomi-15t-256gb',
    specs: {
      chip: 'Dimensity 8400 Ultra',
      has_5g: true, ram_gb: 12, has_nfc: true, storage_gb: 256,
      battery_mah: 5500, screen_inch: 6.83, release_year: 2025,
      main_camera_mp: 50, refresh_rate_hz: 120,
    },
    offers: [
      { seller: 'Xiaomi Türkiye', price: 36999, url: 'https://www.mi.com/tr/product/xiaomi-15t/buy/' },
      { seller: 'Trendyol', price: 37999 },
      { seller: 'N11', price: 38499 },
      { seller: 'Hepsiburada', price: 38999 },
    ],
  },
  {
    brand: 'Xiaomi',
    model: 'POCO F7',
    canonical_name: 'POCO F7 256GB NFC',
    normalized_key: 'poco-f7-256gb-nfc',
    specs: {
      chip: 'Snapdragon 8s Gen 4',
      has_5g: true, ram_gb: 12, has_nfc: true, storage_gb: 256,
      battery_mah: 6500, screen_inch: 6.83, release_year: 2025,
      main_camera_mp: 50, refresh_rate_hz: 120,
    },
    offers: [
      { seller: 'Xiaomi Türkiye', price: 27999, url: 'https://www.mi.com/tr/product/poco-f7/buy/' },
      { seller: 'Trendyol', price: 26999 },
      { seller: 'Hepsiburada', price: 27499 },
      { seller: 'N11', price: 27999 },
    ],
  },
];

// Arama tabanlı satıcılar için doğrulanmış URL kalıpları (bkz. README /
// önceki oturumdaki canlı satıcı gezintisi) — resmi marka URL'si
// verilmemişse bu kalıpla arama sonucu linki üretilir.
function searchUrl(sellerName, query) {
  const q = encodeURIComponent(query);
  switch (sellerName) {
    case 'Hepsiburada': return `https://www.hepsiburada.com/ara?q=${q}`;
    case 'Trendyol': return `https://www.trendyol.com/sr?q=${q}`;
    case 'N11': return `https://www.n11.com/arama?q=${q}`;
    case 'MediaMarkt': return `https://www.mediamarkt.com.tr/tr/search.html?query=${q}`;
    case 'Amazon TR': return `https://www.amazon.com.tr/s?k=${q}`;
    case 'Vatan Bilgisayar': return `https://www.vatanbilgisayar.com/arama/${q}/`;
    case 'Teknosa': return `https://www.teknosa.com/arama/?s=${q}`;
    default: return null;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [cat] } = await client.query(`SELECT id FROM categories WHERE slug='telefon'`);
    const { rows: brandRows } = await client.query(`SELECT id, name FROM brands`);
    const brandId = Object.fromEntries(brandRows.map(b => [b.name, b.id]));
    const { rows: sellerRows } = await client.query(`SELECT id, name FROM sellers`);
    const sellerId = Object.fromEntries(sellerRows.map(s => [s.name, s.id]));

    for (const p of PRODUCTS) {
      const { rows: existing } = await client.query(
        `SELECT id FROM products WHERE normalized_key = $1`,
        [p.normalized_key]
      );
      if (existing.length) {
        console.log(`ATLA (zaten var): ${p.canonical_name}`);
        continue;
      }

      const { rows: [product] } = await client.query(
        `INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [cat.id, brandId[p.brand], p.model, p.canonical_name, JSON.stringify(p.specs), p.normalized_key]
      );
      console.log(`✔ ürün eklendi: ${p.canonical_name}`);

      for (const offer of p.offers) {
        const sid = sellerId[offer.seller];
        if (!sid) throw new Error(`Bilinmeyen satıcı: ${offer.seller}`);
        const url = offer.url || searchUrl(offer.seller, p.canonical_name);
        if (!url) throw new Error(`URL kalıbı yok: ${offer.seller}`);

        await client.query(
          `INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency, in_stock, shipping_cost)
           VALUES ($1, $2, $3, $4, $4, $5, 'TRY', true, 0)`,
          [product.id, sid, p.canonical_name, url, offer.price]
        );
      }
      console.log(`  ↳ ${p.offers.length} teklif eklendi`);
    }

    await client.query('COMMIT');
    console.log('\n✔ Tamamlandı.');
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
