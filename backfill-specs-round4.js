// backfill-specs-round4.js — "sadece int değil, katlanabilir telefon gibi
// aklına gelebilecek özellikleri de araştır" isteği üzerine dördüncü tur:
// sayısal olmayan, KATEGORİK/BOOLEAN özellikler.
//
// - is_foldable + fold_style: katlanabilir mi, kitap mı kapaklı mı.
// - has_stylus_support: S Pen ile kullanılabiliyor mu (sadece S26 Ultra).
// - sim_type: SADECE iPhone Air dünya çapında eSIM-only — bu, Türkiye'de
//   halen fiziksel SIM tercih eden kullanıcılar için gerçek bir karar
//   kriteri (doğrulandı: Apple, iPhone Air'i TÜM pazarlarda eSIM-only
//   satıyor, tek istisnası olmayan ilk iPhone).
// - biometric_unlock: Apple'da hep Face ID (parmak izi YOK); Samsung
//   amiral gemisi + Xiaomi numaralı seri ekran altı ULTRASONİK; Samsung
//   A serisi + POCO/Redmi ekran altı OPTİK (daha ucuz teknoloji);
//   Samsung katlanabilirler (Z Fold7/Flip7) gövde inceliği yüzünden
//   ekran altı değil YAN TUŞ parmak izi kullanıyor.
// - has_ir_blaster: GERÇEKTEN şaşırtıcı ama tutarlı bir bulgu — Xiaomi
//   markasının (Xiaomi/POCO/Redmi) KATALOGDAKİ YEDİ ürünün YEDİSİNDE de
//   kızılötesi kumanda özelliği var (GSMArena doğrulandı: POCO F7, POCO
//   X7 Pro, Redmi Note 15 Pro, Xiaomi 15T, 15T Pro, 17 hepsi listede) —
//   Apple ve Samsung'da ise bu özellik hiç yok. Yani bu marka bazında
//   net, gerçek bir ayrım noktası.
//
// Kullanım: node backfill-specs-round4.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const FACE_ID = 'Face ID (yüz tanıma)';
const ULTRASONIC = 'Ekran altı ultrasonik parmak izi';
const OPTICAL = 'Ekran altı optik parmak izi';
const SIDE_BUTTON = 'Yan tuş parmak izi';

const BACKFILL = {
  // --- Apple: hepsi Face ID, hiçbirinde parmak izi yok, hiçbiri katlanabilir değil ---
  'Apple iPhone 13 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 13 mini 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 13 Pro 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 13 Pro Max 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 14 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 14 Plus 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 14 Pro 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 14 Pro Max 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 15 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 15 Plus 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 15 Pro 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 15 Pro Max 256GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 16 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 16 Plus 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 16 Pro 128GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 16 Pro Max 256GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 17 256GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 17 Pro 256GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 17 Pro Max 256GB': { biometric_unlock: FACE_ID },
  'Apple iPhone 17e 256GB': { biometric_unlock: FACE_ID },
  // iPhone Air: TEK istisna — dünya genelinde (Türkiye dahil) SADECE eSIM,
  // fiziksel SIM tepsisi hiç yok.
  'Apple iPhone Air 256GB': { biometric_unlock: FACE_ID, sim_type: 'Sadece eSIM' },

  // --- Samsung ---
  'Samsung Galaxy S26 256GB': { biometric_unlock: ULTRASONIC },
  'Samsung Galaxy S26+ 256GB': { biometric_unlock: ULTRASONIC },
  'Samsung Galaxy S26 Ultra 256GB': { biometric_unlock: ULTRASONIC, has_stylus_support: true },
  'Samsung Galaxy A56 5G 256GB': { biometric_unlock: OPTICAL },
  'Samsung Galaxy Z Fold7 512GB': {
    biometric_unlock: SIDE_BUTTON, is_foldable: true, fold_style: 'Kitap tipi (iç katlanır)',
  },
  'Samsung Galaxy Z Flip7 256GB': {
    biometric_unlock: SIDE_BUTTON, is_foldable: true, fold_style: 'Kapaklı (clamshell)',
  },

  // --- Xiaomi / POCO / Redmi: hepsinde kızılötesi kumanda var ---
  'POCO X7 Pro 256GB NFC': { biometric_unlock: OPTICAL, has_ir_blaster: true },
  'POCO F7 256GB NFC': { biometric_unlock: OPTICAL, has_ir_blaster: true },
  'Redmi Note 15 Pro 5G 256GB NFC': { biometric_unlock: OPTICAL, has_ir_blaster: true },
  'Xiaomi 15T 256GB': { biometric_unlock: ULTRASONIC, has_ir_blaster: true },
  'Xiaomi 15T Pro 256GB': { biometric_unlock: ULTRASONIC, has_ir_blaster: true },
  'Xiaomi 17 256GB': { biometric_unlock: ULTRASONIC, has_ir_blaster: true },
  'Xiaomi 17 Ultra 256GB': { biometric_unlock: ULTRASONIC, has_ir_blaster: true },
};

// Katalogdaki TÜM ürünlerde tutarlı olsun diye is_foldable/has_stylus_support/
// has_ir_blaster/sim_type alanlarına, yukarıda özel olarak true/farklı
// belirtilmeyen her ürün için varsayılan (false / "Fiziksel SIM + eSIM")
// değer atanır — böylece SOFT/HARD filtre mantığında "undefined" hiçbir
// zaman "en kötü varsayılan"a düşmez, gerçek bir false/true olur.
function withDefaults(fields) {
  return {
    is_foldable: false,
    has_stylus_support: false,
    has_ir_blaster: false,
    sim_type: 'Fiziksel SIM + eSIM',
    ...fields,
  };
}

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
        [JSON.stringify(withDefaults(fields)), canonicalName]
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
