// fix-bare-offer-urls.js — Sadece satıcının ana sayfasına giden (ürün
// sayfasına değil) teklif linklerini, o satıcının GERÇEK site-içi arama
// sonucu sayfasına yönlendirecek şekilde düzeltir.
//
// Neden arama sayfası: Gerçek ürün sayfası URL'lerini (SKU/ürün ID'si)
// scraper olmadan bilmemiz mümkün değil, uydurmak da bozuk/yanıltıcı
// link üretir. Site içi arama ise her zaman var olan, gerçek ve çalışan
// bir sayfadır — kullanıcıyı doğru ürüne bir tık uzağa götürür. Her
// satıcının arama URL formatı gerçek tarayıcıda tek tek test edilerek
// doğrulandı (bkz. commit/PR açıklaması).
//
// Kullanım: node fix-bare-offer-urls.js [--dry-run]

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function buildSearchUrl(sellerName, productName) {
  const q = encodeURIComponent(productName);
  switch (sellerName) {
    case 'Hepsiburada': return `https://www.hepsiburada.com/ara?q=${q}`;
    case 'Trendyol': return `https://www.trendyol.com/sr?q=${q}`;
    case 'N11': return `https://www.n11.com/arama?q=${q}`;
    case 'MediaMarkt': return `https://www.mediamarkt.com.tr/tr/search.html?query=${q}`;
    case 'Amazon TR': return `https://www.amazon.com.tr/s?k=${q}`;
    case 'Vatan Bilgisayar': return `https://www.vatanbilgisayar.com/arama/${q}/`;
    default: return null;
  }
}

function isBareUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.pathname === '/' || u.pathname === '';
  } catch {
    return true;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const { rows } = await pool.query(`
    SELECT o.id, s.name AS seller, p.canonical_name, o.product_url, o.affiliate_url
    FROM offers o
    JOIN sellers s ON s.id = o.seller_id
    JOIN products p ON p.id = o.product_id
  `);

  const toFix = rows.filter(r => isBareUrl(r.affiliate_url) || isBareUrl(r.product_url));
  console.log(`${rows.length} teklif tarandı, ${toFix.length} tanesi düzeltilecek.\n`);

  let fixed = 0, skippedNoPattern = 0;

  for (const r of toFix) {
    const searchUrl = buildSearchUrl(r.seller, r.canonical_name);
    if (!searchUrl) {
      console.log(`⚠ Bilinen arama deseni yok, atlandı: ${r.seller} — ${r.canonical_name}`);
      skippedNoPattern++;
      continue;
    }
    console.log(`${r.seller} | ${r.canonical_name}\n  eski: ${r.affiliate_url}\n  yeni: ${searchUrl}`);

    if (!dryRun) {
      await pool.query(
        `UPDATE offers SET product_url = $1, affiliate_url = $1 WHERE id = $2`,
        [searchUrl, r.id]
      );
    }
    fixed++;
  }

  console.log(`\n${dryRun ? '[KURU ÇALIŞTIRMA — DB değişmedi] ' : ''}Bitti. ${fixed} teklif güncellendi, ${skippedNoPattern} tanesi bilinmeyen satıcı deseni yüzünden atlandı.`);
  await pool.end();
}

main().catch(err => {
  console.error('✘ Hata:', err.message);
  process.exit(1);
});
