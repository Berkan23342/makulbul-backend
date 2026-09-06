// test-match.js — Eşleştirme motorunu gerçek veritabanına karşı test eder.
// Çalıştır: node test-match.js
//
// Bu, sohbette gösterdiğimiz "Trendyol'dan / Hepsiburada'dan farklı isimli
// aynı ürün" senaryosunu gerçekten veritabanına karşı çalıştırır.
//
// GÜVENLİ: Tüm testler TEK BİR TRANSACTION içinde çalışır ve sonunda
// ROLLBACK edilir — veritabanına HİÇBİR KALICI DEĞİŞİKLİK YAZILMAZ.
// (Önceden bu script sahte bir "https://example.com/test" URL'sini
// gerçek offers tablosuna kalıcı olarak yazıyordu — hatta offers artık
// ON CONFLICT ile "upsert" yaptığı için, aynı satıcı+ürün için zaten var
// olan GERÇEK bir teklifin üzerine bile yazabiliyordu. Bu, canlıya
// alındıktan sonra biri "bir şeyi test edeyim" diye bu scripti çalıştırsa
// gerçek kullanıcı verisini bozardı — ROLLBACK ile bu artık imkansız.)

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
  console.log('--- Eşleştirme testi başlıyor (sonunda ROLLBACK edilecek, kalıcı yazma yok) ---\n');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const test of TEST_CASES) {
      const { rows: sellerRows } = await client.query(
        'SELECT id, website_domain FROM sellers WHERE name = $1', [test.sellerName]
      );
      if (sellerRows.length === 0) {
        console.log(`✘ Satıcı bulunamadı: ${test.sellerName} (sellers-seed atlandı mı?)\n`);
        continue;
      }

      // matchProduct artık productUrl'in GERÇEKTEN satıcının kendi
      // alan adına ait olmasını istiyor (bkz. match-product.js'teki
      // urlMatchesSellerDomain) — düz "example.com" artık reddedilir,
      // o yüzden test URL'i her satıcının kendi domain'i altında kuruluyor.
      const result = await matchProduct(client, {
        rawTitle: test.rawTitle,
        sellerId: sellerRows[0].id,
        price: test.price,
        productUrl: `https://${sellerRows[0].website_domain}/makulbul-test-match-script`,
      });

      console.log(`Ham başlık : "${test.rawTitle}"`);
      console.log(`Satıcı     : ${test.sellerName}`);
      console.log(`Sonuç      :`, result);
      console.log('---');
    }

    await client.query('ROLLBACK');
    console.log('\n✔ Test bitti. Yukarıdaki sonuçlar doğru ama ROLLBACK edildiği için veritabanında hiçbir iz kalmadı.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Hata:', err);
  process.exit(1);
});
