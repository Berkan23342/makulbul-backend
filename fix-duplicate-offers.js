// fix-duplicate-offers.js — Bir satıcının aynı ürün için birden fazla
// teklif satırına sahip olduğu (yanlışlıkla oluşmuş) durumları temizler
// ve bir daha oluşmasını engelleyen UNIQUE kısıtını ekler.
//
// Neden oluştu: match-product.js'teki finalizeMatch, aynı satıcı+ürün
// için tekrar /api/ingest-offer çağrıldığında eski satırı güncellemek
// yerine hep YENİ bir satır ekliyordu — bu da zamanla "en iyi fiyat"
// hesabını bozan (bayat/ucuz bir satır sonsuza kadar "en uygun" olarak
// kalabilir) ve aynı satıcıyı satıcı listesinde birden fazla farklı
// fiyatla gösteren satırlar biriktiriyordu. Bu script mükerrer
// satırları, geçmiş fiyat kayıtlarını (price_history) KAYBETMEDEN tek
// bir güncel satıra birleştirir, sonra bir daha olmasın diye UNIQUE
// (product_id, seller_id) kısıtı ekler.
//
// Kullanım: node fix-duplicate-offers.js [--dry-run]

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { rows: groups } = await pool.query(`
    SELECT product_id, seller_id, array_agg(id ORDER BY created_at DESC) AS offer_ids
    FROM offers
    GROUP BY product_id, seller_id
    HAVING COUNT(*) > 1
  `);

  console.log(`${groups.length} mükerrer (ürün, satıcı) çifti bulundu.\n`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const g of groups) {
      const [keepId, ...dropIds] = g.offer_ids;
      console.log(`Ürün ${g.product_id} / Satıcı ${g.seller_id}: ${keepId} (en güncel) tutuluyor, ${dropIds.join(', ')} siliniyor — fiyat geçmişleri ${keepId}'e taşınıyor.`);
      if (!dryRun) {
        await client.query(
          `UPDATE price_history SET offer_id = $1 WHERE offer_id = ANY($2::uuid[])`,
          [keepId, dropIds]
        );
        await client.query(`DELETE FROM offers WHERE id = ANY($1::uuid[])`, [dropIds]);
      }
    }

    if (!dryRun) {
      await client.query(
        `ALTER TABLE offers ADD CONSTRAINT offers_product_seller_unique UNIQUE (product_id, seller_id)`
      );
      console.log('\n✔ UNIQUE (product_id, seller_id) kısıtı eklendi — bundan sonra bu tür satırlar birikemez.');
    }

    await client.query('COMMIT');
    console.log(dryRun ? '\n[KURU ÇALIŞTIRMA — hiçbir şey değişmedi]' : '\nBitti.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('✘ Hata:', err.message);
  process.exit(1);
});
