// check-price-alerts.js — Aktif VE E-POSTASI ONAYLANMIŞ fiyat alarmlarını
// güncel en iyi fiyatla karşılaştırır, hedefe ulaşanları bulur ve
// bildirir.
//
// checkPriceAlerts(pool) hem CLI'dan (node check-price-alerts.js) hem de
// server.js içinden (periyodik setInterval ile) çağrılabilir şekilde
// dışa aktarılıyor — iki yerde de aynı mantığı elle tekrar etmemek için.
//
// CLI kullanımı: node check-price-alerts.js
// (server.js zaten bunu otomatik olarak saatte bir çalıştırıyor —
// canlıya alınca ayrıca bir cron job kurmana gerek yok. Yine de
// istersen bunu ayrı bir cron'a da bağlayabilirsin.)

require('dotenv').config();
const { Pool } = require('pg');
const { sendEmail } = require('./email');

async function checkPriceAlerts(pool, { frontendUrl } = {}) {
  const FRONTEND_URL = frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5500';

  const { rows: alerts } = await pool.query(
    `SELECT a.id, a.product_id, a.email, a.target_price, p.canonical_name
     FROM price_alerts a
     JOIN products p ON p.id = a.product_id
     WHERE a.is_active = true AND a.verified_at IS NOT NULL`
  );

  console.log(`${alerts.length} aktif (onaylanmış) alarm kontrol ediliyor...`);
  let matched = 0;

  for (const alert of alerts) {
    const { rows: bestOfferRows } = await pool.query(
      `SELECT o.price, s.name AS seller_name
       FROM offers o JOIN sellers s ON s.id = o.seller_id
       WHERE o.product_id = $1
       ORDER BY o.price ASC LIMIT 1`,
      [alert.product_id]
    );
    if (bestOfferRows.length === 0) continue;

    const currentPrice = Number(bestOfferRows[0].price);
    if (currentPrice > Number(alert.target_price)) continue;

    matched++;
    console.log(`✔ Eşleşme: ${alert.canonical_name} — hedef ${alert.target_price} TL, güncel ${currentPrice} TL (${alert.email})`);

    await sendEmail({
      to: alert.email,
      subject: `Fiyat düştü: ${alert.canonical_name} artık ${currentPrice.toLocaleString('tr-TR')} TL`,
      text:
        `${alert.canonical_name} için belirlediğin ${Number(alert.target_price).toLocaleString('tr-TR')} TL hedefine ulaşıldı.\n\n` +
        `Güncel en iyi fiyat: ${currentPrice.toLocaleString('tr-TR')} TL (${bestOfferRows[0].seller_name})\n\n` +
        `Cepfiyat'ta incele: ${FRONTEND_URL}/index.html`,
    });

    // Tek seferlik bildirim — tekrar spam olmasın diye alarmı pasifleştir
    await pool.query(
      `UPDATE price_alerts SET is_active = false, notified_at = now() WHERE id = $1`,
      [alert.id]
    );
  }

  console.log(`Bitti. ${matched} alarm tetiklendi.`);
  return { checked: alerts.length, matched };
}

// CLI olarak doğrudan çalıştırıldığında (node check-price-alerts.js)
// kendi bağlantı havuzunu açıp işi bitince kapatır.
if (require.main === module) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  checkPriceAlerts(pool)
    .then(() => pool.end())
    .catch(err => {
      console.error('✘ Hata:', err.message);
      process.exit(1);
    });
}

module.exports = { checkPriceAlerts };
