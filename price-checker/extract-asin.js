// price-checker/extract-asin.js — bir Amazon TR product_url'inden ASIN çıkarır.
// Kataloğumuzda iki tür Amazon linki var:
//   1) Gerçek ürün sayfası: /dp/{ASIN} veya /gp/product/{ASIN} (bazen aradan
//      "Apple-iPhone-15-Plus-512" gibi bir slug da geçebiliyor)
//   2) Arama sonucu fallback'i: /s?k=... — bu bir ASIN İÇERMEZ, çünkü elle
//      araştırma sırasında Amazon'da tam eşleşen bir ürün sayfası
//      bulunamamıştı. Bu linkler otomatik fiyat kontrolüne dahil edilemez.
const ASIN_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i;

function extractAsin(productUrl) {
  const match = String(productUrl || '').match(ASIN_RE);
  return match ? match[1].toUpperCase() : null;
}

module.exports = { extractAsin };
