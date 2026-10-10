// price-checker/check-prices.js — Amazon TR tekliflerinin güncel fiyatını
// PA-API 5.0 üzerinden çeker ve veritabanını günceller.
//
// ÖNEMLİ — kapsam: Şu an SADECE Amazon TR teklifleri destekleniyor, çünkü
// bu, Amazon'un kendi resmi/izinli API'si (bkz. paapi-client.js). Hepsiburada
// ve Trendyol için otomatik bir kontrol YOK — o siteler otomatik isteklere
// (scraping'e) karşı aktif koruma (bot engeli / CAPTCHA benzeri ara sayfa)
// gösteriyor; bunu atlatmaya çalışmak kullanım şartlarına aykırı olur, bu
// yüzden burada yapılmıyor. Bu satıcılar için fiyat kontrolü elle/tarayıcı
// üzerinden devam ediyor.
//
// Kullanım:
//   node price-checker/check-prices.js               → gerçek PA-API ile kontrol eder, DB'yi günceller
//   node price-checker/check-prices.js --dry-run      → hiçbir şey YAZMAZ, sadece ne olacağını gösterir
//   node price-checker/check-prices.js --mock         → PA-API'ye hiç gitmez, DB güncelleme mantığını
//                                                        rastgele test fiyatlarıyla dener (kredensiz test)
//   node price-checker/check-prices.js --limit 5      → sadece ilk 5 teklifi kontrol eder

require('dotenv').config();
const { Pool } = require('pg');
const { getItems, isConfigured } = require('./paapi-client');
const { extractAsin } = require('./extract-asin');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MOCK = args.includes('--mock');
const limitArg = args.find(a => a.startsWith('--limit'));
const LIMIT = limitArg ? Number(limitArg.split('=')[1] || args[args.indexOf(limitArg) + 1]) : null;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// --mock modu: gerçek PA-API'yi hiç çağırmadan, mevcut fiyatın ±%0-4'ü
// kadar rastgele bir "yeni fiyat" üretir — sadece DB yazma/price_history
// mantığını PA-API kredensiz test edebilmek için.
function mockPrice(currentPrice) {
  const drift = (Math.random() * 0.08 - 0.04); // -%4 ile +%4 arası
  return Math.round(Number(currentPrice) * (1 + drift) * 100) / 100;
}

async function main() {
  console.log(`\n=== Fiyat Kontrolü ${DRY_RUN ? '(DRY-RUN — hiçbir şey yazılmayacak)' : ''}${MOCK ? '(MOCK — sahte fiyatlarla test)' : ''} ===\n`);

  if (!MOCK && !isConfigured()) {
    console.error('✘ PAAPI_ACCESS_KEY / PAAPI_SECRET_KEY / PAAPI_PARTNER_TAG .env\'de tanımlı değil.');
    console.error('  Gerçek kontrol için bunları ekleyin, ya da mantığı denemek için --mock kullanın.');
    process.exit(1);
  }

  const { rows: offers } = await pool.query(
    `SELECT o.id, o.product_url, o.price AS current_price, o.storage_gb, o.color,
            p.canonical_name
     FROM offers o
     JOIN sellers s ON s.id = o.seller_id
     JOIN products p ON p.id = o.product_id
     WHERE s.name = 'Amazon TR'
     ORDER BY o.last_checked_at ASC NULLS FIRST
     ${LIMIT ? 'LIMIT $1' : ''}`,
    LIMIT ? [LIMIT] : []
  );

  const checkable = [];
  const skipped = [];
  for (const offer of offers) {
    const asin = extractAsin(offer.product_url);
    if (asin) checkable.push({ ...offer, asin });
    else skipped.push(offer);
  }

  console.log(`Toplam Amazon TR teklifi: ${offers.length}`);
  console.log(`  → Kontrol edilebilir (gerçek ürün sayfası/ASIN var): ${checkable.length}`);
  console.log(`  → Atlanan (arama linki, ASIN yok): ${skipped.length}`);
  if (skipped.length) {
    for (const s of skipped.slice(0, 5)) {
      console.log(`     - ${s.canonical_name} (${s.storage_gb}GB ${s.color || '-'}): ${s.product_url}`);
    }
    if (skipped.length > 5) console.log(`     ... ve ${skipped.length - 5} tane daha`);
  }
  console.log('');

  let changed = 0, unchanged = 0, errors = 0;

  // PA-API GetItems tek seferde en fazla 10 ASIN kabul ediyor — 10'arlı
  // gruplar halinde işliyoruz. Ayrıca PA-API'nin varsayılan hız sınırı
  // (yeni hesaplarda ~1 istek/sn) aşılmasın diye gruplar arası 1.1 sn
  // bekliyoruz.
  for (let i = 0; i < checkable.length; i += 10) {
    const batch = checkable.slice(i, i + 10);
    let results;
    try {
      results = MOCK
        ? new Map(batch.map(o => [o.asin, { price: mockPrice(o.current_price), currency: 'TRY', inStock: true }]))
        : await getItems(batch.map(o => o.asin));
    } catch (err) {
      console.error(`✘ PA-API isteği başarısız (grup ${i / 10 + 1}):`, err.message);
      errors += batch.length;
      continue;
    }

    for (const offer of batch) {
      const result = results.get(offer.asin);
      const label = `${offer.canonical_name} (${offer.storage_gb}GB ${offer.color || '-'})`;

      if (!result || result.price == null) {
        console.log(`  ⚠ ${label} [${offer.asin}]: PA-API'den fiyat dönmedi (kaldırılmış/stokta yok olabilir)`);
        errors++;
        continue;
      }

      const oldPrice = Number(offer.current_price);
      const newPrice = Number(result.price);
      const diff = newPrice - oldPrice;

      if (Math.abs(diff) < 0.01) {
        console.log(`  = ${label} [${offer.asin}]: değişmedi (${oldPrice.toFixed(2)} TL)`);
        unchanged++;
      } else {
        const arrow = diff > 0 ? '↑' : '↓';
        console.log(`  ${arrow} ${label} [${offer.asin}]: ${oldPrice.toFixed(2)} TL → ${newPrice.toFixed(2)} TL`);
        changed++;
      }

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE offers SET price = $1, in_stock = $3, last_checked_at = now() WHERE id = $2`,
          [newPrice, offer.id, result.inStock !== false]
        );
        await pool.query(
          `INSERT INTO price_history (offer_id, price) VALUES ($1, $2)`,
          [offer.id, newPrice]
        );
      }
    }

    if (!MOCK && i + 10 < checkable.length) {
      await new Promise(r => setTimeout(r, 1100));
    }
  }

  console.log(`\n=== Özet: ${changed} fiyat değişti, ${unchanged} aynı kaldı, ${errors} hata/eksik, ${skipped.length} atlandı ===\n`);
  await pool.end();
}

main().catch(err => {
  console.error('✘ Beklenmeyen hata:', err);
  process.exit(1);
});
