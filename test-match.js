// test-match.js — Eşleştirme motorunu gerçek veritabanına karşı test eder.
// Çalıştır: node test-match.js
//
// Bu, sohbette gösterdiğimiz "Trendyol'dan / Hepsiburada'dan farklı isimli
// aynı ürün" senaryosunu gerçekten veritabanına karşı çalıştırır.

require('dotenv').config();
const { Pool } = require('pg');
const { matchProduct } = require('./match-product');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Test için örnek satıcı isimleri (sellers tablosunda gerçekten var olmalı)
const TEST_CASES = [
  { sellerName: 'Trendyol', rawTitle: 'Apple iPhone 17 256 GB Mavi Cep Telefonu', price: 84500 },
  { sellerName: 'Hepsiburada', rawTitle: 'iPhone 17 256GB Blue (Apple Türkiye Garantili)', price: 85200 },
  { sellerName: 'N11', rawTitle: 'Samsung Galaxy S26 Ultra 256 GB Titanyum Gri', price: 109000 },
  { sellerName: 'Trendyol', rawTitle: 'Tamamen alakasız bir ürün adı xyz123', price: 999 },
];

async function main() {
  console.log('--- Eşleştirme testi başlıyor ---\n');

  for (const test of TEST_CASES) {
    const { rows: sellerRows } = await pool.query(
      'SELECT id FROM sellers WHERE name = $1', [test.sellerName]
    );
    if (sellerRows.length === 0) {
      console.log(`✘ Satıcı bulunamadı: ${test.sellerName} (sellers-seed atlandı mı?)\n`);
      continue;
    }

    const result = await matchProduct(pool, {
      rawTitle: test.rawTitle,
      sellerId: sellerRows[0].id,
      price: test.price,
      productUrl: 'https://example.com/test',
    });

    console.log(`Ham başlık : "${test.rawTitle}"`);
    console.log(`Satıcı     : ${test.sellerName}`);
    console.log(`Sonuç      :`, result);
    console.log('---');
  }

  await pool.end();
}

main().catch(err => {
  console.error('Hata:', err);
  process.exit(1);
});
