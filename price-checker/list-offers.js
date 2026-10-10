// price-checker/list-offers.js — Hepsiburada/Trendyol tekliflerini, en son
// ne zaman kontrol edildiğine göre sıralı listeler. Bu liste, gerçek
// tarayıcı ile TEK TEK gezip fiyat okuma turunun ("ben tetikleyeyim" modeli)
// hangi tekliflerle başlayacağını belirlemek için kullanılıyor.
//
// Kullanım:
//   node price-checker/list-offers.js --seller=Hepsiburada
//   node price-checker/list-offers.js --seller=Trendyol --limit=10
//   node price-checker/list-offers.js --seller=Hepsiburada --stale-hours=24  (son 24 saattir kontrol edilmemiş olanlar)

require('dotenv').config();
const { Pool } = require('pg');

const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const seller = args.seller;
  if (!seller || !['Hepsiburada', 'Trendyol'].includes(seller)) {
    console.error('Kullanım: node price-checker/list-offers.js --seller=Hepsiburada|Trendyol [--limit=N] [--stale-hours=N]');
    process.exit(1);
  }
  const limit = args.limit ? Number(args.limit) : null;
  const staleHours = args['stale-hours'] ? Number(args['stale-hours']) : null;

  const { rows } = await pool.query(
    `SELECT o.id, p.canonical_name, o.storage_gb, o.color, o.price, o.product_url, o.last_checked_at
     FROM offers o
     JOIN sellers s ON s.id = o.seller_id
     JOIN products p ON p.id = o.product_id
     WHERE s.name = $1
       ${staleHours ? `AND (o.last_checked_at IS NULL OR o.last_checked_at < now() - interval '${staleHours} hours')` : ''}
     ORDER BY o.last_checked_at ASC NULLS FIRST
     ${limit ? `LIMIT ${limit}` : ''}`,
    [seller]
  );

  console.log(`\n=== ${seller} — kontrol sırası (${rows.length} teklif) ===\n`);
  for (const r of rows) {
    console.log(`[${r.id}] ${r.canonical_name} (${r.storage_gb}GB ${r.color || '-'}) — kayıtlı: ${Number(r.price).toFixed(2)} TL`);
    console.log(`   ${r.product_url}`);
    console.log(`   son kontrol: ${r.last_checked_at || 'hiç kontrol edilmemiş'}\n`);
  }
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
