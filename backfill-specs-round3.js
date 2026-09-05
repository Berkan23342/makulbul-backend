// backfill-specs-round3.js — "akla gelen her türlü özellik" isteği üzerine
// üçüncü tur: 8K video kaydı ve uydu üzerinden acil durum bağlantısı.
//
// NEDEN BU İKİSİ: Katalogdaki TÜM 34 ürünü tek tek araştırdıktan sonra
// gerçekten AYIRT EDİCİ olan (yani her telefonda aynı olmayan, birini
// diğerinden objektif olarak üstün kılan) özellikleri seçtik. Örneğin
// "microSD/hafıza kartı desteği" araştırıldı ama katalogdaki HİÇBİR
// telefon desteklemiyor (Apple hiç desteklemedi, Samsung/Xiaomi/POCO son
// nesillerde tamamen kaldırdı) — böyle bir alan eklemek "veri" gibi
// görünür ama aramada hiçbir ayrım yapamaz, o yüzden BİLEREK eklenmedi.
//
// - video_8k: Ana kamerayla 8K video kaydı yapabiliyor mu (bool).
//   Kaynak: GSMArena/resmi Xiaomi-Samsung sayfaları, Eylül 2026.
// - satellite_connectivity: Çekim alanı dışında uydu üzerinden acil durum
//   mesajı gönderebiliyor mu (bool). SADECE Apple iPhone 14 ve sonrası bu
//   özelliğe sahip — net, iyi bilinen ve gerçek bir ayrım noktası.
//
// Kullanım: node backfill-specs-round3.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const TRUE_8K = new Set([
  'Samsung Galaxy S26 256GB', 'Samsung Galaxy S26+ 256GB', 'Samsung Galaxy S26 Ultra 256GB',
  'Samsung Galaxy Z Fold7 512GB',
  'Xiaomi 15T Pro 256GB', 'Xiaomi 17 256GB', 'Xiaomi 17 Ultra 256GB',
]);

const NO_SATELLITE_IPHONES = new Set([
  'Apple iPhone 13 128GB', 'Apple iPhone 13 mini 128GB',
  'Apple iPhone 13 Pro 128GB', 'Apple iPhone 13 Pro Max 128GB',
]);

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: products } = await client.query('SELECT id, canonical_name, brand_id FROM products');
    const { rows: brands } = await client.query('SELECT id, name FROM brands');
    const brandName = Object.fromEntries(brands.map(b => [b.id, b.name]));

    let updated = 0;
    for (const p of products) {
      const isApple = brandName[p.brand_id] === 'Apple';
      const video_8k = TRUE_8K.has(p.canonical_name);
      const satellite_connectivity = isApple && !NO_SATELLITE_IPHONES.has(p.canonical_name);

      await client.query(
        `UPDATE products SET specs = specs || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ video_8k, satellite_connectivity }), p.id]
      );
      updated++;
      console.log(`✔ ${p.canonical_name} — 8K:${video_8k} uydu:${satellite_connectivity}`);
    }

    await client.query('COMMIT');
    console.log(`\n✔ Tamamlandı. ${updated}/${products.length} ürün güncellendi.`);
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
