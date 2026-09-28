// price-filter.js — telefon ve laptop AI arama motorlarının PAYLAŞTIĞI tek
// fiyat ayrıştırıcısı. Önceden server.js içinde BİREBİR AYNI kod telefon ve
// laptop tarafında ayrı ayrı (4 kopya: 2x aralık regex'i + 2x tekli regex)
// duruyordu; artık tek yerde, tek doğru mantıkla.
//
// Bu dosya, "her türlü sorguyu deneyelim" testi sırasında bulunan ÜÇ gerçek
// hatayı düzeltmek için yazıldı (hepsi de numeric-field-filters.js'teki
// "komşu alana sızma" hatasıyla AYNI kökten geliyor, ama fiyat ayrıştırıcısı
// o modülü DEĞİL, server.js içinde kendi ayrı/eski mantığını kullanıyordu):
//
//   1) Yön kelimesi ("altı"/"üzeri"/"fazla" vb.) TÜM sorgu metninde
//      (`q.includes(w)`) aranıyordu — bu yüzden "8GB'DAN FAZLA ram'li 20000
//      TL telefon" sorgusunda RAM cümlesine ait "fazla" kelimesi fiyata
//      sızıp bütçeyi (yanlışlıkla) "20.000 TL ÜZERİNDE" (minPrice) olarak
//      yorumluyordu — oysa hiçbir fiyat yönü belirtilmemişti, varsayılan
//      "altında" (maxPrice) davranışı uygulanmalıydı.
//   2) "en az"/"asgari" (üzeri anlamında, SAYIDAN ÖNCE gelir) ve "en
//      fazla"/"azami" (altı anlamında, SAYIDAN ÖNCE gelir) hiç
//      tanınmıyordu — "en fazla 20000 TL telefon" (yani "en fazla 20 bin
//      TL", bütçe ÜST sınırı) standalone "fazla" kelimesi yüzünden
//      YANLIŞLIKLA "üzerinde" (minPrice) sayılıyordu; "en az 20000 TL
//      telefon" ise HİÇBİR yön kelimesi eşleşmediği için sessizce
//      varsayılan "altında"ya (maxPrice) düşüyordu — ikisi de anlamın TAM
//      TERSİYDİ.
//   3) Birim YAZILMAMIŞ (ne "bin" ne "k" ne "tl") ama yön kelimesi açıkça
//      belirtilmiş çıplak sayılar ("20000 altı telefon", "25000 altında
//      8GB RAM'li telefon" — gerçek hayatta SIK yazılan bir biçim)
//      tamamen YOK SAYILIYOR, bütçe filtresi hiç uygulanmadan en ucuz/
//      ilgisiz bir sonuç dönüyordu.
//
// DİSİPLİN (numeric-field-filters.js ile aynı): yön kelimesi GERÇEKTEN
// yoksa (ne postfix ne prefix biçiminde) hiçbir eşik uygulanmaz — çıplak
// sayı asla varsayılan olarak fiyat sayılmaz (aksi hâlde "8GB 512GB
// telefon" gibi tamamen fiyatla ilgisiz sorgularda rastgele bir sayı
// bütçe sanılabilirdi).

const {
  sliceForwardStoppingAtDigit,
  sliceBackwardStoppingAtDigit,
  hasAny,
} = require('./numeric-field-filters');
const { foldTurkish } = require('./text-normalize');

// KRİTİK: bkz. numeric-field-filters.js'teki AYNI fold notunun tam
// açıklaması — "guclu"/"20 bin alti" gibi Türkçe karaktersiz yazımlar da
// doğru ayrıştırılsın diye tüm kelime listeleri (ve gelen sorgu metni,
// parsePriceFilter'ın İLK satırında) foldTurkish'ten geçiriliyor.
const POSTFIX_OVER_WORDS = ['üzerinde', 'üzeri', 'üstünde', 'üstü', 'fazla', 'yukarı', 'daha pahalı'].map(foldTurkish);
const POSTFIX_UNDER_WORDS = ['altında', 'altı', 'aşağı', 'daha ucuz'].map(foldTurkish);
const PREFIX_OVER_PHRASES = ['en az', 'asgari'].map(foldTurkish);
const PREFIX_UNDER_PHRASES = ['en fazla', 'azami'].map(foldTurkish);

// Çıplak (birimsiz) bir sayının GERÇEKTEN fiyat mı yoksa başka bir alana mı
// ("8GB", "6000mAh", "6.7 inç", "1.5 kg" gibi) ait olduğunu ayırt etmek için
// — sayının hemen ardından (boşluk atlanarak) bu birimlerden biri
// geliyorsa, bu sayı fiyat ADAYI olarak DEĞERLENDİRİLMEZ.
const OTHER_FIELD_UNIT_TOKENS = [
  'gb', 'tb', 'gigabyte', 'terabyte', 'mah', 'megapiksel', 'mp',
  'inç', 'inch', '"', 'kg', 'kilo', 'gram', 'gr', 'watt', 'w',
  'nits', 'nit', 'hz', 'çekirdek', 'core', 'wh',
].map(foldTurkish);

function startsWithOtherUnit(afterText) {
  const trimmed = foldTurkish(afterText).replace(/^\s+/, '');
  return OTHER_FIELD_UNIT_TOKENS.some(u => trimmed.startsWith(u));
}

