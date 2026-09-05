// backfill-round5-new-features.js — add-sony-honor-models.js ile eklenen
// üç yeni özellik (kulaklık girişi, microSD, fiziksel kamera düğmesi),
// MEVCUT 44 üründe hiç yoktu — "topladık ama hiç kullanmadık" ölü veri
// riskini önlemek için (bkz. refresh_rate_hz'in daha önce yaşadığı sorun)
// bu üçü de her ürüne AÇIK bir değer olarak (undefined değil) yazılıyor.
//
// has_headphone_jack / has_expandable_storage: kataloğun HİÇBİR mevcut
// ürününde yok — 3.5mm giriş ve microSD, bu segmentteki tüm amiral/orta
// segment Apple/Samsung/Xiaomi/Google/OnePlus modellerinden kaldırılmış
// durumda (sadece yeni eklenen Sony Xperia hattı koruyor).
//
// has_camera_button: Apple'ın "Kamera Kumanda" (Camera Control) dokunmatik
// düğmesi SADECE iPhone 16 nesliyle (2024) geldi ve 17 nesliyle (17,
// 17 Pro, 17 Pro Max, Air) devam ediyor — ama ucuz "e" modelinde (17e,
// tıpkı 16e'de olduğu gibi) YOK. 13/14/15 serisi ve diğer TÜM markalarda
// hiç yok. Bu yüzden tek bir "false" değeri TÜM Apple ürünlerine
// uygulanamaz — model bazında doğru işaretleniyor.
//
// Kullanım: node backfill-round5-new-features.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Kamera Kumanda düğmesi olan gerçek Apple modelleri (2024 iPhone 16
// nesliyle başladı, 17 nesliyle devam ediyor; 17e'de YOK).
const HAS_CAMERA_BUTTON_NAME_FRAGMENTS = [
  'iPhone 16 128GB', 'iPhone 16 Plus', 'iPhone 16 Pro',
  'iPhone 17 256GB', 'iPhone 17 Pro', 'iPhone Air',
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: products } = await client.query(
      `SELECT id, canonical_name FROM products`
    );

    for (const p of products) {
      const hasCameraButton = HAS_CAMERA_BUTTON_NAME_FRAGMENTS.some(f => p.canonical_name.includes(f));
      await client.query(
        `UPDATE products SET specs = specs || $1::jsonb WHERE id = $2`,
        [
          JSON.stringify({
            has_headphone_jack: false,
            has_expandable_storage: false,
            has_camera_button: hasCameraButton,
          }),
          p.id,
        ]
      );
      console.log(`${hasCameraButton ? '📷' : '  '} ${p.canonical_name}${hasCameraButton ? '  <- kamera düğmeli' : ''}`);
    }

    await client.query('COMMIT');
    console.log(`\n✔ ${products.length} ürün güncellendi.`);
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
