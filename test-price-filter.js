// test-price-filter.js — price-filter.js için DB'siz, framework'süz
// doğrulama script'i (test-match.js / test-numeric-field-filters.js ile
// aynı üslup). Çalıştır: node test-price-filter.js

const { parsePriceFilter } = require('./price-filter');

let pass = 0, fail = 0;
function check(desc, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`✔ ${desc}`); }
  else { fail++; console.log(`✘ ${desc}\n   beklenen: ${JSON.stringify(expected)}\n   gelen:    ${JSON.stringify(actual)}`); }
}

// --- Mevcut, uzun süredir doğru çalışan davranışlar (regresyon) ---
check('"25000 tl" -> maxPrice (yön yok, varsayılan altında)',
  parsePriceFilter('25000 tl telefon'), { minPrice: null, maxPrice: 25000 });
check('"30 bin altı" -> maxPrice=30000',
  parsePriceFilter('30 bin altı telefon'), { minPrice: null, maxPrice: 30000 });
check('"30 bin üzeri" -> minPrice=30000',
  parsePriceFilter('30 bin üzeri telefon'), { minPrice: 30000, maxPrice: null });
check('"50000 ile 80000 arası" -> aralık',
  parsePriceFilter('50000 ile 80000 arası telefon'), { minPrice: 50000, maxPrice: 80000 });
check('"25.000 TL" (binlik ayraçlı) -> 25000, ×1000 TEKRARLANMAZ',
  parsePriceFilter('25.000 TL altı telefon'), { minPrice: null, maxPrice: 25000 });
check('Birim yoksa (ve yön kelimesi de yoksa) hiçbir fiyat eşiği YOK',
  parsePriceFilter('8gb ram telefon'), null);

// --- YENİ: bu oturumda "her türlü sorgu" testinde bulunan 3 hatanın
// regresyon testleri ---
check('BUG 1 düzeltmesi: RAM cümlesindeki "fazla" fiyata sızmıyor artık ("8GB\'dan fazla ram\'li 20000 TL telefon" -> yön YOK -> varsayılan maxPrice)',
  parsePriceFilter("8gb'dan fazla ram'li 20000 tl telefon"), { minPrice: null, maxPrice: 20000 });
check('BUG 2 düzeltmesi: "en fazla X TL" artık DOĞRU şekilde maxPrice (önceden yanlışlıkla minPrice oluyordu)',
  parsePriceFilter('en fazla 20000 tl telefon'), { minPrice: null, maxPrice: 20000 });
check('BUG 2 düzeltmesi: "en az X TL" artık DOĞRU şekilde minPrice (önceden yanlışlıkla maxPrice oluyordu)',
  parsePriceFilter('en az 20000 tl telefon'), { minPrice: 20000, maxPrice: null });
check('BUG 2: "asgari X TL" da "en az" gibi minPrice',
  parsePriceFilter('asgari 20000 tl telefon'), { minPrice: 20000, maxPrice: null });
check('BUG 2: "azami X TL" da "en fazla" gibi maxPrice',
  parsePriceFilter('azami 20000 tl telefon'), { minPrice: null, maxPrice: 20000 });
check('BUG 3 düzeltmesi: birimsiz çıplak "20000 altı" artık maxPrice=20000 (önceden TAMAMEN yok sayılıyordu)',
  parsePriceFilter('20000 altı telefon'), { minPrice: null, maxPrice: 20000 });
check('BUG 3: "25000 altında 8GB RAM\'li telefon" -> maxPrice=25000 (RAM\'in kendi birimi fiyatla karışmıyor)',
  parsePriceFilter("25000 altında 8gb ram'li telefon"), { minPrice: null, maxPrice: 25000 });
check('BUG 3: çıplak sayı ama YÖN KELİMESİ YOK -> hâlâ fiyat SAYILMAZ (disiplin korunuyor)',
  parsePriceFilter('20000 telefon'), null);
check('BUG 3: çıplak sayı başka alanın birimine bitişikse (6000mAh) fiyat SAYILMAZ',
  parsePriceFilter('6000mah altı telefon'), null);
check('Karma: "30 bin altı en az 8gb ram\'li telefon" -> fiyat hâlâ doğru (30000 altı), RAM\'in "en az"ı fiyata sızmıyor',
  parsePriceFilter("30 bin altı en az 8gb ram'li telefon"), { minPrice: null, maxPrice: 30000 });

console.log(`\n${pass} geçti, ${fail} başarısız.`);
if (fail > 0) process.exitCode = 1;
