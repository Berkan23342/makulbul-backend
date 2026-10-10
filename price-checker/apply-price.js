// price-checker/apply-price.js — gerçek tarayıcıda okunup GÖZLE doğrulanmış
// bir fiyatı tek bir teklif satırına uygular (offers.price + last_checked_at
// + price_history). check-prices.js'teki (PA-API) ile AYNI DB-yazma
// mantığını kullanıyor, sadece fiyatın kaynağı otomatik API değil, o an
// gerçek Chrome'da görülen değer.
//
// Kullanım:
//   node price-checker/apply-price.js <offer_id> <yeni_fiyat>
//   node price-checker/apply-price.js <offer_id> <yeni_fiyat> --dry-run

require('dotenv').config();
const { Pool } = require('pg');

const [offerId, priceArg, ...rest] = process.argv.slice(2);
const DRY_RUN = rest.includes('--dry-run');

if (!offerId || !priceArg) {
  console.error('Kullanım: node price-checker/apply-price.js <offer_id> <yeni_fiyat> [--dry-run]');
  process.exit(1);
}
const newPrice = Number(priceArg);
if (!Number.isFinite(newPrice) || newPrice <= 0) {
  console.error('Geçersiz fiyat:', priceArg);
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const { rows } = await pool.query(
    `SELECT o.price AS current_price, p.canonical_name, o.storage_gb, o.color, s.name AS seller
     FROM offers o
     JOIN products p ON p.id = o.product_id
     JOIN sellers s ON s.id = o.seller_id
     WHERE o.id = $1`,
    [offerId]
  );
  if (rows.length === 0) {
    console.error(`✘ Teklif bulunamadı: ${offerId}`);
    process.exit(1);
  }
  const { current_price, canonical_name, storage_gb, color, seller } = rows[0];
  const oldPrice = Number(current_price);
  const label = `${canonical_name} (${storage_gb}GB ${color || '-'}) — ${seller}`;

  if (Math.abs(newPrice - oldPrice) < 0.01) {
    console.log(`= ${label}: değişmedi (${oldPrice.toFixed(2)} TL) — yine de "kontrol edildi" olarak işaretleniyor`);
  } else {
    const arrow = newPrice > oldPrice ? '↑' : '↓';
    console.log(`${arrow} ${label}: ${oldPrice.toFixed(2)} TL → ${newPrice.toFixed(2)} TL`);
  }

  if (!DRY_RUN) {
    await pool.query(`UPDATE offers SET price = $1, last_checked_at = now() WHERE id = $2`, [newPrice, offerId]);
    await pool.query(`INSERT INTO price_history (offer_id, price) VALUES ($1, $2)`, [offerId, newPrice]);
    console.log('  ✔ DB güncellendi (lokal).');
  } else {
    console.log('  (dry-run — hiçbir şey yazılmadı)');
  }
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
