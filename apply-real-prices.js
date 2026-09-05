// apply-real-prices.js — kataloğun 48 ürününü GERÇEK Hepsiburada/
// Trendyol/Amazon TR fiyat+link verisiyle günceller. Bu üç satıcı
// DIŞINDAKİ hiçbir teklif artık sitede gösterilmiyor (bkz. server.js
// ALLOWED_SELLERS) — bu script veriyi de o gerçeğe uydurur: izin
// verilmeyen satıcılardan gelen ESKİ (tahmini/kurgusal) teklifler
// silinir, üç izinli satıcı için ARAŞTIRILMIŞ gerçek fiyat+link
// varsa upsert edilir, yoksa o satıcı için teklif hiç oluşturulmaz
// (ürünün o satıcıda gerçekten satılmadığı anlamına gelir).
//
// REAL_PRICES: canonical_name -> { Hepsiburada: {price, url} | null,
// Trendyol: {...} | null, 'Amazon TR': {...} | null }. `null` = o
// satıcıda GERÇEKTEN bulunamadı (uydurma bir fiyat yazılmadı).
//
// Kullanım: node apply-real-prices.js

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const ALLOWED_SELLERS = ['Hepsiburada', 'Trendyol', 'Amazon TR'];

// Araştırma ajanlarından dönen GERÇEK veri. Sadece bu turda TAMAMLANMIŞ
// iki araştırma (Samsung; Google/OnePlus/Sony/Honor) burada — Apple ve
// Xiaomi araştırmaları kullanıcı isteğiyle yarıda durdurulduğu için o
// 31 ürüne HİÇ dokunulmuyor (script onları atlıyor, eski verileri
// olduğu gibi kalıyor).
//
// Google/Pixel, OnePlus, Sony/Xperia, Honor: canlı site aramasıyla
// doğrulandı — Hepsiburada/Trendyol/Amazon.com.tr'nin HİÇBİRİNDE bu 8
// modelden hiçbiri satılmıyor (OnePlus artık 15/15R nesliyle
// değiştirilmiş, Pixel/Xperia/Honor bu üç sitede hiç yok). Üçü de null.
const REAL_PRICES = {
  'Google Pixel 10 256GB': { Hepsiburada: null, Trendyol: null, 'Amazon TR': null },
  'Google Pixel 10 Pro 256GB': { Hepsiburada: null, Trendyol: null, 'Amazon TR': null },
  'OnePlus 13 256GB': { Hepsiburada: null, Trendyol: null, 'Amazon TR': null },
  'OnePlus 13R 256GB': { Hepsiburada: null, Trendyol: null, 'Amazon TR': null },
  'Sony Xperia 1 VII 256GB': { Hepsiburada: null, Trendyol: null, 'Amazon TR': null },
  'Sony Xperia 10 VII 128GB': { Hepsiburada: null, Trendyol: null, 'Amazon TR': null },
  'Honor 400 Pro 256GB': { Hepsiburada: null, Trendyol: null, 'Amazon TR': null },
  'Honor Magic7 Pro 256GB': { Hepsiburada: null, Trendyol: null, 'Amazon TR': null },

  // Samsung: bot-korumaları yüzünden sayfa-sayfa fetch yapılamadı, arama
  // sonucu snippet'lerinden ve (tek bir üründe, S26 Ultra/Amazon TR)
  // canlı tarayıcı doğrulamasından derlendi. Ajanın kendi "bulunamadı"
  // dediği fiyatlar null bırakıldı (fiyat belirsizse hiç yazılmıyor).
  // Ajan spesifik bir ürün sayfası URL'i VERMEDİĞİNDE (sadece bir fiyat
  // aralığı/kategori sayfası bulduğunda) url alanı `null` bırakılıyor —
  // aşağıda main() bu durumda GERÇEK bir ürün sayfası UYDURMAK yerine
  // searchUrl() ile dürüst bir arama sonucu linkine düşüyor.
  'Samsung Galaxy A36 5G 256GB': {
    Hepsiburada: { price: 20899, url: 'https://www.hepsiburada.com/galaxy-a36-5g-akilli-telefon-256gb-depolama-8gb-ram-siyah-6x-isletim-sistemi-guncellemesi-buyuk-ekran-sekiz-cekirdekli-islemci-pm-HBC0000EVTG2Q' },
    Trendyol: null, // ajan: net fiyat teyit edilemedi (17.500-20.000 TL aralığı gözlendi)
    'Amazon TR': { price: 27999, url: 'https://www.amazon.com.tr/Samsung-Android-Depolama-G%C3%BCncellemesi-%C3%87ekirdekli/dp/B0F1FRFGVY' },
  },
  'Samsung Galaxy A56 5G 256GB': {
    Hepsiburada: { price: 24781, url: 'https://www.hepsiburada.com/samsung-galaxy-a56-5g-256-gb-8-gb-ram-samsung-turkiye-garantili-siyah-p-HBCV000088BXWW' },
    Trendyol: { price: 24399, url: 'https://www.trendyol.com/samsung/galaxy-a56-5g-256-gb-siyah-cep-telefonu-p-917839674' },
    'Amazon TR': { price: 24251, url: 'https://www.amazon.com.tr/Samsung-Android-Telefon-Depolama-Y%C3%BCkseltmesi/dp/B0F1FQZWLY' },
  },
  'Samsung Galaxy S25 FE 256GB': {
    Hepsiburada: { price: 37499, url: 'https://www.hepsiburada.com/samsung-galaxy-s25-fe-256-gb-8-gb-ram-samsung-turkiye-garantili-beyaz-p-HBCV00009S6B29' },
    Trendyol: null, // ajan: 37.799 TL search'te görüldü ama sayfa teyit edilemedi
    'Amazon TR': { price: 40536, url: 'https://www.amazon.com.tr/Samsung-Telefon-Depolama-Tasar%C4%B1m-Garantili/dp/B0FPRKC6CN' },
  },
  'Samsung Galaxy S26 256GB': {
    Hepsiburada: { price: 57234, url: 'https://www.hepsiburada.com/samsung-galaxy-s26-256-gb-12-gb-ram-samsung-turkiye-garantili-beyaz-p-HBCV0000CVH2KP' },
    Trendyol: null, // ajan: 57.899-58.149 TL aralığı görüldü ama tekil sayfa teyit edilemedi
    'Amazon TR': { price: 56949, url: 'https://www.amazon.com.tr/Samsung-Depolama-Telefonu-%C3%96zelle%C5%9Ftirilmi%C5%9F-4300mAh/dp/B0GP1GZKTC' },
  },
  'Samsung Galaxy S26 Ultra 256GB': {
    Hepsiburada: { price: 87109, url: null }, // ajan sadece kategori sayfası buldu, ürün sayfası teyit edilemedi
    Trendyol: { price: 87195, url: null }, // ajan hiç URL vermedi
    'Amazon TR': { price: 84659, url: 'https://www.amazon.com.tr/Samsung-Depolama-Telefonu-%C3%96zelle%C5%9Ftirilmi%C5%9F-Yerle%C5%9Fik/dp/B0GNZZ7RM9' }, // canlı tarayıcıda doğrulandı
  },
  'Samsung Galaxy S26+ 256GB': {
    Hepsiburada: { price: 75149, url: null }, // ajan URL vermedi
    Trendyol: { price: 69999, url: null }, // ajan URL vermedi
    'Amazon TR': null, // ajan: sayfa var ama kesin fiyat teyit edilemedi
  },
  'Samsung Galaxy Z Flip7 256GB': {
    Hepsiburada: { price: 65799, url: 'https://www.hepsiburada.com/samsung-galaxy-z-flip7-256-gb-12-gb-ram-samsung-turkiye-garantili-gece-siyahi-pm-HBC0000A5JKEW' },
    Trendyol: { price: 64890, url: 'https://www.trendyol.com/samsung/galaxy-z-flip7-sm-f766bzkgtur-12-gb-256-gb-akilli-telefon-gece-siyahi-samsung-turkiye-p-948923593' },
    'Amazon TR': null, // ajan: Mercan renk sayfası var ama fiyat teyit edilemedi
  },
  'Samsung Galaxy Z Flip7 FE 256GB': {
    Hepsiburada: { price: 58999, url: null }, // ajan URL vermedi
    Trendyol: { price: 55500, url: null }, // ajan URL vermedi
    'Amazon TR': null, // ajan: sayfa var ama fiyat teyit edilemedi
  },
  'Samsung Galaxy Z Fold7 512GB': {
    Hepsiburada: { price: 92340, url: null }, // ajan URL vermedi
    Trendyol: null, // ajan: 85.497-92.500 TL aralığı görüldü ama tekil sayfa teyit edilemedi
    'Amazon TR': { price: 90725, url: 'https://www.amazon.com.tr/Samsung-Galaxy-Fold7-Telefonu-Garantili/dp/B0FGQPJKP9' },
  },
};

