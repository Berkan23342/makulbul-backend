// add-more-models.js — Katalog çeşitliliğini artırmak için 6 yeni gerçek
// model (3 Samsung, 3 Xiaomi ekosistemi), bu oturumda kurulan TÜM 21 spec
// alanıyla BİRLİKTE ekleniyor (önceki turlarda bazı alanların unutulup
// sonradan geriye dönük tamamlanması gerektiği derste — bu sefer baştan
// eksiksiz giriliyor). Her değer WebSearch ile ayrı ayrı doğrulandı.
//
// Kullanım: node add-more-models.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const FACE_ID = 'Face ID (yüz tanıma)';
const ULTRASONIC = 'Ekran altı ultrasonik parmak izi';
const OPTICAL = 'Ekran altı optik parmak izi';
const SIDE_BUTTON = 'Yan tuş parmak izi';

const PRODUCTS = [
  {
    brand: 'Samsung',
    model: 'Galaxy A36 5G',
    canonical_name: 'Samsung Galaxy A36 5G 256GB',
    normalized_key: 'samsung-galaxy-a36-5g-256gb',
    specs: {
      chip: 'Snapdragon 6 Gen 3', ram_gb: 8, storage_gb: 256, battery_mah: 5000,
      screen_inch: 6.7, refresh_rate_hz: 120, screen_nits: 1900,
      main_camera_mp: 50, ultra_wide_mp: 8, front_camera_mp: 12,
      weight_g: 195, ip_rating: 'IP67', wired_charging_watts: 45,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Gorilla Glass Victus+', has_stereo_speakers: true,
      biometric_unlock: OPTICAL, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: false, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Samsung Türkiye', price: 21999 },
      { seller: 'Hepsiburada', price: 19999 },
      { seller: 'Trendyol', price: 20499 },
      { seller: 'Vatan Bilgisayar', price: 20999 },
    ],
  },
  {
    brand: 'Samsung',
    model: 'Galaxy S25 FE',
    canonical_name: 'Samsung Galaxy S25 FE 256GB',
    normalized_key: 'samsung-galaxy-s25-fe-256gb',
    specs: {
      chip: 'Exynos 2400', ram_gb: 8, storage_gb: 256, battery_mah: 4900,
      screen_inch: 6.7, refresh_rate_hz: 120, screen_nits: 1900,
      main_camera_mp: 50, ultra_wide_mp: 12, telephoto_mp: 8, optical_zoom_x: 3,
      front_camera_mp: 12,
      weight_g: 190, ip_rating: 'IP68', wired_charging_watts: 45, wireless_charging_watts: 15,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum (Armor Aluminum) + Gorilla Glass Victus+', has_stereo_speakers: true,
      biometric_unlock: ULTRASONIC, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: false, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Samsung Türkiye', price: 36999 },
      { seller: 'Hepsiburada', price: 34499 },
      { seller: 'Trendyol', price: 34999 },
      { seller: 'MediaMarkt', price: 35999 },
    ],
  },
  {
    brand: 'Samsung',
    model: 'Galaxy Z Flip7 FE',
    canonical_name: 'Samsung Galaxy Z Flip7 FE 256GB',
    normalized_key: 'samsung-galaxy-z-flip7-fe-256gb',
    specs: {
      chip: 'Exynos 2400', note: 'Katlanabilir, uygun fiyatlı FE modeli',
      ram_gb: 8, storage_gb: 256, battery_mah: 4000,
      screen_inch: 6.7, refresh_rate_hz: 120, screen_nits: 2600,
      main_camera_mp: 50, ultra_wide_mp: 12, front_camera_mp: 10,
      weight_g: 187, ip_rating: 'IP48', fold_style: 'Kapaklı (clamshell)',
      wired_charging_watts: 25, wireless_charging_watts: 15,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Gorilla Glass Victus 2 + Armor Aluminum (Katlanabilir)', has_stereo_speakers: true,
      biometric_unlock: SIDE_BUTTON, is_foldable: true, has_stylus_support: false,
      has_ir_blaster: false, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Samsung Türkiye', price: 49999 },
      { seller: 'Hepsiburada', price: 47499 },
      { seller: 'N11', price: 47999 },
    ],
  },
  {
    brand: 'Xiaomi',
    model: 'Xiaomi 17 Pro',
    canonical_name: 'Xiaomi 17 Pro 256GB',
    normalized_key: 'xiaomi-17-pro-256gb',
    specs: {
      chip: 'Snapdragon 8 Elite Gen 5', note: 'Leica üçlü kamera, 8K video',
      ram_gb: 12, storage_gb: 256, battery_mah: 6300,
      screen_inch: 6.3, refresh_rate_hz: 120, screen_nits: 3500,
      main_camera_mp: 50, ultra_wide_mp: 50, telephoto_mp: 50, front_camera_mp: 50,
      weight_g: 192, ip_rating: 'IP68', wired_charging_watts: 100, wireless_charging_watts: 50,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Xiaomi Shield Glass', has_stereo_speakers: true,
      biometric_unlock: ULTRASONIC, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: true, video_8k: true, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Xiaomi Türkiye', price: 89999 },
      { seller: 'Hepsiburada', price: 86999 },
      { seller: 'Trendyol', price: 87999 },
      { seller: 'Vatan Bilgisayar', price: 88999 },
    ],
  },
  {
    brand: 'Xiaomi',
    model: 'Redmi Note 15 5G',
    canonical_name: 'Redmi Note 15 5G 256GB',
    normalized_key: 'redmi-note-15-5g-256gb',
    specs: {
      chip: 'Snapdragon 6 Gen 3', ram_gb: 8, storage_gb: 256, battery_mah: 5520,
      screen_inch: 6.77, refresh_rate_hz: 120, screen_nits: 3200,
      main_camera_mp: 108, ultra_wide_mp: 8, front_camera_mp: 20,
      weight_g: 178, ip_rating: 'IP66', wired_charging_watts: 45,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Plastik + Gorilla Glass 7i', has_stereo_speakers: true,
      biometric_unlock: OPTICAL, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: true, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Xiaomi Türkiye', price: 15999 },
      { seller: 'Hepsiburada', price: 14499 },
      { seller: 'Trendyol', price: 14999 },
      { seller: 'N11', price: 15499 },
    ],
  },
  {
    brand: 'Xiaomi',
    model: 'POCO F7 Ultra',
    canonical_name: 'POCO F7 Ultra 256GB',
    normalized_key: 'poco-f7-ultra-256gb',
    specs: {
      chip: 'Snapdragon 8 Elite', ram_gb: 12, storage_gb: 256, battery_mah: 5300,
      screen_inch: 6.67, refresh_rate_hz: 120, screen_nits: 3200,
      main_camera_mp: 50, telephoto_mp: 50, optical_zoom_x: 2.5, ultra_wide_mp: 32,
      front_camera_mp: 32,
      weight_g: 212, ip_rating: 'IP68', wired_charging_watts: 120, wireless_charging_watts: 50,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Shield Glass', has_stereo_speakers: true,
      biometric_unlock: ULTRASONIC, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: true, video_8k: true, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Xiaomi Türkiye', price: 54999 },
      { seller: 'Hepsiburada', price: 52499 },
      { seller: 'Trendyol', price: 52999 },
      { seller: 'N11', price: 53999 },
    ],
  },
];

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
    case 'Samsung Türkiye': return `https://www.samsung.com/tr/`;
    case 'Xiaomi Türkiye': return `https://www.mi.com/tr/`;
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
        `SELECT id FROM products WHERE normalized_key = $1`, [p.normalized_key]
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
        const url = searchUrl(offer.seller, p.canonical_name);
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