// Bir "N bin/k/TL" eşleşmesini gerçek TL değerine çevirir — hem tek fiyat
// hem de aralık ("X ile Y arası") ayrıştırması bunu paylaşıyor.
function parseAmount(numGroup, unit) {
  const hasThousandsSep = /[.,]\d{3}/.test(numGroup);
  const rawNum = numGroup.replace(/[.,]/g, '');
  let value = parseInt(rawNum, 10);
  if ((unit === 'bin' || unit === 'k') && !hasThousandsSep) value *= 1000;
  return value;
}

// Bir sayı eşleşmesinin (matchStart..matchEnd) yönünü SADECE kendi yakın
// çevresinden (postfix kelimeler SONRADAN, prefix kelimeler ÖNCEDEN) ve
// SADECE en yakın komşu sayıya kadar arayarak bulur — numeric-field-
// filters.js'teki findFieldDirection() ile AYNI disiplin, fiyat için.
function priceDirectionFor(query, matchStart, matchEnd) {
  const afterText = sliceForwardStoppingAtDigit(query, matchEnd, 20);
  const beforeText = sliceBackwardStoppingAtDigit(query, matchStart, 20);
  const over = hasAny(afterText, POSTFIX_OVER_WORDS) || hasAny(beforeText, PREFIX_OVER_PHRASES);
  const under = hasAny(afterText, POSTFIX_UNDER_WORDS) || hasAny(beforeText, PREFIX_UNDER_PHRASES);
  if (over && !under) return 'min';
  if (under && !over) return 'max';
  return null;
}

// query: qForPrice (server.js'te "2k/4k/8k" video çözünürlüğü ibareleri
// temizlenmiş hâli) — döner: { minPrice, maxPrice } (biri/ikisi null olabilir)
// ya da hiçbir fiyat kriteri yoksa null.
function parsePriceFilter(query) {
  // Sorgu metnini İLK burada katla (bkz. dosya başındaki fold notu) —
  // "bin"/"k"/"tl"/"ile"/"ila"/"aras" gibi birim/bağlaç kelimeleri zaten
  // ascii, ama yön kelimeleri (üzeri/altı/...) değil; ikisi de AYNI
  // katlanmış uzayda karşılaştırılsın diye.
  query = foldTurkish(query);
  // 1) Aralık kalıbı: "X (bin/k) ile Y (bin/k/tl) arası" — yön kelimesi
  // gerekmez, iki sayının kendisi min/max'ı zaten belirliyor.
  // NOT: çıplak "k" biriminden sonra \b ZORUNLU — aksi halde "1.5 KG altı
  // hafif laptop" gibi sorgulardaki "kg"nin baş harfi "k" fiyat birimiyle
  // çakışıp "1.5 kg"yi yanlışlıkla "5.000 TL" bütçesi sanıyordu.
  const rangeMatch = query.match(
    /(\d+(?:[.,]\d{3})*)\s*(bin|k\b)?\s*(?:ile|ila|-)\s*(\d+(?:[.,]\d{3})*)\s*(bin|k\b|tl)?\s*aras/
  );
  if (rangeMatch) {
    const unitA = rangeMatch[2] || rangeMatch[4];
    const unitB = rangeMatch[4] || rangeMatch[2];
    const a = parseAmount(rangeMatch[1], unitA);
    const b = parseAmount(rangeMatch[3], unitB);
    return { minPrice: Math.min(a, b), maxPrice: Math.max(a, b) };
  }

  // 2) Açık birimli tekli eşleşme: "20000 TL", "30 bin", "25k".
  const priceMatch = query.match(/(\d+(?:[.,]\d{3})*)\s*(bin|k\b|tl)/);
  if (priceMatch) {
    const value = parseAmount(priceMatch[1], priceMatch[2]);
    const direction = priceDirectionFor(query, priceMatch.index, priceMatch.index + priceMatch[0].length);
    // Yön belirtilmemişse (ya da belirsizse) varsayılan olarak bütçe üst
    // sınırı (altında) say — mevcut, uzun süredir doğru çalışan davranış.
    if (direction === 'min') return { minPrice: value, maxPrice: null };
    return { minPrice: null, maxPrice: value };
  }

  // 3) YENİ: birim YAZILMAMIŞ ama yön kelimesi açık olan çıplak sayı
  // ("20000 altı telefon", "en az 25000 telefon") — gerçek hayatta sık
  // yazılan, önceden TAMAMEN yok sayılan bir biçim. Yön kelimesi olmadan
  // ASLA fiyat sayılmaz (bkz. dosya başındaki disiplin notu); ayrıca bir
  // sayı başka bir alanın birimiyle (8GB, 6000mAh, 1.5kg, ...) hemen
  // bitişikse fiyat adayı olarak DEĞERLENDİRİLMEZ.
  const bareRe = /(\d+(?:[.,]\d{3})*)/g;
  let m;
  while ((m = bareRe.exec(query)) !== null) {
    const value = parseAmount(m[1], null);
    if (value < 1000) continue; // gerçekçi bir TL bütçesi için çok küçük
    const afterText = sliceForwardStoppingAtDigit(query, m.index + m[0].length, 20);
    if (startsWithOtherUnit(afterText)) continue; // başka bir alana ait (8GB, 6000mAh, ...)
    const direction = priceDirectionFor(query, m.index, m.index + m[0].length);
    if (!direction) continue; // yön kelimesi yoksa bu çıplak sayı fiyat SAYILMAZ
    return direction === 'min' ? { minPrice: value, maxPrice: null } : { minPrice: null, maxPrice: value };
  }

  return null;
}

module.exports = { parsePriceFilter, parseAmount, priceDirectionFor };
