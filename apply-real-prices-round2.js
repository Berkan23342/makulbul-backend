// apply-real-prices-round2.js — 31 üründeki (tüm Apple + tüm Xiaomi
// ekosistemi) eski/doğrulanmamış fiyat verisini, 3 araştırma turundan
// gelen GERÇEK Hepsiburada/Trendyol/Amazon TR verisiyle değiştirir.
//
// KRİTİK BULGU: Araştırma, kataloğumuzdaki birçok "sabit kapasiteli"
// ürünün artık o TAM kapasitede sıfır satılmadığını ortaya çıkardı —
// ama AYNI model FARKLI bir kapasitede gerçekten satışta. Bu yüzden
// her teklif kendi GERÇEK storage_gb/color'ıyla ekleniyor (ürünün
// specs.storage_gb'siyle uyuşmasa bile) — bkz. add-offer-variants.js.
//
// KURALLAR:
// - "Yenilenmiş" (refurbished) fiyatlar HİÇBİR ZAMAN "sıfır" gibi
//   uygulanmadı — bir ürün sadece yenilenmiş olarak bulunduysa o
//   satıcı için teklif eklenmedi (satış yok kalıyor).
// - Sadece belirsiz bir ARALIK bulunan (tek fiyat teyit edilemeyen)
//   durumlarda aralığın alt sınırı kullanıldı.
// - Gerçek bir ürün sayfası URL'i verilmemişse (sadece fiyat
//   bulunmuşsa) searchUrl() ile satıcının kendi arama sonucu linkine
//   düşülüyor — UYDURMA bir ürün sayfası linki asla yazılmıyor.
// - İki üründe (iPhone 16 Pro Max, iPhone 17e) satıcılar arası büyük
//   fiyat farkı var (muhtemelen resmi distribütör/ithalatçı garantisi
//   farkı) — GERÇEK, sayfa-doğrulanmış rakamlar olduğu gibi uygulandı.
//
// Kullanım: node apply-real-prices-round2.js (önce add-offer-variants.js
// çalıştırılmış olmalı)

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function searchUrl(sellerName, query) {
  const q = encodeURIComponent(query);
  switch (sellerName) {
    case 'Hepsiburada': return `https://www.hepsiburada.com/ara?q=${q}`;
    case 'Trendyol': return `https://www.trendyol.com/sr?q=${q}`;
    case 'Amazon TR': return `https://www.amazon.com.tr/s?k=${q}`;
    default: return null;
  }
}

