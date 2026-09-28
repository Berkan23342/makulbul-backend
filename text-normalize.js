// text-normalize.js — Türkçe özel karakterleri (ı/İ/ş/Ş/ğ/Ğ/ü/Ü/ö/Ö/ç/Ç)
// ASCII karşılıklarına indirgeyen ("fold" eden) paylaşılan yardımcı.
//
// NEDEN: gerçek kullanıcılar (özellikle telefon klavyelerinde otomatik
// düzeltme kapalıyken, yabancı klavye düzeninde ya da alışkanlıkla)
// Türkçe özel karakter OLMADAN yazıyor — "güçlü" yerine "guclu", "yüksek
// ram'li" yerine "yuksek ramli", "öğrenci için" yerine "ogrenci icin".
// Sorgu ayrıştırma daha önce sadece `.toLowerCase()` uyguluyordu — bu,
// büyük/küçük harfi normalize eder ama "ü"yü "u"ya çevirmez, bu yüzden
// TÜM bu son derece yaygın yazım biçimleri hiçbir filtreyi tetiklemeden
// SESSİZCE jenerik "en ucuz" sonucuna düşüyordu.
//
// UYGULAMA: 'ı'/'İ' NFD ile ayrışmıyor (temel karakterler, birleşik işaret
// değil), bu yüzden elle değiştiriliyor. ç/ş/ğ/ö/ü ise NFD ile temel harf
// + birleşik işarete ayrışıyor (ör. 'ç' -> 'c' + BİRLEŞİK SEDİLLA); bu
// birleşik işaretleri (Unicode ̀-ͯ aralığı) silmek geri kalan
// hepsini tek seferde hallediyor.
function foldTurkish(input) {
  if (input == null) return '';
  return String(input)
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/i̇/g, 'i') // 'İ'.toLowerCase() bazı ortamlarda 'i' + birleşik nokta (U+0307) üretir
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

module.exports = { foldTurkish };
