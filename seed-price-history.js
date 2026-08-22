// seed-price-history.js — price_history tablosunu, mevcut tekliflerin
// (offers) güncel fiyatına dayanarak son N günlük GERÇEKÇİ AMA SENTETİK
// (üretilmiş) bir fiyat geçmişiyle doldurur.
//
// Neden gerekli: price_history tablosu şu ana kadar hiç dolmadı çünkü
// gerçek zamanlı fiyat takibi (düzenli scraping) henüz çalışmıyor. Bu
// script olmadan yeni eklenen /api/products/:id/price-history uç noktası
// bomboş dönerdi. Buradaki veri sadece DEMO/başlangıç amaçlıdır — gerçek
// veri, her /api/ingest-offer çağrısında match-product.js'in artık
// otomatik olarak yazdığı kayıtlarla zamanla birikecek.
//
// Kullanım: node seed-price-history.js [gün_sayısı=30]

require('dotenv').config();
const { Pool } = require('pg');

const DAYS = Number(process.argv[2]) || 30;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function main() {
  const { rows: offers } = await pool.query('SELECT id, price FROM offers');
  console.log(`${offers.length} teklif için ${DAYS} günlük fiyat geçmişi üretiliyor...`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // script tekrar çalıştırılırsa eski sentetik veriyi tekrarlamamak için temizle
    await client.query('DELETE FROM price_history');

    for (const offer of offers) {
      const finalPrice = Number(offer.price);
      let price = finalPrice * (0.94 + Math.random() * 0.1); // ~N gün önce, güncel fiyattan hafifçe farklı bir noktadan başla

      const values = [];
      const params = [];
      for (let d = DAYS; d >= 0; d--) {
        if (d === 0) {
          price = finalPrice; // bugünkü kayıt, offers tablosundaki güncel fiyatla birebir aynı
        } else {
          const drift = (finalPrice - price) * 0.08; // yavaşça güncel fiyata yakınsa
          const noise = finalPrice * (Math.random() - 0.5) * 0.02; // küçük günlük dalgalanma
          price = Math.max(1, price + drift + noise);
        }
        const date = new Date();
        date.setDate(date.getDate() - d);

        const base = params.length;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
        params.push(offer.id, Math.round(price * 100) / 100, date);
      }

      await client.query(
        `INSERT INTO price_history (offer_id, price, recorded_at) VALUES ${values.join(',')}`,
        params
      );
    }

    await client.query('COMMIT');
    console.log('✔ price_history dolduruldu (sentetik demo verisi).');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✘ Hata:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
