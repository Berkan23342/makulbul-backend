// add-google-oneplus-models.js — Katalogda hiç bulunmayan İKİ YENİ MARKA
// (Google Pixel, OnePlus) ve 4 model ekler. Amaç sadece marka sayısını
// artırmak değil, GERÇEK dünyada var olan ve kataloğun mevcut özellik
// setinde henüz temsil edilmeyen kombinasyonları getirmek:
//  - Tensor G5: "amiral gemisi" olmasına rağmen ham CPU hızında (Geekbench
//    single-core) Snapdragon/Apple'ın gerisinde kalan gerçek bir çip —
//    "en güçlü model" sıralamasının ham donanım gücüne göre çalıştığını
//    daha zengin bir veri setiyle sınıyor.
//  - Pixel: 8K video KAYDEDEMİYOR (gerçek bir sınırlama, Pro dahil) — "8K
//    video" filtresinin doğru DIŞLAMA yaptığını test eden ilk örnek.
//  - OnePlus: IR Blaster (kızılötesi kumanda) markanın geleneksel bir
//    özelliği — bu özelliğin Xiaomi ekosistemi dışında da var olduğunu
//    gösteriyor.
//  - OnePlus 13 vs 13R: AYNI MARKA içinde kablosuz şarjın TAMAMEN
//    kaldırıldığı (13R) gerçek bir varyant farkı — "kablosuz şarj" soft
//    kriterinin aynı markadaki iki modeli doğru ayırt ettiğini test ediyor.
//  - Pixel'in uydu/acil durum mesajlaşması TR pazarında sunulmadığı için
//    satellite_connectivity=false olarak işaretlendi (ABD/Kanada'ya özel).
//
// Her değer, ilgili modelin gerçek (Ağustos 2025 / Ocak 2025 lansman)
// teknik özellikleriyle araştırılarak dolduruldu.
//
// Kullanım: node add-google-oneplus-models.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const OPTICAL = 'Ekran altı optik parmak izi';
const ULTRASONIC = 'Ekran altı ultrasonik parmak izi';

const NEW_BRANDS = [
  { name: 'Google', aliases: ['google', 'pixel'] },
  { name: 'OnePlus', aliases: ['oneplus', 'one plus', '1+'] },
];

const PRODUCTS = [
  {
    brand: 'Google',
    model: 'Pixel 10',
    canonical_name: 'Google Pixel 10 256GB',
    normalized_key: 'google-pixel-10-256gb',
    specs: {
      chip: 'Tensor G5', note: 'Google AI özellikleri (Gemini Nano) donanımda çalışıyor',
      ram_gb: 12, storage_gb: 256, battery_mah: 4970,
      screen_inch: 6.3, refresh_rate_hz: 120, screen_nits: 2800,
      main_camera_mp: 48, ultra_wide_mp: 13, front_camera_mp: 11,
      weight_g: 204, ip_rating: 'IP68', wired_charging_watts: 30, wireless_charging_watts: 15,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Gorilla Glass Victus 2', has_stereo_speakers: true,
      biometric_unlock: OPTICAL, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: false, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Hepsiburada', price: 52999 },
      { seller: 'Trendyol', price: 53499 },
      { seller: 'N11', price: 53999 },
      { seller: 'Vatan Bilgisayar', price: 53749 },
    ],
  },
  {
    brand: 'Google',
    model: 'Pixel 10 Pro',
    canonical_name: 'Google Pixel 10 Pro 256GB',
    normalized_key: 'google-pixel-10-pro-256gb',
    specs: {
      chip: 'Tensor G5', note: 'Telefoto lens ve en yüksek çözünürlüklü ön kamera Pro modelde',
      ram_gb: 16, storage_gb: 256, battery_mah: 4870,
      screen_inch: 6.3, refresh_rate_hz: 120, screen_nits: 3000,
      main_camera_mp: 50, ultra_wide_mp: 48, telephoto_mp: 48, optical_zoom_x: 5, front_camera_mp: 42,
      weight_g: 207, ip_rating: 'IP68', wired_charging_watts: 30, wireless_charging_watts: 23,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Gorilla Glass Victus 2', has_stereo_speakers: true,
      biometric_unlock: OPTICAL, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: false, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Hepsiburada', price: 78999 },
      { seller: 'Trendyol', price: 79999 },
      { seller: 'N11', price: 80999 },
      { seller: 'Vatan Bilgisayar', price: 79499 },
    ],
  },
  {
    brand: 'OnePlus',
    model: 'OnePlus 13',
    canonical_name: 'OnePlus 13 256GB',
    normalized_key: 'oneplus-13-256gb',
    specs: {
      chip: 'Snapdragon 8 Elite', note: 'Hasselblad kamera ayarı, IP68/IP69 dayanıklılık',
      ram_gb: 16, storage_gb: 256, battery_mah: 6000,
      screen_inch: 6.82, refresh_rate_hz: 120, screen_nits: 4500,
      main_camera_mp: 50, ultra_wide_mp: 50, telephoto_mp: 50, optical_zoom_x: 3, front_camera_mp: 32,
      weight_g: 210, ip_rating: 'IP68/IP69', wired_charging_watts: 100, wireless_charging_watts: 50,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Gorilla Glass Victus 2', has_stereo_speakers: true,
      biometric_unlock: ULTRASONIC, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: true, video_8k: true, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Hepsiburada', price: 57999 },
      { seller: 'Trendyol', price: 58999 },
      { seller: 'N11', price: 59499 },
      { seller: 'Vatan Bilgisayar', price: 58499 },
    ],
  },
  {
    brand: 'OnePlus',
    model: 'OnePlus 13R',
    canonical_name: 'OnePlus 13R 256GB',
    normalized_key: 'oneplus-13r-256gb',
    specs: {
      chip: 'Snapdragon 8 Gen 3', note: 'Kablosuz şarj desteklemiyor, bir önceki nesil amiral çip kullanıyor',
      ram_gb: 12, storage_gb: 256, battery_mah: 6000,
      screen_inch: 6.78, refresh_rate_hz: 120, screen_nits: 4500,
      main_camera_mp: 50, ultra_wide_mp: 8, front_camera_mp: 16,
      weight_g: 206, ip_rating: 'IP65', wired_charging_watts: 80,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Plastik + Gorilla Glass 5', has_stereo_speakers: true,
      biometric_unlock: OPTICAL, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: true, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
    },
    offers: [
      { seller: 'Hepsiburada', price: 34999 },
      { seller: 'Trendyol', price: 35499 },
      { seller: 'N11', price: 35999 },
      { seller: 'Vatan Bilgisayar', price: 35249 },
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
    default: return null;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const b of NEW_BRANDS) {
      await client.query(
        `INSERT INTO brands (name, aliases) VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [b.name, b.aliases]
      );
    }

    const { rows: [cat] } = await client.query(`SELECT id FROM categories WHERE slug='telefon'`);
    const { rows: brandRows } = await client.query(`SELECT id, name FROM brands`);
    const brandId = Object.fromEntries(brandRows.map(r => [r.name, r.id]));
    const { rows: sellerRows } = await client.query(`SELECT id, name FROM sellers`);
    const sellerId = Object.fromEntries(sellerRows.map(r => [r.name, r.id]));

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
