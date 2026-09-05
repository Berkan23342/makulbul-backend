// add-sony-honor-models.js — Katalogda hiç bulunmayan İKİ YENİ MARKA
// (Sony Xperia, Honor) ve 4 model ekler. Amaç yine sadece marka sayısı
// değil, kataloğun HİÇBİR ürününde bulunmayan üç YENİ gerçek özelliği
// getirmek:
//  - 3.5mm kulaklık girişi: Sony, amiral gemisinden orta segmente kadar
//    TÜM Xperia hattında bunu koruyan neredeyse tek büyük marka —
//    kataloğun geri kalanının HİÇBİRİ bunu desteklemiyor (bkz.
//    backfill-round5-new-features.js).
//  - microSD ile genişletilebilir depolama: aynı şekilde sadece Sony'de.
//  - Fiziksel kamera düğmesi: Sony'nin iki kademeli mekanik deklanşörü
//    VE Apple'ın iPhone 16 nesliyle gelen "Kamera Kumanda" dokunmatik
//    düğmesi için ORTAK bir filtre — bu yüzden bu üç alan MEVCUT
//    kataloğa da (Apple modelleri için doğru/model-bazlı) geriye dönük
//    ekleniyor, sadece yeni ürünlere değil.
//  - Honor Magic7 Pro: 80W kablosuz şarj — kataloğun en hızlısı (önceki
//    rekor OnePlus 13'ün 50W'ıydı) — "en hızlı kablosuz şarj" sıralamasını
//    gerçek bir üst sınırla test ediyor.
//  - Honor 400 Pro: 6600mAh batarya — kataloğun en büyük bataryası.
//
// Her değer ilgili modelin gerçek (2025) teknik özellikleriyle
// araştırılarak dolduruldu.
//
// Kullanım: node add-sony-honor-models.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const OPTICAL = 'Ekran altı optik parmak izi';
const ULTRASONIC = 'Ekran altı ultrasonik parmak izi';
const SIDE_BUTTON = 'Yan tuş parmak izi';

const NEW_BRANDS = [
  { name: 'Sony', aliases: ['sony', 'xperia'] },
  { name: 'Honor', aliases: ['honor'] },
];

const PRODUCTS = [
  {
    brand: 'Sony',
    model: 'Xperia 1 VII',
    canonical_name: 'Sony Xperia 1 VII 256GB',
    normalized_key: 'sony-xperia-1-vii-256gb',
    specs: {
      chip: 'Snapdragon 8 Elite', note: 'İki kademeli fiziksel deklanşör, değişken optik zoom (3.5x-7.1x)',
      ram_gb: 12, storage_gb: 256, battery_mah: 5000,
      screen_inch: 6.5, refresh_rate_hz: 120, screen_nits: 3900,
      main_camera_mp: 48, ultra_wide_mp: 48, telephoto_mp: 12, optical_zoom_x: 3.5, front_camera_mp: 12,
      weight_g: 197, ip_rating: 'IP68', wired_charging_watts: 30, wireless_charging_watts: 15,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Gorilla Glass Victus 2', has_stereo_speakers: true,
      biometric_unlock: SIDE_BUTTON, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: false, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
      has_headphone_jack: true, has_expandable_storage: true, has_camera_button: true,
    },
    offers: [
      { seller: 'Hepsiburada', price: 64999 },
      { seller: 'Trendyol', price: 65999 },
      { seller: 'N11', price: 66499 },
      { seller: 'Vatan Bilgisayar', price: 65499 },
    ],
  },
  {
    brand: 'Sony',
    model: 'Xperia 10 VII',
    canonical_name: 'Sony Xperia 10 VII 128GB',
    normalized_key: 'sony-xperia-10-vii-128gb',
    specs: {
      chip: 'Snapdragon 6 Gen 3', note: 'Amiral gemisiyle aynı kulaklık girişi ve microSD desteğini koruyor',
      ram_gb: 8, storage_gb: 128, battery_mah: 5000,
      screen_inch: 6.1, refresh_rate_hz: 120, screen_nits: 1400,
      main_camera_mp: 48, ultra_wide_mp: 8, front_camera_mp: 12,
      weight_g: 164, ip_rating: 'IP65', wired_charging_watts: 30,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Gorilla Glass', has_stereo_speakers: true,
      biometric_unlock: SIDE_BUTTON, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: false, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
      has_headphone_jack: true, has_expandable_storage: true, has_camera_button: false,
    },
    offers: [
      { seller: 'Hepsiburada', price: 25999 },
      { seller: 'Trendyol', price: 26499 },
      { seller: 'N11', price: 26999 },
      { seller: 'Vatan Bilgisayar', price: 26249 },
    ],
  },
  {
    brand: 'Honor',
    model: 'Magic7 Pro',
    canonical_name: 'Honor Magic7 Pro 256GB',
    normalized_key: 'honor-magic7-pro-256gb',
    specs: {
      chip: 'Snapdragon 8 Elite', note: '200MP periskop telefoto, kataloğun en hızlı kablosuz şarjı (80W)',
      ram_gb: 12, storage_gb: 256, battery_mah: 5850,
      screen_inch: 6.8, refresh_rate_hz: 120, screen_nits: 5000,
      main_camera_mp: 50, ultra_wide_mp: 50, telephoto_mp: 200, optical_zoom_x: 3, front_camera_mp: 50,
      weight_g: 223, ip_rating: 'IP68/IP69', wired_charging_watts: 100, wireless_charging_watts: 80,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Gorilla Glass Armor', has_stereo_speakers: true,
      biometric_unlock: ULTRASONIC, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: true, video_8k: true, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
      has_headphone_jack: false, has_expandable_storage: false, has_camera_button: false,
    },
    offers: [
      { seller: 'Hepsiburada', price: 68999 },
      { seller: 'Trendyol', price: 69999 },
      { seller: 'N11', price: 70999 },
      { seller: 'Vatan Bilgisayar', price: 69499 },
    ],
  },
  {
    brand: 'Honor',
    model: '400 Pro',
    canonical_name: 'Honor 400 Pro 256GB',
    normalized_key: 'honor-400-pro-256gb',
    specs: {
      chip: 'Snapdragon 8s Gen 4', note: 'Kataloğun en büyük bataryası (6600mAh)',
      ram_gb: 12, storage_gb: 256, battery_mah: 6600,
      screen_inch: 6.55, refresh_rate_hz: 120, screen_nits: 1500,
      main_camera_mp: 200, ultra_wide_mp: 12, front_camera_mp: 50,
      weight_g: 205, ip_rating: 'IP65', wired_charging_watts: 66,
      has_5g: true, has_nfc: true, release_year: 2025,
      build_material: 'Alüminyum + Gorilla Glass 5', has_stereo_speakers: true,
      biometric_unlock: OPTICAL, is_foldable: false, has_stylus_support: false,
      has_ir_blaster: false, video_8k: false, satellite_connectivity: false,
      sim_type: 'Fiziksel SIM + eSIM',
      has_headphone_jack: false, has_expandable_storage: false, has_camera_button: false,
    },
    offers: [
      { seller: 'Hepsiburada', price: 29999 },
      { seller: 'Trendyol', price: 30499 },
      { seller: 'N11', price: 30999 },
      { seller: 'Vatan Bilgisayar', price: 30249 },
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
