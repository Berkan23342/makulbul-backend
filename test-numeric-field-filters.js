// test-numeric-field-filters.js — numeric-field-filters.js için DB'siz,
// framework'süz doğrulama script'i (test-match.js ile aynı üslup).
// Çalıştır: node test-numeric-field-filters.js

const { parseFieldThreshold, PHONE_NUMERIC_FIELDS, LAPTOP_NUMERIC_FIELDS } = require('./numeric-field-filters');

const fieldByKey = (fields, key) => fields.find(f => f.key === key);

let pass = 0, fail = 0;
function check(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`✔ ${desc}`); }
  else { fail++; console.log(`✘ ${desc}\n   beklenen: ${JSON.stringify(expected)}\n   gelen:    ${JSON.stringify(actual)}`); }
}

// --- Telefon ---
check(
  '8GB\'dan yüksek RAM',
  parseFieldThreshold("8gb'dan yüksek ram'li telefon", fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  { min: 8, max: null }
);
check(
  'Çıplak "16GB RAM\'li telefon" -> eşik YOK (varyant eşleşmesini bozmamalı)',
  parseFieldThreshold("16gb ram'li telefon", fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  null
);
check(
  '"programlama" içindeki "ram" RAM eşleşmesini YANLIŞ tetiklemiyor',
  parseFieldThreshold('programlama için 16gb üzeri depolamalı laptop', fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  null
);
check(
  'Aynı cümlede RAM + depolama ayrımı: RAM tarafı',
  parseFieldThreshold('16gb üzeri ram ve 512gb üzeri depolamalı laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'ram_gb')),
  { min: 16, max: null }
);
check(
  'Aynı cümlede RAM + depolama ayrımı: depolama tarafı',
  parseFieldThreshold('16gb üzeri ram ve 512gb üzeri depolamalı laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'storage_gb')),
  { min: 512, max: null }
);
check(
  '6000 mAh üzeri pil',
  parseFieldThreshold('6000 mah üzeri pili olan telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'battery_mah')),
  { min: 6000, max: null }
);
check(
  'Ondalık ekran boyutu: "6.7 inçten büyük ekran"',
  parseFieldThreshold('6.7 inçten büyük ekranlı telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'screen_inch')),
  { min: 6.7, max: null }
);
check(
  'Ondalık ekran boyutu (virgüllü): "15,6 inçten büyük ekran"',
  parseFieldThreshold('15,6 inçten büyük ekranlı laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'screen_inch')),
  { min: 15.6, max: null }
);
check(
  'Ağırlık kg (ondalık): "1.5 kg altı hafif laptop"',
  parseFieldThreshold('1.5 kg altı hafif laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'weight_g')),
  { min: null, max: 1500 }
);
check(
  'Ağırlık gram (tam sayı): "150 gramdan hafif telefon"',
  parseFieldThreshold('150 gramdan hafif telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'weight_g')),
  { min: null, max: 150 }
);
check(
  'Kablosuz şarj: "15W üzeri kablosuz şarj"',
  parseFieldThreshold('15w üzeri kablosuz şarjı olan telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'wireless_charging_watts')),
  { min: 15, max: null }
);
check(
  'Kablolu şarj "kablosuz" penceredeyse dışlanır',
  parseFieldThreshold('15w üzeri kablosuz şarjı olan telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'wired_charging_watts')),
  null
);
check(
  'Hz: çıplak sayı -> varsayılan "en az" (144hz üzeri ekran)',
  parseFieldThreshold('144hz ekranlı laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'refresh_rate_hz')),
  { min: 144, max: null }
);
check(
  'Hz: açık yön kelimesiyle "165hz üzeri"',
  parseFieldThreshold('165hz üzeri ekranlı laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'refresh_rate_hz')),
  { min: 165, max: null }
);
check(
  'cpu_cores: yön kelimesi YOKSA eşik uygulanmaz (Hz\'den farklı, varsayılan yok)',
  parseFieldThreshold('8 çekirdekli laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'cpu_cores')),
  null
);
check(
  'cpu_cores: "en az 8 çekirdekli laptop"',
  parseFieldThreshold('en az 8 çekirdekli laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'cpu_cores')),
  { min: 8, max: null }
);
check(
  'RAM anahtar kelimesi Türkçe ek almış haliyle de eşleşiyor: "8gbdan yüksek ramli telefon"',
  parseFieldThreshold('8gbdan yüksek ramli telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  { min: 8, max: null }
);
check(
  '"en az" (üzeri anlamında) bağımsız "az" (altı anlamında) ile çakışmıyor',
  parseFieldThreshold('en az 16gb ram\'li telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  { min: 16, max: null }
);
check(
  'Aralık: "8 ile 16 GB arası RAM\'li telefon"',
  parseFieldThreshold("8 ile 16 gb arası ram'li telefon", fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  { min: 8, max: 16 }
);
// NOT: "8GB üzeri ama 16GB altı RAM" gibi TEK alanda iki ayrı yön
// kelimesiyle örtük aralık kurma BİLİNÇLİ olarak desteklenmiyor (bkz.
// numeric-field-filters.js'teki keywordWindowFor notu) — bunun yerine
// "8 ile 16 GB arası RAM" (yukarıdaki aralık testi) kullanılmalı.
check(
  'Kamera MP, ön kamera ile karışmıyor',
  parseFieldThreshold('50mp üzeri ön kamerası olan telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'main_camera_mp')),
  null
);
check(
  'Kamera MP, ana kamera doğru eşleşiyor',
  parseFieldThreshold('50mp üzeri kamerası olan telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'main_camera_mp')),
  { min: 50, max: null }
);
check(
  'Depolama, "hafıza kart" (microSD) ile karışmıyor',
  parseFieldThreshold('hafıza kartlı ve 256gb üzeri telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'storage_gb')),
  null
);
check(
  'Webcam MP laptop',
  parseFieldThreshold('en az 2mp webcam\'i olan laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'webcam_mp')),
  { min: 2, max: null }
);
check(
  'Batarya Wh (ondalık, laptop)',
  parseFieldThreshold('99.9 wh üzeri bataryalı laptop', fieldByKey(LAPTOP_NUMERIC_FIELDS, 'battery_wh')),
  { min: 99.9, max: null }
);

check(
  'Çapraz-alan sızıntısı: fiyat cümlesindeki "altı" RAM\'e sızmamalı ("30 bin altı 8gb ram telefon")',
  parseFieldThreshold('30 bin altı 8gb ram telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  null
);
check(
  'Aynı çapraz-alan riski depolama için de yok: "30 bin altı 512gb depolamalı telefon"',
  parseFieldThreshold('30 bin altı 512gb depolamalı telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'storage_gb')),
  null
);
check(
  'Prefix kelime hâlâ doğru yakalanıyor (aynı riskli komşulukta): "30 bin altı en az 8gb ram\'li telefon"',
  parseFieldThreshold('30 bin altı en az 8gb ram\'li telefon', fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  { min: 8, max: null }
);
check(
  'Postfix kelime hâlâ doğru yakalanıyor (aynı riskli komşulukta): "30 bin altı 8gb\'dan yüksek ram\'li telefon"',
  parseFieldThreshold("30 bin altı 8gb'dan yüksek ram'li telefon", fieldByKey(PHONE_NUMERIC_FIELDS, 'ram_gb')),
  { min: 8, max: null }
);

console.log(`\n${pass} geçti, ${fail} başarısız.`);
if (fail > 0) process.exitCode = 1;
