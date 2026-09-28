// numeric-field-filters.js — AI aramada ("/api/ai-search", server.js)
// "8GB'dan yüksek RAM", "512GB üzeri depolama", "1.5 kg altı laptop",
// "144Hz üzeri ekran" gibi SAYI + YÖN belirten sorgu parçalarını herhangi
// bir sayısal specs alanı için TEK bir yerde çözen paylaşılan saf
// yardımcı — hem telefon hem laptop AI arama motoru bunu kullanıyor.
//
// DİSİPLİN: yön kelimesi (üzeri/altı/en az/en fazla vb., ya da alana özel
// ekleri) sorguda GERÇEKTEN yoksa hiçbir eşik döndürülmez. Bunun tek
// istisnası refresh_rate_hz'nin "bare sayı" durumu (bkz. PHONE/LAPTOP_
// NUMERIC_FIELDS'teki defaultDirectionIfBare) — laptop tarafında model-adı
// eşleşmesi (server.js'teki exactMatches daraltma bloğu) ÇIPLAK "16GB"
// gibi sayıları RAM/depolama VARYANT SEÇİMİ için kullanıyor; yön kelimesi
// şartı olmadan bu iki mekanizma çakışırdı.

const { foldTurkish } = require('./text-normalize');

// KRİTİK: tüm yön/anahtar kelime listeleri ve gelen sorgu metni
// foldTurkish() ile Türkçe özel karakterlerden arındırılmış ("ascii
// katlanmış") hâlde karşılaştırılıyor — aksi halde "guclu"/"yuksek
// ramli"/"agir olmayan" gibi (gerçek kullanıcıların SIK yazdığı,
// Türkçe karaktersiz) sorgular hiçbir yön/anahtar kelimeyle
// eşleşmiyor, eşik SESSİZCE hiç uygulanmıyordu. Aşağıdaki tüm sabit
// listeler bu yüzden foldTurkish'ten GEÇİRİLEREK tanımlanıyor; sorgu
// metni de parseFieldThreshold'un İLK satırında katlanıyor — ikisi de
// aynı ("katlanmış") uzayda karşılaştırıldığı için tutarlı kalıyor.
const BASE_OVER_WORDS = ['üzerinde', 'üzeri', 'üstünde', 'üstü', 'fazla', 'yukarı'].map(foldTurkish);
const BASE_UNDER_WORDS = ['altında', 'altı', 'aşağı'].map(foldTurkish);

// "en az"/"asgari" ve "en fazla"/"azami" SAYIDAN ÖNCE gelir ("en az 16GB");
// tüm diğer yön kelimeleri (üzeri/altı/yüksek/düşük/ağır/hafif/...) SAYIDAN
// SONRA gelir ("16GB üzeri", "150 gramdan hafif"). Bu ayrım, aşağıdaki
// findFieldDirection()'ın her kelimeyi SADECE doğru tarafta araması için
// kullanılıyor — bkz. o fonksiyonun başındaki not (çapraz-alan sızıntısı).
const PREFIX_OVER_PHRASES = ['en az', 'asgari'];
const PREFIX_UNDER_PHRASES = ['en fazla', 'azami'];
const PREFIX_PHRASES_SET = new Set([...PREFIX_OVER_PHRASES, ...PREFIX_UNDER_PHRASES]);

function hasAny(text, words) {
  return words.some(w => text.includes(w));
}

// Geriye dair düz metinde (ör. eski whole-query geri düşüşte) kullanılan
// TEK taraflı yön tespiti — artık SADECE tryRange() içinde (aralık
// kalıbının kendi eşleşmesinden sonra, yön zaten sayılardan belli
// olduğu için orada yön aranmıyor) kullanılmıyor; geriye dönük uyumluluk
// için dışa aktarılmaya devam ediyor ama parseFieldThreshold artık bunun
// yerine findFieldDirection() kullanıyor.
function findDirection(text, field) {
  const overWords = BASE_OVER_WORDS.concat(field.extraOverWords || []);
  const underWords = BASE_UNDER_WORDS.concat(field.extraUnderWords || []);
  const over = hasAny(text, overWords);
  const under = hasAny(text, underWords);
  if (over && !under) return 'min';
  if (under && !over) return 'max';
  return null;
}

