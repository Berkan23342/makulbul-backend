// backfill-legacy-brightness.js — 13/14/15/16 serisi iPhone'larda
// build_material ve has_stereo_speakers zaten vardı ama screen_nits hiç
// yoktu (bu alan ilk kez bu oturumda tanıtıldı). Apple'ın resmi teknik
// özellik sayfalarındaki jenerasyon bazlı tepe parlaklık (outdoor/HDR
// peak) değerleriyle dolduruyor.
//
// Kullanım: node backfill-legacy-brightness.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const BACKFILL = {
  // 13/14 ailesi: henüz "outdoor peak" kategorisi yoktu, sadece HDR peak
  'Apple iPhone 13 128GB': { screen_nits: 1200 },
  'Apple iPhone 13 mini 128GB': { screen_nits: 1200 },
  'Apple iPhone 13 Pro 128GB': { screen_nits: 1200 },
  'Apple iPhone 13 Pro Max 128GB': { screen_nits: 1200 },
  'Apple iPhone 14 128GB': { screen_nits: 1200 },
  'Apple iPhone 14 Plus 128GB': { screen_nits: 1200 },
  // 14 Pro'dan itibaren Apple "2000 nit outdoor peak" spesifikasyonunu
  // tanıttı, 15 serisiyle taban modellere de yayıldı — 16 serisine kadar sabit
  'Apple iPhone 14 Pro 128GB': { screen_nits: 2000 },
  'Apple iPhone 14 Pro Max 128GB': { screen_nits: 2000 },
  'Apple iPhone 15 128GB': { screen_nits: 2000 },
  'Apple iPhone 15 Plus 128GB': { screen_nits: 2000 },
  'Apple iPhone 15 Pro 128GB': { screen_nits: 2000 },
  'Apple iPhone 15 Pro Max 256GB': { screen_nits: 2000 },
  'Apple iPhone 16 128GB': { screen_nits: 2000 },
  'Apple iPhone 16 Plus 128GB': { screen_nits: 2000 },
  'Apple iPhone 16 Pro 128GB': { screen_nits: 2000 },
  'Apple iPhone 16 Pro Max 256GB': { screen_nits: 2000 },
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;

    for (const [canonicalName, fields] of Object.entries(BACKFILL)) {
      const { rows } = await client.query(
        `UPDATE products SET specs = specs || $1::jsonb
         WHERE canonical_name = $2
         RETURNING id`,
        [JSON.stringify(fields), canonicalName]
      );
      if (rows.length) {
        updated++;
        console.log(`✔ ${canonicalName}`);
      } else {
        console.log(`⚠ Eşleşme yok: ${canonicalName}`);
      }
    }

    await client.query('COMMIT');
    console.log(`\n✔ Tamamlandı. ${updated}/${Object.keys(BACKFILL).length} ürün güncellendi.`);
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
