// backfill-missing-specs.js — 18 ürünün specs'inde ağırlık, su/toz direnci,
// şarj hızları, ön kamera ve zoom bilgisi TAMAMEN eksikti (Samsung/Xiaomi/
// POCO/Redmi'nin tamamı + iPhone 16'dan sonraki Apple modelleri).
//
// NEDEN ÖNEMLİ: /api/ai-search'teki ücretsiz çoklu-kriter puanlama motoru
// "hafif", "dayanıklı", "hızlı şarj", "selfie", "zoom" gibi isteklerde bu
// alanlara bakıyor. Alan yoksa kod varsayılan (en kötü) değere düşüyor
// (weight_g||9999, wired_charging_watts||0, ip_rating||'' vb.) — yani bu 18
// ürün, gerçekte iyi olsalar bile bu kriterlerde HİÇBİR ZAMAN kazanamıyordu,
// öneriler sistematik olarak sadece eski iPhone'lara kayıyordu. Bu script
// gerçek (araştırılmış) verilerle o boşluğu dolduruyor.
//
// specs || $2::jsonb ile MEVCUT alanları SİLMEDEN sadece eksikleri ekliyor.
//
// Kullanım: node backfill-missing-specs.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Kaynak: Apple/Samsung/Xiaomi resmi teknik özellik sayfaları ve GSMArena
// (Eylül 2026 itibarıyla). Bazı değerler (ör. katlanabilirlerde kablosuz
// şarj gücü) resmi olarak yayınlanmadığından, aynı serinin önceki
// nesillerine dayalı makul bir tahmindir — kesinlik gerektiren bir
// kullanım için satıcı sayfası kontrol edilmeli.
const BACKFILL = {
  'Apple iPhone 17 256GB': {
    weight_g: 177, ip_rating: 'IP68', wired_charging_watts: 25,
    wireless_charging_watts: 25, front_camera_mp: 18, ultra_wide_mp: 48,
  },
  'Apple iPhone 17 Pro 256GB': {
    weight_g: 206, ip_rating: 'IP68', wired_charging_watts: 40,
    wireless_charging_watts: 25, front_camera_mp: 18, ultra_wide_mp: 48,
    telephoto_mp: 48, optical_zoom_x: 8,
  },
  'Apple iPhone 17 Pro Max 256GB': {
    weight_g: 233, ip_rating: 'IP68', wired_charging_watts: 40,
    wireless_charging_watts: 25, front_camera_mp: 18, ultra_wide_mp: 48,
    telephoto_mp: 48, optical_zoom_x: 8,
  },
  'Apple iPhone 17e 256GB': {
    weight_g: 169, ip_rating: 'IP68', wired_charging_watts: 20,
    wireless_charging_watts: 15, front_camera_mp: 12,
  },
  'Apple iPhone Air 256GB': {
    weight_g: 165, ip_rating: 'IP68', wired_charging_watts: 20,
    wireless_charging_watts: 20, front_camera_mp: 18,
  },
  'Samsung Galaxy S26 256GB': {
    weight_g: 167, ip_rating: 'IP68', wired_charging_watts: 25,
    wireless_charging_watts: 15, front_camera_mp: 12,
  },
  'Samsung Galaxy S26+ 256GB': {
    weight_g: 190, ip_rating: 'IP68', wired_charging_watts: 45,
    wireless_charging_watts: 20, front_camera_mp: 12,
  },
  'Samsung Galaxy S26 Ultra 256GB': {
    weight_g: 214, ip_rating: 'IP68', wired_charging_watts: 60,
    wireless_charging_watts: 25, front_camera_mp: 12, ultra_wide_mp: 50,
    telephoto_mp: 50, optical_zoom_x: 5,
  },
  'Samsung Galaxy A56 5G 256GB': {
    weight_g: 198, ip_rating: 'IP67', wired_charging_watts: 45,
    front_camera_mp: 12, // kablosuz şarj yok — A serisinde standart
  },
  'Samsung Galaxy Z Fold7 512GB': {
    weight_g: 215, ip_rating: 'IP48', wired_charging_watts: 25,
    wireless_charging_watts: 15, front_camera_mp: 10,
  },
  'Samsung Galaxy Z Flip7 256GB': {
    weight_g: 188, ip_rating: 'IP48', wired_charging_watts: 25,
    wireless_charging_watts: 15, front_camera_mp: 10,
  },
  'POCO X7 Pro 256GB NFC': {
    weight_g: 195, ip_rating: 'IP68/IP69', wired_charging_watts: 90,
    front_camera_mp: 20, ultra_wide_mp: 8, // kablosuz şarj yok
  },
  'POCO F7 256GB NFC': {
    weight_g: 216, ip_rating: 'IP68', wired_charging_watts: 90,
    front_camera_mp: 20, // kablosuz şarj yok
  },
  'Redmi Note 15 Pro 5G 256GB NFC': {
    weight_g: 210, ip_rating: 'IP68/IP69K', wired_charging_watts: 45,
    front_camera_mp: 20, ultra_wide_mp: 8, // kablosuz şarj yok
  },
  'Xiaomi 15T 256GB': {
    weight_g: 194, ip_rating: 'IP68', wired_charging_watts: 67,
    front_camera_mp: 32, ultra_wide_mp: 12, telephoto_mp: 50, optical_zoom_x: 2,
    // kablosuz şarj yok
  },
  'Xiaomi 15T Pro 256GB': {
    weight_g: 210, ip_rating: 'IP68', wired_charging_watts: 90,
    wireless_charging_watts: 50, front_camera_mp: 32, ultra_wide_mp: 12,
    telephoto_mp: 50, optical_zoom_x: 5,
  },
  'Xiaomi 17 256GB': {
    weight_g: 191, ip_rating: 'IP68', wired_charging_watts: 100,
    wireless_charging_watts: 50, front_camera_mp: 50, ultra_wide_mp: 50,
    telephoto_mp: 50, optical_zoom_x: 2,
  },
  'Xiaomi 17 Ultra 256GB': {
    weight_g: 224, ip_rating: 'IP68', wired_charging_watts: 90,
    wireless_charging_watts: 50, front_camera_mp: 50, ultra_wide_mp: 50,
    telephoto_mp: 200, optical_zoom_x: 4,
  },
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let updated = 0;

    for (const [canonicalName, fields] of Object.entries(BACKFILL)) {
      const { rows } = await client.query(
        `UPDATE products SET specs = specs || $1::jsonb
         WHERE canonical_name = $2
         RETURNING id`,
        [JSON.stringify(fields), canonicalName]
      );
      if (rows.length) {
        updated++;
        console.log(`✔ ${canonicalName}`);
      } else {
        console.log(`⚠ Eşleşme yok: ${canonicalName}`);
      }
    }

    await client.query('COMMIT');
    console.log(`\n✔ Tamamlandı. ${updated}/${Object.keys(BACKFILL).length} ürün güncellendi.`);
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