// Metinde geriye doğru (idx'ten başlayarak) en fazla maxChars kadar tara,
// ama başka bir sayının içine (bir rakama) rastlarsan hemen DUR — böylece
// "30 bin altı 8gb ram" gibi bir cümlede "altı" (fiyat cümlesine ait)
// hiçbir zaman "8gb"nin öncesi taranırken görünmez (rakam '0' onu keser).
function sliceBackwardStoppingAtDigit(text, idx, maxChars) {
  let start = idx;
  const floor = Math.max(0, idx - maxChars);
  while (start > floor && !/\d/.test(text[start - 1])) start--;
  return text.slice(start, idx);
}

// Aynısı ileri yönde: idx'ten itibaren en fazla maxChars kadar tara, bir
// sonraki sayının rakamına rastlarsan dur.
function sliceForwardStoppingAtDigit(text, idx, maxChars) {
  let end = idx;
  const ceil = Math.min(text.length, idx + maxChars);
  while (end < ceil && !/\d/.test(text[end])) end++;
  return text.slice(idx, end);
}

// Bir SAYI+BİRİM eşleşmesinin (matchStart..matchEnd) yönünü, kelimeyi
// SADECE doğru taraftan (prefix kelimeler ÖNCEDEN, postfix kelimeler
// SONRADAN) ve SADECE en yakın komşu sayıya kadar (başka bir alanın/
// fiyatın kendi sayısına ait yön kelimesini asla "ödünç almadan") arayarak
// bulur. Bu, whole-query geri düşüşünün yol açtığı çapraz-alan sızıntısı
// hatasını (ör. "30 bin altı 8gb ram telefon" sorgusunda fiyata ait
// "altı"nın RAM'e sızması) kökünden önler.
function findFieldDirection(query, matchStart, matchEnd, field) {
  const postfixOver = BASE_OVER_WORDS.concat(field.extraOverWords || [])
    .filter(w => !PREFIX_PHRASES_SET.has(w));
  const postfixUnder = BASE_UNDER_WORDS.concat(field.extraUnderWords || [])
    .filter(w => !PREFIX_PHRASES_SET.has(w));
  const prefixOver = PREFIX_OVER_PHRASES.filter(w => (field.extraOverWords || []).includes(w));
  const prefixUnder = PREFIX_UNDER_PHRASES.filter(w => (field.extraUnderWords || []).includes(w));

  const afterText = sliceForwardStoppingAtDigit(query, matchEnd, 35);
  const beforeText = sliceBackwardStoppingAtDigit(query, matchStart, 20);

  const over = hasAny(afterText, postfixOver) || hasAny(beforeText, prefixOver);
  const under = hasAny(afterText, postfixUnder) || hasAny(beforeText, prefixUnder);
  if (over && !under) return 'min';
  if (under && !over) return 'max';
  return null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unitPatternFor(tokens) {
  return tokens.map(escapeRe).sort((a, b) => b.length - a.length).join('|');
}

function numPatternFor(style) {
  // decimal: "6.7", "15,6", "1.5" — en fazla 2 ondalık hane.
  // grouped-integer: "5000", "5.000", "512" — fiyat ayrıştırmasındaki
  // binlik-ayraç kalıbıyla aynı, ama burada "bin"/"k" çarpanı YOK (kimse
  // "8 bin GB RAM" demez) — çarpan sadece birimden (gb/tb/kg/gram) gelir.
  return style === 'decimal' ? `\\d+(?:[.,]\\d{1,2})?` : `\\d+(?:[.,]\\d{3})*`;
}

function parseAmount(numText, multiplier, style) {
  if (style === 'decimal') return parseFloat(numText.replace(',', '.')) * multiplier;
  return parseInt(numText.replace(/[.,]/g, ''), 10) * multiplier;
}

function matchesKeyword(windowText, keywords) {
  if (!keywords || !keywords.length) return true; // anahtar gerekmez (birim tek başına yeterli)
  return keywords.some(k => (k instanceof RegExp ? k.test(windowText) : windowText.includes(k)));
}

function excluded(windowText, field) {
  return !!(field.excludeIf && field.excludeIf.some(k => windowText.includes(k)));
}

// Varsayılan pencere simetrik (±35) — ama "gb"/"tb" gibi BİRDEN FAZLA
// alan (ram_gb/storage_gb) tarafından paylaşılan birimlerde, doğal
// Türkçe söz dizimi neredeyse hep "[SAYI][BİRİM] [YÖN] [ALAN-ADI]"
// şeklinde (alan adı sayıdan SONRA gelir, ör. "16GB üzeri RAM ve 512GB
// üzeri depolama") — bu yüzden bu alanlarda geriye bakışı kısaltıp
// ("depolama" kelimesinin, ondan ÖNCE gelen "ram" sayısının penceresine
// sızmasını önlemek için) ileriye bakışı olduğu gibi bırakıyoruz.
// BİLİNEN SINIRLAMA: "RAM'i 16GB'dan fazla" gibi alan-adı SAYIDAN ÖNCE
// gelen nadir bir söz dizimi bu yüzden yakalanmaz.
function keywordWindowFor(field) {
  if (field.keywordWindow) return field.keywordWindow;
  return { before: 35, after: 35 };
}

// Fiyattaki "(ile|ila|-) ... aras" aralık kalıbının birim-parametrik
// genelleştirmesi — "8 ile 16 GB arası RAM", "6 ile 7 inç arası ekran".
// Birim ikinci sayıdan sonra ZORUNLU, ilkinden sonra opsiyonel (fiyattaki
// "50 ile 80 bin arası" kalıbıyla aynı esneklik).
function tryRange(query, field, group) {
  const numPattern = numPatternFor(group.style);
  const unitPattern = unitPatternFor(group.tokens);
  // NOT: birim alternatiflerinden sonra KASITLI olarak \b YOK — Türkçe'de
  // ekler (gram+dan, çekirdek+li) çoğu zaman kesme işareti OLMADAN
  // doğrudan bitişir ("gramdan", "çekirdekli"), \b bu durumda birim ile
  // ekin arasında bir sınır BULAMAZ (ikisi de "kelime karakteri") ve
  // eşleşme sessizce başarısız olurdu.
  const re = new RegExp(
    `(${numPattern})\\s*(?:${unitPattern})?\\s*(?:ile|ila|-)\\s*(${numPattern})\\s*(${unitPattern})\\s*aras`,
    'i'
  );
  const m = query.match(re);
  if (!m) return null;
  const { before, after } = keywordWindowFor(field);
  const start = Math.max(0, m.index - before);
  const end = Math.min(query.length, m.index + m[0].length + after);
  const windowText = query.slice(start, end);
  if (!matchesKeyword(windowText, field.keywords) || excluded(windowText, field)) return null;
  const a = parseAmount(m[1], group.multiplier, group.style);
  const b = parseAmount(m[2], group.multiplier, group.style);
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

// field: {
//   keywords: (string|RegExp)[] | null,  // null/[] = anahtar gerekmez
//   unitGroups: { tokens: string[], multiplier: number, style: 'decimal'|'grouped-integer' }[],
//   extraOverWords?: string[], extraUnderWords?: string[],
//   excludeIf?: string[],           // pencerede bu kelimelerden biri varsa eşleşme atlanır
//   defaultDirectionIfBare?: 'min'|'max',  // yön kelimesi YOKSA bu varsayılan kullanılır (sadece refresh_rate_hz için)
//   windowChars?: number (varsayılan 35),
// }
// Döndürür: { min, max } (biri null olabilir) ya da hiç eşik yoksa null.
function parseFieldThreshold(query, field) {
  // Sorgu metnini İLK burada katla — field tabloları (yön/anahtar/birim
  // kelimeleri) da modül yüklenirken foldFieldTable() ile katlandığı için
  // ikisi de AYNI ("ascii katlanmış") uzayda karşılaştırılıyor. Bu sayede
  // "guclu"/"yuksek ramli" gibi Türkçe karaktersiz yazımlar da doğru
  // eşleşiyor (bkz. dosya başındaki fold notu).
  query = foldTurkish(query);
  let min = null, max = null;

  for (const group of field.unitGroups) {
    const rangeResult = tryRange(query, field, group);
    if (rangeResult) {
      min = min === null ? rangeResult.min : Math.min(min, rangeResult.min);
      max = max === null ? rangeResult.max : Math.max(max, rangeResult.max);
      continue; // bu birim grubu için aralık bulunduysa tekli eşik taramasını atla
    }

    // NOT: birim alternatiflerinden sonra KASITLI olarak \b YOK — bkz.
    // tryRange()'teki aynı notun tam açıklaması (Türkçe ek çakışması).
    const re = new RegExp(`(${numPatternFor(group.style)})\\s*(${unitPatternFor(group.tokens)})`, 'gi');
    const { before, after } = keywordWindowFor(field);
    let m;
    while ((m = re.exec(query)) !== null) {
      const start = Math.max(0, m.index - before);
      const end = Math.min(query.length, m.index + m[0].length + after);
      const windowText = query.slice(start, end);

      if (!matchesKeyword(windowText, field.keywords)) continue;
      if (excluded(windowText, field)) continue;

      let direction = findFieldDirection(query, m.index, m.index + m[0].length, field);
      if (!direction && field.defaultDirectionIfBare) direction = field.defaultDirectionIfBare;
      if (!direction) continue;

      const value = parseAmount(m[1], group.multiplier, group.style);
      if (direction === 'min') min = min === null ? value : Math.min(min, value);
      else max = max === null ? value : Math.max(max, value);
    }
  }

  if (min === null && max === null) return null;
  return { min, max };
}

const NUMERIC_FIELD_LABELS = {
  ram_gb: 'RAM',
  storage_gb: 'depolama',
  battery_mah: 'batarya',
  battery_wh: 'batarya',
  screen_inch: 'ekran boyutu',
  weight_g: 'ağırlık',
  wired_charging_watts: 'kablolu şarj gücü',
  wireless_charging_watts: 'kablosuz şarj gücü',
  screen_nits: 'ekran parlaklığı',
  refresh_rate_hz: 'ekran yenileme hızı',
  main_camera_mp: 'kamera çözünürlüğü',
  cpu_cores: 'çekirdek sayısı',
  webcam_mp: 'webcam çözünürlüğü',
};

// GB/TB gibi büyük değerleri (>=1024 ve 1024'e tam bölünüyorsa) "TB"
// olarak, ağırlığı (>=1000 gram) "kg" olarak okunaklı biçimlendirir;
// diğerleri olduğu gibi (birim etiketiyle) gösterilir.
function formatFieldValue(fieldKey, value) {
  if (value == null) return '';
  if ((fieldKey === 'ram_gb' || fieldKey === 'storage_gb') && value >= 1024 && value % 1024 === 0) {
    return `${value / 1024}TB`;
  }
  if (fieldKey === 'weight_g') {
    return `${(value / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}kg`;
  }
  const unitSuffix = {
    ram_gb: 'GB', storage_gb: 'GB', battery_mah: 'mAh', battery_wh: 'Wh',
    screen_inch: '"', wired_charging_watts: 'W', wireless_charging_watts: 'W',
    screen_nits: ' nit', refresh_rate_hz: 'Hz', main_camera_mp: 'MP',
    cpu_cores: '', webcam_mp: 'MP', // cpu_cores: birim yok — etiket ("çekirdek sayısı") zaten anlamı taşıyor
  }[fieldKey] || '';
  const numText = Number.isInteger(value) ? value : value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  return `${numText}${unitSuffix}`;
}

// threshold: {min,max} (sorgudan ayrıştırılan istenen eşik)
// actualValue: seçilen üründeki gerçek değer
// unmet: true ise bu kriteri karşılayan HİÇBİR aday yoktu, geniş havuza
// dönüldü — fiyat mesajlarındaki "bulunamadı, en yakın seçenek gösteriliyor"
// üslubuyla aynı dürüst uyarı.
function formatNumericReason(fieldKey, threshold, actualValue, unmet) {
  const label = NUMERIC_FIELD_LABELS[fieldKey] || fieldKey;
  const actualText = formatFieldValue(fieldKey, Number(actualValue));
  if (threshold.min != null && threshold.max != null) {
    const rangeText = `${formatFieldValue(fieldKey, threshold.min)}-${formatFieldValue(fieldKey, threshold.max)}`;
    return unmet
      ? `Bu kriterde (${rangeText} ${label}) uygun seçenek bulunamadı, en yakın seçenek gösteriliyor: ${actualText}`
      : `Belirtilen aralıkta ${label}: ${actualText}`;
  }
  if (threshold.min != null) {
    const minText = formatFieldValue(fieldKey, threshold.min);
    return unmet
      ? `Bu kriterde (en az ${minText} ${label}) uygun seçenek bulunamadı, en yakın seçenek gösteriliyor: ${actualText}`
      : `En az ${minText} ${label}: ${actualText}`;
  }
  const maxText = formatFieldValue(fieldKey, threshold.max);
  return unmet
    ? `Bu kriterde (${maxText} altı ${label}) uygun seçenek bulunamadı, en yakın seçenek gösteriliyor: ${actualText}`
    : `${maxText} altı ${label}: ${actualText}`;
}

// ---------------------------------------------------------------------
// Alan tabloları — telefon ve laptop specs'inde GERÇEKTEN var olan
// sayısal alanlar (server.js'teki mevcut soft filtrelerden doğrulandı).
// ---------------------------------------------------------------------

const GB_TB_GROUPS = [
  { tokens: ['gb', 'gigabyte'], multiplier: 1, style: 'grouped-integer' },
  { tokens: ['tb', 'terabyte'], multiplier: 1024, style: 'grouped-integer' },
];
// ram_gb VE storage_gb aynı "gb/tb" birimini paylaşıyor — bir cümlede
// ikisi birlikte geçtiğinde ("16GB üzeri RAM ve 512GB üzeri depolama")
// hangi sayının hangi alana ait olduğunu ayırt etmek için bkz.
// keywordWindowFor()'daki açıklama.
const GB_TB_KEYWORD_WINDOW = { before: 5, after: 22 };

// Alan tablolarındaki TÜM string kelime listelerini (birim, anahtar
// kelime, ek yön kelimesi, dışlama listesi) foldTurkish'ten geçirir —
// RegExp anahtar kelimeler (ör. /\bram/) zaten diyakritiksiz olduğu için
// dokunulmadan bırakılır. Bkz. dosya başındaki fold notunun tam açıklaması.
function foldFieldTable(fields) {
  for (const f of fields) {
    if (f.extraOverWords) f.extraOverWords = f.extraOverWords.map(foldTurkish);
    if (f.extraUnderWords) f.extraUnderWords = f.extraUnderWords.map(foldTurkish);
    if (f.excludeIf) f.excludeIf = f.excludeIf.map(foldTurkish);
    if (f.keywords) f.keywords = f.keywords.map(k => (k instanceof RegExp ? k : foldTurkish(k)));
    if (f.unitGroups) {
      for (const g of f.unitGroups) g.tokens = g.tokens.map(foldTurkish);
    }
  }
  return fields;
}

const PHONE_NUMERIC_FIELDS = foldFieldTable([
  {
    key: 'ram_gb',
    keywords: [/\bram/],
    unitGroups: GB_TB_GROUPS,
    keywordWindow: GB_TB_KEYWORD_WINDOW,
    extraOverWords: ['yüksek', 'çok', 'bol', 'en az', 'asgari'],
    extraUnderWords: ['düşük', 'en fazla', 'azami'],
  },
  {
    // "hafıza" kelimesi KULLANILMAZ — mevcut microSD "hafıza kart(ı)"
    // (expandableStorage) anlamıyla çakışır (bkz. server.js'teki ilgili not).
    key: 'storage_gb',
    keywords: ['depolama', 'disk', 'ssd', 'dahili'],
    unitGroups: GB_TB_GROUPS,
    keywordWindow: GB_TB_KEYWORD_WINDOW,
    extraOverWords: ['yüksek', 'geniş', 'büyük', 'bol', 'çok', 'en az'],
    extraUnderWords: ['düşük', 'küçük', 'en fazla'],
  },
  {
    key: 'battery_mah',
    keywords: null, // "mah" tek başına yeterince benzersiz
    unitGroups: [{ tokens: ['mah'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'uzun', 'en az'],
    extraUnderWords: ['düşük', 'kısa', 'en fazla'],
  },
  {
    key: 'main_camera_mp',
    // "kamera" anahtar kelimesi ZORUNLU DEĞİL — bu alanda (telefon
    // specs'inde) "MP" zaten neredeyse her zaman kameraya işaret ediyor
    // (ön kamera/telefoto/ultra geniş açı bu genel eşik modülünde ayrı
    // birer alan olarak takip edilmiyor). Önceden "kamera" şart
    // koşuluyordu ve "en az 50MP telefon" gibi (kamera kelimesi hiç
    // geçmeyen, son derece doğal) sorgular sessizce eşiksiz kalıyordu.
    // Ön kamera/selfie/telefoto/zoom/kamera düğmesi/kumanda ile
    // karışmasın diye excludeIf (negatif liste) YETERLİ koruma sağlıyor
    // — mevcut "camera" boolean filtresiyle AYNI dışlama seti.
    keywords: null,
    excludeIf: ['ön kamera', 'selfie', 'telefoto', 'zoom', 'uzak çekim', 'düğme', 'kumanda'],
    unitGroups: [{ tokens: ['mp', 'megapiksel'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'çok', 'en az'],
    extraUnderWords: ['düşük', 'en fazla'],
  },
  {
    key: 'screen_inch',
    // "ekran" anahtar kelimesi ZORUNLU DEĞİL — inç/inch birimi bu alanda
    // (telefon/laptop specs'i) zaten tek başına yeterince benzersiz, başka
    // hiçbir alan inç ile ölçülmüyor. Önceden "ekran" şart koşuluyordu ve
    // son derece doğal "15.6 inçten büyük laptop" gibi (ekran kelimesi
    // hiç geçmeyen) sorgular SESSİZCE eşiksiz kalıyordu.
    keywords: null,
    unitGroups: [{ tokens: ['inç', 'inch', '"'], multiplier: 1, style: 'decimal' }],
    extraOverWords: ['büyük', 'geniş', 'en az'],
    extraUnderWords: ['küçük', 'kompakt', 'mini', 'en fazla'],
  },
  {
    key: 'weight_g',
    keywords: null, // "kg/kilo/gram/gr" tek başına yeterince benzersiz
    unitGroups: [
      { tokens: ['kg', 'kilo'], multiplier: 1000, style: 'decimal' },
      { tokens: ['gram', 'gr'], multiplier: 1, style: 'grouped-integer' },
    ],
    extraOverWords: ['ağır', 'en az'],
    extraUnderWords: ['hafif', 'en fazla'],
  },
  {
    key: 'wired_charging_watts',
    keywords: null,
    excludeIf: ['kablosuz'], // "kablosuz X watt" -> wireless_charging_watts'a ait
    unitGroups: [{ tokens: ['w', 'watt'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'hızlı', 'güçlü', 'en az'],
    extraUnderWords: ['düşük', 'yavaş', 'en fazla'],
  },
  {
    key: 'wireless_charging_watts',
    keywords: ['kablosuz'],
    unitGroups: [{ tokens: ['w', 'watt'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'hızlı', 'en az'],
    extraUnderWords: ['düşük', 'en fazla'],
  },
  {
    key: 'screen_nits',
    keywords: null,
    unitGroups: [{ tokens: ['nit', 'nits'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'parlak', 'en az'],
    extraUnderWords: ['düşük', 'en fazla'],
  },
  {
    key: 'refresh_rate_hz',
    keywords: null,
    unitGroups: [{ tokens: ['hz'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'akıcı'],
    extraUnderWords: ['düşük'],
    // Yön kelimesi olmadan çıplak "144hz" → "en az 144Hz" (mevcut sabit
    // >=120 davranışının niyetiyle tutarlı — Hz her zaman ">=" anlamına
    // gelir). Diğer TÜM alanlardan farklı bir istisna.
    defaultDirectionIfBare: 'min',
  },
]);

const LAPTOP_NUMERIC_FIELDS = foldFieldTable([
  {
    key: 'ram_gb',
    keywords: [/\bram/],
    unitGroups: GB_TB_GROUPS,
    keywordWindow: GB_TB_KEYWORD_WINDOW,
    extraOverWords: ['yüksek', 'çok', 'bol', 'en az', 'asgari'],
    extraUnderWords: ['düşük', 'en fazla', 'azami'],
  },
  {
    key: 'storage_gb',
    keywords: ['depolama', 'disk', 'ssd', 'dahili'],
    unitGroups: GB_TB_GROUPS,
    keywordWindow: GB_TB_KEYWORD_WINDOW,
    extraOverWords: ['yüksek', 'geniş', 'büyük', 'bol', 'çok', 'en az'],
    extraUnderWords: ['düşük', 'küçük', 'en fazla'],
  },
  {
    key: 'battery_wh',
    keywords: null, // "wh" tek başına yeterince benzersiz
    unitGroups: [{ tokens: ['wh'], multiplier: 1, style: 'decimal' }],
    extraOverWords: ['yüksek', 'uzun', 'en az'],
    extraUnderWords: ['düşük', 'kısa', 'en fazla'],
  },
  {
    key: 'screen_inch',
    // "ekran" anahtar kelimesi ZORUNLU DEĞİL — inç/inch birimi bu alanda
    // (telefon/laptop specs'i) zaten tek başına yeterince benzersiz, başka
    // hiçbir alan inç ile ölçülmüyor. Önceden "ekran" şart koşuluyordu ve
    // son derece doğal "15.6 inçten büyük laptop" gibi (ekran kelimesi
    // hiç geçmeyen) sorgular SESSİZCE eşiksiz kalıyordu.
    keywords: null,
    unitGroups: [{ tokens: ['inç', 'inch', '"'], multiplier: 1, style: 'decimal' }],
    extraOverWords: ['büyük', 'geniş', 'en az'],
    extraUnderWords: ['küçük', 'kompakt', 'mini', 'en fazla'],
  },
  {
    key: 'weight_g',
    keywords: null,
    unitGroups: [
      { tokens: ['kg', 'kilo'], multiplier: 1000, style: 'decimal' },
      { tokens: ['gram', 'gr'], multiplier: 1, style: 'grouped-integer' },
    ],
    extraOverWords: ['ağır', 'en az'],
    extraUnderWords: ['hafif', 'en fazla'],
  },
  {
    key: 'cpu_cores',
    // Birimin kendisi ("çekirdek"/"core") zaten anlam taşıyor, ayrı bir
    // anahtar kelimeye gerek yok — ama Hz'nin aksine burada eski bir
    // "sabit varsayılan" davranış YOK, o yüzden yön kelimesi olmadan
    // (defaultDirectionIfBare YOK) hiçbir eşik uygulanmıyor.
    keywords: null,
    unitGroups: [{ tokens: ['çekirdek', 'core'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'çok', 'en az'],
    extraUnderWords: ['düşük', 'en fazla'],
  },
  {
    key: 'webcam_mp',
    keywords: ['webcam', 'kamera'],
    unitGroups: [{ tokens: ['mp', 'megapiksel'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'iyi', 'kaliteli', 'en az'],
    extraUnderWords: ['düşük', 'en fazla'],
  },
  {
    key: 'refresh_rate_hz',
    keywords: null,
    unitGroups: [{ tokens: ['hz'], multiplier: 1, style: 'grouped-integer' }],
    extraOverWords: ['yüksek', 'akıcı'],
    extraUnderWords: ['düşük'],
    defaultDirectionIfBare: 'min',
  },
]);

// pool: aday ürün dizisi (her biri .specs taşıyor), thresholdsByField:
// { [alanAdı]: {min,max} } — bir önceki adayı (SADECE bu alan
// uygulanmadan önceki hâliyle) korur ki bir kriter sıfır sonuç verirse
// SADECE o kriter atlanıp önceki (başarıyla uygulanmış) kriterler
// korunsun — fiyat filtresindeki "budgetUnmet" davranışıyla birebir aynı
// "dürüst geri düşüş" mantığı, ama artık her sayısal alan için ayrı ayrı.
function applyNumericThresholds(pool, thresholdsByField) {
  let currentPool = pool;
  const unmet = [];
  for (const [fieldKey, threshold] of Object.entries(thresholdsByField)) {
    const filtered = currentPool.filter(c => {
      const raw = c.specs ? c.specs[fieldKey] : undefined;
      if (raw == null) return false;
      const v = Number(raw);
      if (Number.isNaN(v)) return false;
      if (threshold.min != null && v < threshold.min) return false;
      if (threshold.max != null && v > threshold.max) return false;
      return true;
    });
    if (filtered.length > 0) currentPool = filtered;
    else unmet.push({ fieldKey, threshold });
  }
  return { pool: currentPool, unmet };
}

module.exports = {
  parseFieldThreshold,
  applyNumericThresholds,
  findDirection,
  formatFieldValue,
  formatNumericReason,
  NUMERIC_FIELD_LABELS,
  PHONE_NUMERIC_FIELDS,
  LAPTOP_NUMERIC_FIELDS,
  // Fiyat ayrıştırıcısıyla (price-filter.js) PAYLAŞILAN düşük seviyeli
  // yardımcılar — aynı "komşu alana sızma" korumasını fiyat için de
  // uygulayabilmek için dışa aktarılıyor.
  sliceForwardStoppingAtDigit,
  sliceBackwardStoppingAtDigit,
  hasAny,
  PREFIX_OVER_PHRASES,
  PREFIX_UNDER_PHRASES,
};
