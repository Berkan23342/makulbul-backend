// backfill-colors.js — her ürüne GERÇEK (resmi lansman) renk seçeneklerini
// ekler. Her liste ilgili markanın kendi resmi/haber kaynaklarından
// (Apple, Samsung, Google, Honor, OnePlus, Sony, Xiaomi resmi siteleri +
// GSMArena/PhoneArena gibi güvenilir teknoloji siteleri) doğrulandı.
//
// NOT: OnePlus 13'te sadece "Kara Karanlık" (Black Eclipse) rengi var —
// diğer iki renk (Midnight Ocean, Arctic Dawn) sadece 16GB/512GB
// varyantında satılıyor, kataloğumuzdaki 12GB/256GB varyantında değil.
//
// Kullanım: node backfill-colors.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const COLORS = {
  'Apple iPhone 13 128GB': ['Pembe', 'Mavi', 'Gece Yarısı', 'Yıldız Işığı', '(PRODUCT)RED'],
  'Apple iPhone 13 Pro 128GB': ['Grafit', 'Altın', 'Gümüş', 'Sierra Mavisi'],
  'Apple iPhone 13 Pro Max 128GB': ['Grafit', 'Altın', 'Gümüş', 'Sierra Mavisi'],
  'Apple iPhone 13 mini 128GB': ['Pembe', 'Mavi', 'Gece Yarısı', 'Yıldız Işığı', '(PRODUCT)RED'],
  'Apple iPhone 14 128GB': ['Mavi', 'Mor', 'Gece Yarısı', 'Yıldız Işığı', '(PRODUCT)RED'],
  'Apple iPhone 14 Plus 128GB': ['Mavi', 'Mor', 'Gece Yarısı', 'Yıldız Işığı', '(PRODUCT)RED'],
  'Apple iPhone 14 Pro 128GB': ['Uzay Siyahı', 'Gümüş', 'Altın', 'Derin Mor'],
  'Apple iPhone 14 Pro Max 128GB': ['Uzay Siyahı', 'Gümüş', 'Altın', 'Derin Mor'],
  'Apple iPhone 15 128GB': ['Pembe', 'Sarı', 'Yeşil', 'Mavi', 'Siyah'],
  'Apple iPhone 15 Plus 128GB': ['Pembe', 'Sarı', 'Yeşil', 'Mavi', 'Siyah'],
  'Apple iPhone 15 Pro 128GB': ['Siyah Titanyum', 'Beyaz Titanyum', 'Mavi Titanyum', 'Doğal Titanyum'],
  'Apple iPhone 15 Pro Max 256GB': ['Siyah Titanyum', 'Beyaz Titanyum', 'Mavi Titanyum', 'Doğal Titanyum'],
  'Apple iPhone 16 128GB': ['Ultramarin', 'Deniz Mavisi', 'Pembe', 'Beyaz', 'Siyah'],
  'Apple iPhone 16 Plus 128GB': ['Ultramarin', 'Deniz Mavisi', 'Pembe', 'Beyaz', 'Siyah'],
  'Apple iPhone 16 Pro 128GB': ['Siyah Titanyum', 'Beyaz Titanyum', 'Doğal Titanyum', 'Çöl Titanyumu'],
  'Apple iPhone 16 Pro Max 256GB': ['Siyah Titanyum', 'Beyaz Titanyum', 'Doğal Titanyum', 'Çöl Titanyumu'],
  'Apple iPhone 17 256GB': ['Lavanta', 'Adaçayı Yeşili', 'Puslu Mavi', 'Beyaz', 'Siyah'],
  'Apple iPhone 17 Pro 256GB': ['Kozmik Turuncu', 'Derin Mavi', 'Gümüş'],
  'Apple iPhone 17 Pro Max 256GB': ['Kozmik Turuncu', 'Derin Mavi', 'Gümüş'],
  'Apple iPhone 17e 256GB': ['Siyah', 'Beyaz', 'Pembe'],
  'Apple iPhone Air 256GB': ['Gökyüzü Mavisi', 'Açık Altın', 'Bulut Beyazı', 'Uzay Siyahı'],

  'Google Pixel 10 256GB': ['İndigo', 'Kırağı', 'Limon Otu Sarısı', 'Opsidyen'],
  'Google Pixel 10 Pro 256GB': ['Ay Taşı', 'Yeşim', 'Porselen', 'Opsidyen'],

  'Honor 400 Pro 256GB': ['Titanyum Gri', 'Gece Yarısı Siyahı', 'Gelgit Mavisi'],
  'Honor Magic7 Pro 256GB': ['Beyaz', 'Siyah', 'Mavi', 'Gri'],

  'OnePlus 13 256GB': ['Kara Karanlık'],
  'OnePlus 13R 256GB': ['Nebula Siyahı', 'Astral Patika'],

  'Samsung Galaxy A36 5G 256GB': ['Siyah', 'Beyaz', 'Lavanta', 'Misket Limonu Yeşili'],
  'Samsung Galaxy A56 5G 256GB': ['Pembe', 'Açık Gri', 'Zeytin Yeşili', 'Grafit'],
  'Samsung Galaxy S25 FE 256GB': ['Buzul Mavisi', 'Siyah', 'Lacivert', 'Beyaz'],
  'Samsung Galaxy S26 256GB': ['Kobalt Moru', 'Gökyüzü Mavisi', 'Siyah', 'Beyaz'],
  'Samsung Galaxy S26 Ultra 256GB': ['Kobalt Moru', 'Gökyüzü Mavisi', 'Siyah', 'Beyaz'],
  'Samsung Galaxy S26+ 256GB': ['Kobalt Moru', 'Gökyüzü Mavisi', 'Siyah', 'Beyaz'],
  'Samsung Galaxy Z Flip7 256GB': ['Gece Siyahı', 'Mavi Gölge', 'Mercan Kırmızısı'],
  'Samsung Galaxy Z Flip7 FE 256GB': ['Siyah', 'Beyaz'],
  'Samsung Galaxy Z Fold7 512GB': ['Gümüş Gölge', 'Mavi Gölge', 'Gece Siyahı'],

  'Sony Xperia 1 VII 256GB': ['Yosun Yeşili', 'Orkide Moru', 'Arduvaz Siyahı'],
  'Sony Xperia 10 VII 128GB': ['Beyaz', 'Turkuaz', 'Antrasit'],

  'POCO F7 256GB NFC': ['Siyah', 'Beyaz', 'Gümüş'],
  'POCO F7 Ultra 256GB': ['Siyah', 'Sarı'],
  'POCO X7 Pro 256GB NFC': ['Yeşil', 'Sarı', 'Siyah'],
  'Redmi Note 15 5G 256GB': ['Siyah', 'Buzul Mavisi', 'Puslu Mor'],
  'Redmi Note 15 Pro 5G 256GB NFC': ['Siyah', 'Buzul Mavisi', 'Titanyum', 'Puslu Mor'],
  'Xiaomi 15T 256GB': ['Siyah', 'Gri', 'Rose Gold'],
  'Xiaomi 15T Pro 256GB': ['Siyah', 'Gri', 'Mocha Gold'],
  'Xiaomi 17 256GB': ['Mavi', 'Siyah', 'Yeşil', 'Pembe'],
  'Xiaomi 17 Pro 256GB': ['Siyah', 'Beyaz', 'Mor', 'Yeşil'],
  'Xiaomi 17 Ultra 256GB': ['Siyah', 'Beyaz', 'Yıldızlı Yeşil'],
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: products } = await client.query(`SELECT id, canonical_name FROM products`);

    let updated = 0;
    for (const p of products) {
      const colors = COLORS[p.canonical_name];
      if (!colors) {
        console.log(`✘ RENK VERİSİ YOK: ${p.canonical_name}`);
        continue;
      }
      await client.query(
        `UPDATE products SET specs = specs || $1::jsonb WHERE id = $2`,
        [JSON.stringify({ colors }), p.id]
      );
      console.log(`✔ ${p.canonical_name}: ${colors.join(', ')}`);
      updated++;
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