// Her ürün için: offers dizisi { seller, price, storage_gb, color, url? }.
// url verilmemişse searchUrl() ile dürüst bir arama linki üretilir.
// Ürün hiç listelenmemişse (fully satış yok) boş dizi bırakılır.
const PRODUCTS = {
  // ---------------- XIAOMI EKOSİSTEMİ ----------------
  'POCO F7 256GB NFC': {
    offers: [], // Ne düz "F7" ne de bu kapasite hiçbir sitede bulunamadı
  },
  'POCO F7 Ultra 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 49999, storage_gb: 256, color: 'Siyah', url: 'https://www.hepsiburada.com/poco-f7-ultra-256-gb-12-gb-ram-poco-turkiye-garantili-siyah-pm-HBC0000HUW6L6' },
      { seller: 'Trendyol', price: 52699, storage_gb: 512, color: '' }, // sadece 512GB satılıyor
    ],
  },
  'POCO X7 Pro 256GB NFC': {
    offers: [
      { seller: 'Trendyol', price: 31899, storage_gb: 256, color: 'Siyah', url: 'https://www.trendyol.com/poco/x7-pro-8gb-ram-256gb-rom-siyah-p-887495928' },
      { seller: 'Amazon TR', price: 32500, storage_gb: 512, color: '' }, // sadece 512GB satılıyor
    ],
  },
  'Redmi Note 15 5G 256GB': {
    // ÖZEL DURUM: Türkiye'de bu taban model gerçekte 4G — "5G" adı ve
    // has_5g:true speki gerçeği yansıtmıyor. Bkz. renameProduct() bloğu.
    renameTo: { canonical_name: 'Redmi Note 15 256GB', normalized_key: 'redmi-note-15-256gb' },
    specPatch: { has_5g: false },
    offers: [
      { seller: 'Hepsiburada', price: 16199, storage_gb: 256, color: '' },
      { seller: 'Trendyol', price: 15799, storage_gb: 256, color: '' },
    ],
  },
  'Redmi Note 15 Pro 5G 256GB NFC': {
    offers: [
      { seller: 'Hepsiburada', price: 26249, storage_gb: 256, color: 'Siyah', url: 'https://www.hepsiburada.com/redmi-note-15-pro-5g-256-gb-8-gb-ram-xiaomi-turkiye-garantili-siyah-p-HBCV0000BMXZQT' },
      { seller: 'Trendyol', price: 25554, storage_gb: 256, color: 'Titanyum Gri', url: 'https://www.trendyol.com/xiaomi/redmi-note-15-pro-5g-8-gb-256-gb-titanyum-gri-xiaomi-turkiye-garantili-p-1074984348' },
      // Amazon TR: tam SKU sayfası var ama "şu anda mevcut değil" (stokta yok) — teklif eklenmedi
    ],
  },
  'Xiaomi 15T 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 44644.90, storage_gb: 256, color: 'Gri', url: 'https://www.hepsiburada.com/xiaomi-15t-256-gb-12-gb-ram-xiaomi-turkiye-garantili-gri-p-HBCV00009X6JPW' },
      { seller: 'Trendyol', price: 44244.90, storage_gb: 512, color: '' }, // sadece 512GB satılıyor
    ],
  },
  'Xiaomi 15T Pro 256GB': {
    offers: [
      { seller: 'Trendyol', price: 49490, storage_gb: 512, color: '' }, // sadece 512GB/1TB satılıyor
      { seller: 'Amazon TR', price: 61999, storage_gb: 512, color: '' },
    ],
  },
  'Xiaomi 17 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 74999, storage_gb: 512, color: '' }, // sadece 512GB satılıyor
      { seller: 'Trendyol', price: 74399, storage_gb: 512, color: '' },
    ],
  },
  'Xiaomi 17 Pro 256GB': {
    offers: [], // Bu model TR'de hiç satılmıyor, sadece farklı bir hat olan "17T Pro" var
  },
  'Xiaomi 17 Ultra 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 109999, storage_gb: 512, color: '' }, // sadece 512GB satılıyor
      { seller: 'Trendyol', price: 110000, storage_gb: 512, color: '' },
    ],
  },

  // ---------------- APPLE — ESKİ MODELLER ----------------
  'Apple iPhone 13 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 49999, storage_gb: 128, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-13-128-gb-siyah-p-HBCV00000ODHHF' },
      { seller: 'Trendyol', price: 54999, storage_gb: 128, color: 'Yıldız Işığı', url: 'https://www.trendyol.com/apple/iphone-13-128-gb-yildiz-isigi-cep-telefonu-apple-turkiye-garantili-p-150059024' },
      { seller: 'Amazon TR', price: 46466.88, storage_gb: 128, color: 'Gece Yarısı', url: 'https://www.amazon.com.tr/dp/B09G9RQTP3' },
    ],
  },
  'Apple iPhone 13 Pro 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 81999, storage_gb: 128, color: 'Kurşun Gri', url: 'https://www.hepsiburada.com/apple-iphone-13-pro-128-gb-kursun-gri-p-HBCV00000ODIGK' },
      // Trendyol/Amazon: sadece "Yenilenmiş" bulundu, sıfır yok — eklenmedi
    ],
  },
  'Apple iPhone 13 Pro Max 128GB': {
    offers: [], // Üç sitede de sıfır 128GB stok yok, sadece 512GB/1TB veya Yenilenmiş
  },
  'Apple iPhone 13 mini 128GB': {
    offers: [], // Üç sitede de sıfır stok yok (aksesuar veya Yenilenmiş)
  },
  'Apple iPhone 14 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 52977.54, storage_gb: 128, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-14-128-gb-siyah-p-HBCV00002VUQ7R' },
      { seller: 'Trendyol', price: 52199, storage_gb: 128, color: 'Mavi', url: 'https://www.trendyol.com/apple/iphone-14-128-gb-mavi-p-355707135' },
      // Amazon: sadece 512GB Plus var — eklenmedi
    ],
  },
  'Apple iPhone 14 Plus 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 74999, storage_gb: 128, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-14-plus-128-gb-siyah-p-HBCV00002W2807' },
      { seller: 'Trendyol', price: 74999, storage_gb: 128, color: 'Gece Yarısı', url: 'https://www.trendyol.com/apple/iphone-14-plus-128-gb-gece-yarisi-p-355707170' },
      // Amazon: sadece 512GB var — eklenmedi
    ],
  },
  'Apple iPhone 14 Pro 128GB': {
    offers: [], // Üç sitede de sıfır yok, sadece Yenilenmiş
  },
  'Apple iPhone 14 Pro Max 128GB': {
    offers: [], // Üç sitede de sıfır yok, sadece Yenilenmiş
  },
  'Apple iPhone 15 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 48999, storage_gb: 128, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-15-128-gb-siyah-p-HBCV00004X9ZCH' },
      { seller: 'Trendyol', price: 49499, storage_gb: 128, color: 'Mavi', url: 'https://www.trendyol.com/apple/iphone-15-128-gb-mavi-p-762254881' },
      { seller: 'Amazon TR', price: 48999, storage_gb: 128, color: 'Siyah', url: 'https://www.amazon.com.tr/dp/B0CHXCFS1J' },
    ],
  },
  'Apple iPhone 15 Plus 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 74999, storage_gb: 128, color: '', url: 'https://www.hepsiburada.com/iphone-15-plus-128-gb-pm-HBC00004XA25S' },
      // Trendyol: sadece Yenilenmiş, Amazon: sadece 512GB — eklenmedi
    ],
  },
  'Apple iPhone 15 Pro 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 117000, storage_gb: 128, color: 'Naturel Titanyum', url: 'https://www.hepsiburada.com/apple-iphone-15-pro-128-gb-naturel-titanyum-p-HBCV00004XA874' },
      // Trendyol: sadece Yenilenmiş, Amazon: bulunamadı — eklenmedi
    ],
  },

  // ---------------- APPLE — YENİ MODELLER ----------------
  'Apple iPhone 15 Pro Max 256GB': {
    offers: [], // Üç sitede de sıfır yok, sadece Yenilenmiş (Amazon'da hiç yok)
  },
  'Apple iPhone 16 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 63999, storage_gb: 128, color: 'Pembe', url: 'https://www.hepsiburada.com/apple-iphone-16-128gb-pembe-p-HBCV00006Y4HU3' },
      { seller: 'Trendyol', price: 63999, storage_gb: 128, color: 'Siyah', url: 'https://www.trendyol.com/apple/iphone-16-128gb-siyah-p-857296095' },
      { seller: 'Amazon TR', price: 62749, storage_gb: 128, color: 'Lacivert Taş', url: 'https://www.amazon.com.tr/dp/B0DGJ9XTZ1' },
    ],
  },
  'Apple iPhone 16 Plus 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 77499, storage_gb: 128, color: 'Lacivert Taş', url: 'https://www.hepsiburada.com/apple-iphone-16-plus-128gb-lacivert-tas-p-HBCV00006Y4HUD' },
      { seller: 'Trendyol', price: 75999, storage_gb: 128, color: 'Deniz Mavisi', url: 'https://www.trendyol.com/apple/iphone-16-plus-128gb-deniz-mavisi-p-857296119' },
      { seller: 'Amazon TR', price: 73599, storage_gb: 128, color: 'Deniz Mavisi', url: 'https://www.amazon.com.tr/dp/B0DGJHLPQS' },
    ],
  },
  'Apple iPhone 16 Pro 128GB': {
    offers: [
      { seller: 'Hepsiburada', price: 119399, storage_gb: 128, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-16-pro-128gb-siyah-p-HBCV00006Y4HBH' },
      // Trendyol: sadece Yenilenmiş, Amazon: bulunamadı — eklenmedi
    ],
  },
  'Apple iPhone 16 Pro Max 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 121221.46, storage_gb: 256, color: 'Çöl Titanyum', url: 'https://www.hepsiburada.com/apple-iphone-16-pro-max-256gb-col-titanyum-p-HBCV00006Y4HC5' },
      { seller: 'Trendyol', price: 149999, storage_gb: 256, color: 'Çöl Titanyum', url: 'https://www.trendyol.com/apple/iphone-16-pro-max-256gb-col-titanyum-p-857296109' },
      { seller: 'Amazon TR', price: 120000, storage_gb: 256, color: 'Siyah Titanyum', url: 'https://www.amazon.com.tr/dp/B0DGJJY3W1' },
    ],
  },
  'Apple iPhone 17 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 82599, storage_gb: 256, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-17-256-gb-siyah-p-HBCV00009Z3Y49' },
      { seller: 'Trendyol', price: 84999, storage_gb: 256, color: 'Siyah', url: 'https://www.trendyol.com/apple/iphone-17-256gb-siyah-p-985256842' },
      { seller: 'Amazon TR', price: 82599, storage_gb: 256, color: 'Siyah', url: 'https://www.amazon.com.tr/dp/B0FQFBXXWF' },
    ],
  },
  'Apple iPhone 17 Pro 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 107499, storage_gb: 256, color: 'Kozmik Turuncu', url: 'https://www.hepsiburada.com/apple-iphone-17-pro-256-gb-kozmik-turuncu-p-HBCV00009Z3XL5' },
      { seller: 'Trendyol', price: 107999, storage_gb: 256, color: 'Gümüş', url: 'https://www.trendyol.com/apple/iphone-17-pro-256gb-gumus-p-985256847' },
      { seller: 'Amazon TR', price: 105933.75, storage_gb: 256, color: 'Kozmik Turuncu', url: 'https://www.amazon.com.tr/dp/B0FQFYN66J' },
    ],
  },
  'Apple iPhone 17 Pro Max 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 118999, storage_gb: 256, color: 'Kozmik Turuncu', url: 'https://www.hepsiburada.com/apple-iphone-17-pro-max-256-gb-kozmik-turuncu-p-HBCV00009Z3Z8C' },
      { seller: 'Trendyol', price: 119999, storage_gb: 256, color: 'Gümüş', url: 'https://www.trendyol.com/apple/iphone-17-pro-max-256gb-gumus-p-985256821' },
      { seller: 'Amazon TR', price: 119999, storage_gb: 256, color: 'Gümüş', url: 'https://www.amazon.com.tr/dp/B0FQG8NP4B' },
    ],
  },
  'Apple iPhone 17e 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 62700, storage_gb: 256, color: 'Siyah', url: 'https://www.hepsiburada.com/apple-iphone-17e-256-gb-siyah-p-HBCV0000D58K86' },
      { seller: 'Trendyol', price: 89999, storage_gb: 256, color: 'Siyah', url: 'https://www.trendyol.com/apple/iphone-17e-256gb-siyah-p-1113019214' },
      { seller: 'Amazon TR', price: 59999, storage_gb: 256, color: 'Açık Pembe', url: 'https://www.amazon.com.tr/dp/B0GQV4RQKK' },
    ],
  },
  'Apple iPhone Air 256GB': {
    offers: [
      { seller: 'Hepsiburada', price: 79499, storage_gb: 256, color: 'Uzay Siyahı', url: 'https://www.hepsiburada.com/apple-iphone-air-256-gb-uzay-siyahi-p-HBCV00009Z40TG' },
      { seller: 'Trendyol', price: 78999, storage_gb: 256, color: 'Uzay Siyahı', url: 'https://www.trendyol.com/apple/iphone-air-256gb-uzay-siyahi-p-985256818' },
      { seller: 'Amazon TR', price: 78999, storage_gb: 256, color: 'Pamuk Beyazı', url: 'https://www.amazon.com.tr/dp/B0FQFGCBCW' },
    ],
  },
};

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: sellerRows } = await client.query(`SELECT id, name FROM sellers`);
    const sellerId = Object.fromEntries(sellerRows.map(r => [r.name, r.id]));

    let totalOffersInserted = 0, totalProductsCleared = 0;

    for (const [name, data] of Object.entries(PRODUCTS)) {
      const { rows: prodRows } = await client.query(`SELECT id, canonical_name FROM products WHERE canonical_name = $1`, [name]);
      if (prodRows.length === 0) {
        console.log(`✘ ÜRÜN BULUNAMADI (isim uyuşmuyor): ${name}`);
        continue;
      }
      const pid = prodRows[0].id;

      // Redmi Note 15 5G özel durumu: yeniden adlandır + spec düzelt.
      if (data.renameTo) {
        await client.query(
          `UPDATE products SET canonical_name = $1, normalized_key = $2, specs = specs || $3::jsonb WHERE id = $4`,
          [data.renameTo.canonical_name, data.renameTo.normalized_key, JSON.stringify(data.specPatch || {}), pid]
        );
        console.log(`✔ yeniden adlandırıldı: "${name}" → "${data.renameTo.canonical_name}" (has_5g düzeltildi)`);
      }

      // Bu ürünün TÜM eski tekliflerini (hangi satıcıdan olursa olsun,
      // eski tek-varyantlı kurgusal veriler dahil) temizle — önce
      // price_history'yi (FK bağımlılığı), sonra offers'ı.
      await client.query(
        `DELETE FROM price_history WHERE offer_id IN (SELECT id FROM offers WHERE product_id = $1)`,
        [pid]
      );
      const del = await client.query(`DELETE FROM offers WHERE product_id = $1`, [pid]);
      totalProductsCleared++;

      for (const offer of data.offers) {
        const sid = sellerId[offer.seller];
        if (!sid) throw new Error(`Bilinmeyen satıcı: ${offer.seller}`);
        const url = offer.url || searchUrl(offer.seller, data.renameTo ? data.renameTo.canonical_name : name);
        await client.query(
          `INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency, storage_gb, color, in_stock, shipping_cost)
           VALUES ($1, $2, $3, $4, $4, $5, 'TRY', $6, $7, true, 0)`,
          [pid, sid, data.renameTo ? data.renameTo.canonical_name : name, url, offer.price, offer.storage_gb, offer.color]
        );
        totalOffersInserted++;
      }

      console.log(`✔ ${data.renameTo ? data.renameTo.canonical_name : name}: eski ${del.rowCount} teklif silindi, ${data.offers.length} gerçek teklif eklendi`);
    }

    await client.query('COMMIT');
    console.log(`\n✔ Tamamlandı. ${totalProductsCleared} ürün işlendi, ${totalOffersInserted} gerçek teklif eklendi.`);
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
