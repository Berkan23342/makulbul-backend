// backfill-specs-round2.js — "çok daha fazla veri lazım" isteği üzerine
// ikinci tur zenginleştirme: ekran parlaklığı (nits), gövde malzemesi ve
// stereo hoparlör bilgisi 18 üründe de yoktu (eski iPhone'larda vardı,
// yenilerinde hiç eklenmemişti). Ayrıca Redmi Note 15 Pro 5G'nin specs'inde
// çip adı "MediaTek Dimensity (Note 15 Pro 5G TR)" gibi anlamsız bir
// placeholder'dı — gerçek çip (Dimensity 7400-Ultra) ile değiştirildi,
// artık chip-tiers.js'deki gerçek puanla doğru eşleşiyor.
//
// Kaynak: Apple/Samsung/Xiaomi resmi sayfaları + GSMArena lab testleri
// (Eylül 2026 itibarıyla).
//
// Kullanım: node backfill-specs-round2.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const BACKFILL = {
  'Apple iPhone 17 256GB': {
    screen_nits: 3000, build_material: 'Alüminyum + Seramik Kalkan 2', has_stereo_speakers: true,
  },
  'Apple iPhone 17 Pro 256GB': {
    screen_nits: 3000, build_material: 'Alüminyum + Seramik Kalkan 2', has_stereo_speakers: true,
  },
  'Apple iPhone 17 Pro Max 256GB': {
    screen_nits: 3000, build_material: 'Alüminyum + Seramik Kalkan 2', has_stereo_speakers: true,
  },
  'Apple iPhone 17e 256GB': {
    screen_nits: 1200, build_material: 'Alüminyum + Seramik Kalkan', has_stereo_speakers: true,
  },
  'Apple iPhone Air 256GB': {
    screen_nits: 3000, build_material: 'Titanyum + Seramik Kalkan 2', has_stereo_speakers: true,
  },
  'Samsung Galaxy S26 256GB': {
    screen_nits: 2600, build_material: 'Alüminyum (Armor Aluminum 2) + Gorilla Glass Victus 2', has_stereo_speakers: true,
  },
  'Samsung Galaxy S26+ 256GB': {
    screen_nits: 2800, build_material: 'Alüminyum (Armor Aluminum 2) + Gorilla Glass Victus 2', has_stereo_speakers: true,
  },
  'Samsung Galaxy S26 Ultra 256GB': {
    screen_nits: 2600, build_material: 'Alüminyum (Armor Aluminum 3) + Gorilla Armor 2', has_stereo_speakers: true,
  },
  'Samsung Galaxy A56 5G 256GB': {
    screen_nits: 1900, build_material: 'Alüminyum + Gorilla Glass Victus+', has_stereo_speakers: true,
  },
  'Samsung Galaxy Z Fold7 512GB': {
    screen_nits: 2600, build_material: 'Armor Aluminum + Gorilla Glass Victus 2 (Katlanabilir)', has_stereo_speakers: true,
  },
  'Samsung Galaxy Z Flip7 256GB': {
    screen_nits: 2600, build_material: 'Armor Aluminum + Gorilla Glass Victus 2 (Katlanabilir)', has_stereo_speakers: true,
  },
  'POCO X7 Pro 256GB NFC': {
    screen_nits: 3200, build_material: 'Alüminyum + Gorilla Glass 7i', has_stereo_speakers: true,
  },
  'POCO F7 256GB NFC': {
    screen_nits: 3200, build_material: 'Alüminyum + Gorilla Glass', has_stereo_speakers: true,
  },
  'Redmi Note 15 Pro 5G 256GB NFC': {
    screen_nits: 3200, build_material: 'Plastik + Gorilla Glass Victus 2', has_stereo_speakers: true,
    chip: 'Dimensity 7400-Ultra', // eskiden anlamsız bir placeholder'dı
  },
  'Xiaomi 15T 256GB': {
    screen_nits: 3200, build_material: 'Alüminyum', has_stereo_speakers: true,
  },
  'Xiaomi 15T Pro 256GB': {
    screen_nits: 3200, build_material: 'Alüminyum', has_stereo_speakers: true,
  },
  'Xiaomi 17 256GB': {
    screen_nits: 3400, build_material: 'Alüminyum + Xiaomi Shield Glass', has_stereo_speakers: true,
  },
  'Xiaomi 17 Ultra 256GB': {
    screen_nits: 3674, build_material: 'Alüminyum + Xiaomi Shield Glass 3.0', has_stereo_speakers: true,
  },
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
