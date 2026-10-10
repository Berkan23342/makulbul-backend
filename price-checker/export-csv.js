// price-checker/export-csv.js — bir satıcının tekliflerini, doldurulabilir bir
// CSV'ye döker (en uzun süredir kontrol edilmeyen önce). Bu dosyada
// new_price / new_in_stock sütunlarını GERÇEK sayfada gördüğün değerlerle
// doldurup csv-to-sql.js ile production'a uygulanacak SQL'e çevirirsin.
//
// Kullanım:
//   node price-checker/export-csv.js --seller="Amazon TR" --out=guncelle.csv
//   node price-checker/export-csv.js --seller="Amazon TR" --stale-hours=48 --limit=40 --out=guncelle.csv
// Hangi veritabanını okuyacağı DATABASE_URL'dir (.env veya ortam değişkeni).
// Production'ı okumak için: DATABASE_URL="..." DB_SSL=true node price-checker/export-csv.js ...

require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const { toCsv } = require('./csv');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const seller = args.seller || 'Amazon TR';
const out = args.out || 'guncelle.csv';
const staleHours = args['stale-hours'] ? Number(args['stale-hours']) : null;
const limit = args.limit ? Number(args.limit) : null;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false });

(async () => {
  const params = [seller];
  let sql = `SELECT p.normalized_key, p.canonical_name, o.storage_gb, COALESCE(o.color,'') AS color,
                    o.price, o.in_stock, o.product_url, o.last_checked_at
             FROM offers o JOIN sellers s ON s.id = o.seller_id JOIN products p ON p.id = o.product_id
             WHERE s.name = $1`;
  if (staleHours) sql += ` AND (o.last_checked_at IS NULL OR o.last_checked_at < now() - interval '${Math.floor(staleHours)} hours')`;
  sql += ' ORDER BY o.last_checked_at ASC NULLS FIRST';
  if (limit) sql += ` LIMIT ${Math.floor(limit)}`;
  const { rows } = await pool.query(sql, params);
  const header = ['normalized_key', 'storage_gb', 'color', 'ad', 'mevcut_fiyat', 'mevcut_stok', 'url', 'son_kontrol', 'new_price', 'new_in_stock'];
  const data = rows.map(r => ({
    normalized_key: r.normalized_key, storage_gb: r.storage_gb, color: r.color, ad: r.canonical_name,
    mevcut_fiyat: Number(r.price), mevcut_stok: r.in_stock, url: r.product_url,
    son_kontrol: r.last_checked_at ? new Date(r.last_checked_at).toISOString().slice(0, 10) : 'hiç', new_price: '', new_in_stock: '',
  }));
  fs.writeFileSync(out, toCsv(header, data));
  console.log(`✔ ${data.length} teklif → ${out}`);
  console.log('  Sonraki adım: new_price (fiyat; stok durumu değişmeyecekse boş bırak) ve new_in_stock (true/false) sütunlarını doldur,');
  console.log(`  sonra: node price-checker/csv-to-sql.js ${out} --out=guncelle.sql`);
  await pool.end();
})().catch(e => { console.error('✘', e.message); process.exit(1); });
