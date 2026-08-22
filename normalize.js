// normalize.js — Ham satıcı başlığını, veritabanındaki normalized_key
// formatına yakın bir stringe çevirir. Bu, similarity() karşılaştırması
// yapmadan ÖNCE gürültüyü (renk, marketing kelimeleri) temizlemek içindir.
//
// NOT: Bu basit kural tabanlı bir temizleyicidir. Gerçek üretimde marka
// bazlı özel kurallar (bkz. README.md - "Telefon Pilotu" notları) ve daha
// geniş kelime listeleri eklemek gerekir. Burası başlangıç noktasıdır.

const COLOR_WORDS = [
  'mavi', 'siyah', 'beyaz', 'kırmızı', 'yeşil', 'sarı', 'mor', 'pembe',
  'gri', 'altın', 'gümüş', 'lacivert', 'turuncu', 'titanyum', 'doğal titanyum',
  'natural titanium', 'desert titanium', 'blue', 'black', 'white', 'red',
  'green', 'yellow', 'purple', 'pink', 'gray', 'grey', 'gold', 'silver',
  'rose gold', 'graphite', 'midnight', 'starlight', 'jade', 'lavender',
];

const NOISE_PHRASES = [
  'cep telefonu', 'akıllı telefon', 'smartphone', 'apple türkiye garantili',
  'distribütör garantili', 'ithalatçı garantili', 'resmi distribütör',
  'garantili', 'ücretsiz kargo', 'hızlı kargo', 'yeni', 'orijinal', 'sıfır',
  'kutulu', 'faturalı', '(yenilenmiş)', 'yenilenmiş',
];

function normalizeTitle(rawTitle) {
  let s = ' ' + rawTitle.toLowerCase() + ' ';

  // Önce çok kelimeli marketing ifadelerini sil
  for (const phrase of NOISE_PHRASES) {
    s = s.split(phrase).join(' ');
  }
  // Renk kelimelerini sil (kelime sınırlarına dikkat ederek)
  for (const color of COLOR_WORDS) {
    const re = new RegExp(`\\b${color}\\b`, 'g');
    s = s.replace(re, ' ');
  }

  s = s
    .replace(/[()]/g, ' ')          // parantezleri sil
    .replace(/[^a-z0-9ığüşöç\s]/g, ' ')  // harf/rakam dışını sil
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');           // boşlukları tireye çevir

  return s;
}

module.exports = { normalizeTitle };
