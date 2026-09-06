// add-offer-variants.js — offers tablosuna depolama kapasitesi (GB) ve
// renk sütunlarını ekler. Gerekçe: 31 üründeki fiyat araştırması,
// kataloğumuzdaki birçok "sabit kapasiteli" ürünün (ör. "iPhone 13 Pro
// Max 128GB") artık o TAM kapasitede sıfır satılmadığını, ama AYNI
// modelin FARKLI bir kapasitede (ör. 512GB) gerçekten satışta olduğunu
// ortaya çıkardı. Bu sütunlar, tek bir ürün satırının altında birden
// fazla gerçek (kapasite, renk, fiyat) kombinasyonunu temsil etmeyi
// sağlıyor — yeni bir tablo açmadan, mevcut offers/attachOffers
// mimarisini olduğu gibi koruyarak.
//
// storage_gb=0 / color='' = "ürünün kendi varsayılan speklerine göre,
// varyant belirtilmemiş" — mevcut tekliflerin göçürüleceği durum.
//
// Kullanım: node add-offer-variants.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingCols } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'offers' AND column_name IN ('storage_gb', 'color')`
    );
    if (existingCols.length === 2) {
      console.log('ATLA: storage_gb/color sütunları zaten var.');
      await client.query('ROLLBACK');
      return;
    }

    await client.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS storage_gb INTEGER NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE offers ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT ''`);
    console.log('✔ storage_gb ve color sütunları eklendi.');

    // Mevcut teklifleri ürünün kendi spec.storage_gb'sine göre doldur —
    // "varyant belirtilmemiş" (0) durumundan çıkarıp gerçek değerine
    // sabitliyoruz ki UNIQUE kısıt altında anlamlı kalsınlar.
    const { rowCount } = await client.query(`
      UPDATE offers o SET storage_gb = sub.storage_gb
      FROM (
        SELECT p.id AS product_id, COALESCE((p.specs->>'storage_gb')::int, 0) AS storage_gb
        FROM products p
      ) sub
      WHERE o.product_id = sub.product_id AND o.storage_gb = 0
    `);
    console.log(`✔ ${rowCount} mevcut teklif kendi ürününün spec.storage_gb'sine göre dolduruldu.`);

    await client.query(`ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_product_seller_unique`);
    await client.query(`ALTER TABLE offers ADD CONSTRAINT offers_product_seller_variant_unique UNIQUE (product_id, seller_id, storage_gb, color)`);
    console.log('✔ UNIQUE kısıt (product_id, seller_id, storage_gb, color) olarak güncellendi.');

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
