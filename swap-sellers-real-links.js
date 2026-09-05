// swap-sellers-real-links.js — Bazı tekliflerde satıcı o modeli gerçekte
// satmıyordu (arama sonucu boştu), bu yüzden o teklifi GERÇEKTEN o modeli
// satan başka bir satıcıya taşıyoruz (seller_id + product_url + price
// güncellenir). Her satır için hedef satıcının o üründe zaten teklifi
// olmadığı doğrulandı (UNIQUE(product_id, seller_id) ihlali yok).
//
// Kullanım: node swap-sellers-real-links.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const SWAPS = [
  {
    canonicalName: 'Apple iPhone 13 mini 128GB',
    fromSeller: 'Trendyol',
    toSeller: 'Hepsiburada',
    url: 'https://www.hepsiburada.com/yenilenmis-apple-iphone-13-mini-128-gb-12-ay-garantili-b-grade-p-HBCV00003IZ1P2',
    price: 23999,
  },
  {
    canonicalName: 'POCO X7 Pro 256GB NFC',
    fromSeller: 'MediaMarkt',
    toSeller: 'N11',
    url: 'https://www.n11.com/urun/poco-x7-pro-8-gb-256-gb-xiaomi-turkiye-garantili-65952031',
    price: 31200,
  },
  {
    canonicalName: 'Apple iPhone 14 Plus 128GB',
    fromSeller: 'Trendyol',
    toSeller: 'MediaMarkt',
    url: 'https://www.mediamarkt.com.tr/tr/product/_apple-yenilenmis-g2-iphone-14-plus-128-gb-akilli-telefon-mor-1244690.html',
    price: 56999,
  },
  {
    canonicalName: 'Apple iPhone 15 Plus 128GB',
    fromSeller: 'Trendyol',
    toSeller: 'MediaMarkt',
    url: 'https://www.mediamarkt.com.tr/tr/product/_apple-yenilenmis-g1-iphone-15-plus-128-gb-akilli-telefon-mavi-1243577.html',
    price: 56999,
  },
  {
    canonicalName: 'Apple iPhone 16 Plus 128GB',
    fromSeller: 'Trendyol',
    toSeller: 'MediaMarkt',
    url: 'https://www.mediamarkt.com.tr/tr/product/_apple-iphone-16-plus-128gb-akilli-telefon-siyah-mxvu3tua-1239597.html',
    price: 73549,
  },
  {
    canonicalName: 'Apple iPhone 17e 256GB',
    fromSeller: 'Trendyol',
    toSeller: 'MediaMarkt',
    url: 'https://www.mediamarkt.com.tr/tr/product/_apple-mhrw4tua-iphone-17e-256gb-akilli-telefon-beyaz-1252722.html',
    price: 57999,
  },
  {
    canonicalName: 'Apple iPhone 13 Pro Max 128GB',
    fromSeller: 'Vatan Bilgisayar',
    toSeller: 'MediaMarkt',
    url: 'https://www.mediamarkt.com.tr/tr/product/_apple-yenilenmis-g2-iphone-13-pro-max-128-gb-akilli-telefon-yesil-1233565.html',
    price: 49999,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const s of SWAPS) {
      const { rows: [toSeller] } = await client.query('SELECT id FROM sellers WHERE name = $1', [s.toSeller]);
      if (!toSeller) throw new Error(`Bilinmeyen hedef satıcı: ${s.toSeller}`);

      const { rows } = await client.query(
        `UPDATE offers o
         SET seller_id = $1, product_url = $2, affiliate_url = $2, price = $3
         FROM products p, sellers s
         WHERE o.product_id = p.id AND o.seller_id = s.id
           AND p.canonical_name = $4 AND s.name = $5
         RETURNING o.id`,
        [toSeller.id, s.url, s.price, s.canonicalName, s.fromSeller]
      );
      if (rows.length) {
        console.log(`✔ ${s.canonicalName}: ${s.fromSeller} → ${s.toSeller}`);
      } else {
        console.log(`⚠ Eşleşme yok: ${s.canonicalName} @ ${s.fromSeller}`);
      }
    }

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