// Ajan bir fiyat buldu ama spesifik ürün sayfasını doğrulayamadığında
// (url: null) GERÇEK bir ürün sayfası UYDURMAK yerine satıcının kendi
// arama sayfasına düşüyoruz — bu dürüst: kullanıcı en azından doğru
// satıcıda doğru ürünü arayan bir sonuç sayfasına gider, var olmayan
// bir sayfaya değil.
function searchUrl(sellerName, query) {
  const q = encodeURIComponent(query);
  switch (sellerName) {
    case 'Hepsiburada': return `https://www.hepsiburada.com/ara?q=${q}`;
    case 'Trendyol': return `https://www.trendyol.com/sr?q=${q}`;
    case 'Amazon TR': return `https://www.amazon.com.tr/s?k=${q}`;
    default: return null;
  }
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: sellerRows } = await client.query(`SELECT id, name FROM sellers`);
    const sellerId = Object.fromEntries(sellerRows.map(r => [r.name, r.id]));

    const { rows: products } = await client.query(`SELECT id, canonical_name FROM products`);
    const productId = Object.fromEntries(products.map(r => [r.canonical_name, r.id]));

    let updated = 0, removed = 0, skippedNoData = 0;

    for (const [name, pid] of Object.entries(productId)) {
      const real = REAL_PRICES[name];
      if (!real) {
        console.log(`ATLA (araştırma verisi yok): ${name}`);
        skippedNoData++;
        continue;
      }

      // price_history, offers'a FK ile bağlı — zaten sahte/simüle
      // edilmiş bu geçmiş verisi (arayüzden de gizlendi, bkz. "Yakında"
      // değişikliği), o yüzden silinecek/değiştirilecek tekliflerin
      // geçmişini önce temizlemek güvenli.
      await client.query(
        `DELETE FROM price_history WHERE offer_id IN (
           SELECT id FROM offers WHERE product_id = $1 AND (
             seller_id NOT IN (SELECT id FROM sellers WHERE name = ANY($2::text[]))
             OR seller_id = ANY($3::uuid[])
           )
         )`,
        [pid, ALLOWED_SELLERS, ALLOWED_SELLERS.map(s => sellerId[s])]
      );

      // İzin verilmeyen (Hepsiburada/Trendyol/Amazon TR dışı) TÜM
      // eski tekliflerini temizle.
      const del = await client.query(
        `DELETE FROM offers WHERE product_id = $1 AND seller_id NOT IN (
           SELECT id FROM sellers WHERE name = ANY($2::text[])
         )`,
        [pid, ALLOWED_SELLERS]
      );
      removed += del.rowCount;

      for (const sellerName of ALLOWED_SELLERS) {
        const info = real[sellerName];
        const sid = sellerId[sellerName];
        if (!info) {
          // Bu satıcıda gerçekten satılmıyor — varsa eski teklifi sil.
          await client.query(`DELETE FROM offers WHERE product_id = $1 AND seller_id = $2`, [pid, sid]);
          continue;
        }
        const url = info.url || searchUrl(sellerName, name);
        await client.query(
          `INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency, in_stock, shipping_cost)
           VALUES ($1, $2, $3, $4, $4, $5, 'TRY', true, 0)
           ON CONFLICT (product_id, seller_id) DO UPDATE
           SET price = EXCLUDED.price, product_url = EXCLUDED.product_url,
               affiliate_url = EXCLUDED.affiliate_url, raw_title = EXCLUDED.raw_title,
               last_checked_at = NOW()`,
          [pid, sid, name, url, info.price]
        );
        updated++;
      }
      console.log(`✔ güncellendi: ${name}`);
    }

    await client.query('COMMIT');
    console.log(`\n✔ Tamamlandı. ${updated} teklif yazıldı/güncellendi, ${removed} izinsiz eski teklif silindi, ${skippedNoData} ürün için veri yoktu.`);
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
