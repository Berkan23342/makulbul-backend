// model-family.js — AI aramada kullanıcı bir MODEL AİLESİNİ adıyla yazdığında
// ("katana", "zenbook 14", "legion", "helios neo 16", "thinkpad") sonuçları o aileyle
// sınırlar.
//
// SORUN: tam model eşleştirmesi (exactMatch) en az 2 token + bir rakam ister
// ("katana 15" gibi); tek kelimelik "katana"/"zenbook" aramaları eşleşmeyip jenerik
// "en ucuz ürün" sonucuna düşüyordu (zenbook → Dell Pro 15 Essential).
//
// KURAL (muhafazakâr): sorgudaki ayırt edici kelime(ler) katalogdaki ürün adlarında
// geçiyorsa havuz o kelimelerin HEPSİNİ içeren ürünlerle sınırlanır. Hiçbir ürün
// stokta değilse ya da daraltma hiçbir şeyi daraltmıyorsa (ör. yalnızca marka adı)
// null döner ve eski davranış aynen sürer.

const { foldTurkish } = require('./text-normalize');

// Ürün adında geçse bile "model ailesi" sayılmayan genel/teknik kelimeler.
const GENERIC = new Set([
  'pro', 'plus', 'max', 'ultra', 'air', 'gen', 'gaming', 'lite', 'slim', 'book', 'mini', 'new', 'core', 'intel', 'amd', 'nvidia',
  'oled', 'amoled', 'fhd', 'qhd', 'wuxga', 'wqxga', 'ddr5', 'ddr4', 'ssd', 'freedos', 'windows', 'ubuntu', 'win11', 'dos',
  'laptop', 'notebook', 'bilgisayar', 'telefon', 'dizustu', 'ryzen', 'geforce', 'radeon', 'graphics', 'display', 'edition',
]);
// Rakamdan sonra gelirse o rakam model numarası değil, ölçü birimidir ("16 gb", "144 hz").
const UNIT_AFTER = /^(gb|tb|inc|inch|hz|w|mah|tl|bin|lira|ram|ssd|mp|kg)$/;

const words = s => foldTurkish(String(s || '')).split(/[^a-z0-9]+/).filter(Boolean);

function narrowByModelFamily(candidates, foldedQuery) {
  if (!candidates.length) return null;
  const nameSets = candidates.map(c => new Set(words(`${c.canonical_name} ${c.brand || ''}`)));
  const vocab = new Set();
  for (const set of nameSets) for (const t of set) vocab.add(t);

  const qw = words(foldedQuery);
  const chosen = [];
  qw.forEach((t, i) => {
    if (t.length < 3 || /^\d+$/.test(t) || GENERIC.has(t) || !vocab.has(t)) return;
    chosen.push(t);
    const next = qw[i + 1];
    if (next && /^\d{1,4}$/.test(next) && vocab.has(next) && !UNIT_AFTER.test(qw[i + 2] || '')) chosen.push(next);
  });
  if (!chosen.length) return null;

  const narrowed = candidates.filter((c, i) => chosen.every(t => nameSets[i].has(t)));
  if (!narrowed.length || narrowed.length === candidates.length) return null;
  const inStock = narrowed.filter(c => c.best_price !== null);
  if (!inStock.length) return null;
  return { pool: inStock, tokens: [...new Set(chosen)] };
}

module.exports = { narrowByModelFamily };
