// query-relevance.js — AI aramada, telefon/laptop ile HİÇ ilgisi olmayan
// sorguları ("bisiklet", "pizza tarifi", rastgele harfler) tespit eder.
//
// SORUN: kural tabanlı ayrıştırıcı bir sorguda hiçbir kriter bulamayınca
// sessizce jenerik "en ucuz/ilk" sonuca düşüyordu — "bisiklet" yazan
// kullanıcıya rastgele bir telefon önerilmesinin sebebi bu. Anlamsız bir
// öneri, "bulunamadı" demekten çok daha kötü (güveni bozar).
//
// KURAL (bilinçli olarak MUHAFAZAKÂR — gerçek bir aramayı asla engellememeli):
// sorgu ilgisiz sayılır ANCAK VE ANCAK hepsi birden doğruysa:
//   1) kural tabanlı (+ varsa yapay zeka yedeği) hiçbir kriter bulunmadı,
//   2) sorguda telefon/laptop/alışveriş niyeti taşıyan hiçbir kelime yok,
//   3) sorgudaki hiçbir kelime katalogdaki bir ürün adında geçmiyor
//      ("katana", "zenbook", "galaxy" gibi yalnızca model adıyla arayanlar
//      için; "pro/max/air" gibi aşırı genel parçalar sayılmaz).

const { foldTurkish } = require('./text-normalize');

// Katlanmış (ascii, küçük harf) metinde ALT DİZE olarak aranır.
const INTENT_STEMS = [
  'telefon', ' tel ', 'mobil', 'cep ', ' cep', 'smartphone', 'akilli', 'laptop', 'bilgisayar', 'notebook', 'dizustu', 'ultrabook', 'macbook', ' pc',
  'ucuz', 'ekonomik', 'uygun', 'fiyat', 'pahali', 'butce', ' tl', 'lira', 'bin ',
  'oner', 'tavsiye', 'en iyi', 'model', 'marka', 'karsilastir', 'alternatif',
  'ram', ' gb', ' tb', 'ssd', 'depolama', 'hafiza', 'ekran', 'inc', 'pil', 'batarya', 'sarj', 'kamera', 'islemci', 'ekran karti',
  '5g', 'nfc', ' hz', 'oled', 'amoled', 'parlak', 'cozunurluk',
  'oyun', 'ogrenci', 'ofis', 'tasarim', 'yazilim', 'is icin', 'video', 'montaj',
  'guclu', 'hizli', 'hafif', 'kompakt', 'buyuk', 'kucuk', 'yeni', 'dayanikli', 'agirlik', 'su gecirmez',
  'ios', 'android', 'windows', ' mac ',
];
const GENERIC_NAME_TOKENS = new Set(['pro', 'plus', 'max', 'ultra', 'air', 'gen', 'gaming', 'lite', 'slim', 'book', 'mini', 'new', 'the', 'for', 'and', 'with', 'edge', 'one', 'core', 'intel', 'amd', 'nvidia']);

const tokenize = s => String(s).split(/[^a-z0-9]+/).filter(Boolean);

let nameTokenCache = { at: 0, byCategory: {} };
async function loadNameTokens(pool, category) {
  if (Date.now() - nameTokenCache.at > 10 * 60 * 1000) nameTokenCache = { at: Date.now(), byCategory: {} };
  if (nameTokenCache.byCategory[category]) return nameTokenCache.byCategory[category];
  const { rows } = await pool.query(
    `SELECT p.canonical_name, b.name AS brand FROM products p
     JOIN categories c ON c.id = p.category_id JOIN brands b ON b.id = p.brand_id WHERE c.slug = $1`, [category]);
  const set = new Set();
  for (const r of rows) for (const t of tokenize(foldTurkish(r.canonical_name + ' ' + r.brand))) {
    if (t.length >= 3 && !GENERIC_NAME_TOKENS.has(t) && !/^\d+$/.test(t)) set.add(t);
  }
  nameTokenCache.byCategory[category] = set;
  return set;
}

function hasIntentWord(foldedQuery) {
  const padded = ' ' + foldedQuery + ' ';
  return INTENT_STEMS.some(stem => padded.includes(stem));
}

/**
 * @returns {Promise<boolean>} true → sorgu telefon/laptop aramasıyla ilgisiz görünüyor
 */
async function isOffTopicQuery(pool, query, category, { hasCriteria }) {
  if (hasCriteria) return false;
  const q = foldTurkish(query || '');
  if (!q.trim()) return false;
  if (hasIntentWord(q)) return false;
  const names = await loadNameTokens(pool, category);
  if (tokenize(q).some(t => t.length >= 3 && names.has(t))) return false;
  return true;
}

module.exports = { isOffTopicQuery, hasIntentWord };
