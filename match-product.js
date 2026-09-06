// match-product.js — Otomatik ürün eşleştirme motoru
//
// Bir satıcıdan gelen HAM ürün bilgisini alır, veritabanındaki hangi
// kanonik ürüne (products.id) ait olduğunu bulur ve sonuca göre:
//   - Eminse (>=0.65 benzerlik veya GTIN/MPN eşleşmesi): doğrudan offers'a ekler
//   - Şüpheliyse (0.40-0.65): raw_product_staging'e "needs_review" olarak atar
//   - Hiç benzemiyorsa (<0.40): raw_product_staging'e "new_product" adayı olarak atar
//
// Bu, README.md'de anlatılan "Eşleştirme Pipeline'ı"nın çalışan koddaki
// karşılığıdır.

const { normalizeTitle } = require('./normalize');

const AUTO_MATCH_THRESHOLD = 0.65;
const REVIEW_THRESHOLD = 0.40;

// server.js'teki POST /api/ingest-offer aynısını kontrol ediyordu, ama
// SADECE o HTTP uç noktasında — matchProduct() fonksiyonu doğrudan başka
// bir yerden (örn. bir test script'i, ileride eklenecek bir cron/CLI
// aracı) çağrılırsa bu kontrolden hiç geçmiyordu. Asıl veriyi yazan
// nokta burası olduğu için doğrulama da burada, kaynağında olmalı —
// HTTP katmanındaki kontrol artık bir ön-filtre, asıl güvence bu.
function isSafeHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// sellers.website_domain daha önce hiç kontrol edilmiyordu — bir
// scraper (ya da /api/ingest-offer'a doğrudan istek atan biri)
// sellerId="Hepsiburada" derken productUrl/affiliateUrl'e TAMAMEN
// alakasız (ör. bir oltalama sayfası) bir link verebiliyordu; isSafeHttpUrl
// sadece "http(s) mi" diye bakıyor, "gerçekten o satıcıya mı ait" diye
// bakmıyordu. Bu, affiliate ortaklığı kuracağımız şirketlerin en çok
// önemseyeceği şey: bizim sitemizde "Hepsiburada" yazan bir linkin
// GERÇEKTEN hepsiburada.com'a gittiğinin garantisi. Alt alan adlarına
// izin veriyoruz (ör. "www.hepsiburada.com", "m.hepsiburada.com") ama
// "hepsiburada.com.evil.com" gibi bir sahte alt alan adı taklidini
// (sondan eşleşme + nokta sınırı olmadan sadece .includes() kullansaydık
// bu açığa düşerdik) YAKALAR.
function hostnameMatchesDomain(hostname, domain) {
  const h = String(hostname || '').toLowerCase();
  const d = String(domain || '').toLowerCase();
  if (!h || !d) return false;
  return h === d || h.endsWith('.' + d);
}

function urlMatchesSellerDomain(value, websiteDomain) {
  // website_domain boşsa (henüz doldurulmamış eski bir satıcı satırı)
  // eski davranışı bozmamak için kontrolü atlıyoruz — ama bu durumu
  // ayrıca loglayıp fark edilmesini sağlıyoruz (bkz. çağıran taraf).
  if (!websiteDomain) return true;
  try {
    return hostnameMatchesDomain(new URL(value).hostname, websiteDomain);
  } catch {
    return false;
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {object} input
 * @param {string} input.rawTitle       - satıcı sitesindeki ham ürün başlığı
 * @param {string} [input.gtin]         - barkod/EAN varsa
 * @param {string} [input.mpn]          - üretici parça no varsa
 * @param {string} input.sellerId       - sellers.id (uuid)
 * @param {number} input.price
 * @param {string} [input.currency]     - varsayılan TRY
 * @param {string} input.productUrl
 * @param {string} [input.affiliateUrl] - yoksa productUrl kullanılır
 */
async function matchProduct(pool, input) {
  const {
    rawTitle, gtin, mpn, sellerId, price,
    currency = 'TRY', productUrl, affiliateUrl,
  } = input;

  if (!isSafeHttpUrl(productUrl) || (affiliateUrl !== undefined && affiliateUrl !== null && !isSafeHttpUrl(affiliateUrl))) {
    const err = new Error('productUrl/affiliateUrl geçerli bir http(s) adresi olmalı');
    err.statusCode = 400;
    throw err;
  }

  // Satıcının GERÇEK alan adını (sellers.website_domain) çekip
  // productUrl/affiliateUrl'in gerçekten o alan adına ait olduğunu
  // doğruluyoruz — "Hepsiburada" seçilip alakasız/kötü niyetli bir
  // linkin eklenmesini engelliyor (bkz. urlMatchesSellerDomain() üstteki
  // yorum). website_domain henüz girilmemiş bir satıcı için (NULL/boş)
  // kontrol atlanır ama bu durum konsola loglanır ki fark edilsin.
  const { rows: sellerDomainRows } = await pool.query(
    `SELECT website_domain FROM sellers WHERE id = $1`, [sellerId]
  );
  const websiteDomain = sellerDomainRows[0]?.website_domain || null;
  if (!websiteDomain) {
    console.warn(`⚠ sellers.website_domain boş (sellerId=${sellerId}) — alan adı doğrulaması atlandı`);
  } else if (!urlMatchesSellerDomain(productUrl, websiteDomain) || (affiliateUrl && !urlMatchesSellerDomain(affiliateUrl, websiteDomain))) {
    const err = new Error(`productUrl/affiliateUrl, satıcının kendi alan adıyla (${websiteDomain}) uyuşmuyor`);
    err.statusCode = 400;
    throw err;
  }

  // --- ADIM 1: GTIN ile kesin eşleşme ---
  if (gtin) {
    const { rows } = await pool.query(
      `SELECT id, canonical_name FROM products WHERE gtin = $1`, [gtin]
    );
    if (rows.length > 0) {
      return finalizeMatch(pool, {
        productId: rows[0].id, canonicalName: rows[0].canonical_name,
        confidence: 1.0, method: 'gtin', sellerId, rawTitle, price, currency, productUrl, affiliateUrl,
      });
    }
  }

  // --- ADIM 2: MPN ile kesin eşleşme ---
  if (mpn) {
    const { rows } = await pool.query(
      `SELECT id, canonical_name FROM products WHERE mpn = $1`, [mpn]
    );
    if (rows.length > 0) {
      return finalizeMatch(pool, {
        productId: rows[0].id, canonicalName: rows[0].canonical_name,
        confidence: 1.0, method: 'mpn', sellerId, rawTitle, price, currency, productUrl, affiliateUrl,
      });
    }
  }

  // --- ADIM 3: İsim benzerliği (pg_trgm) ---
  const normalizedKey = normalizeTitle(rawTitle);
  const { rows: candidates } = await pool.query(
    `SELECT id, canonical_name, normalized_key,
            similarity(normalized_key, $1) AS sim
     FROM products
     ORDER BY sim DESC
     LIMIT 1`,
    [normalizedKey]
  );

  const best = candidates[0];
  const confidence = best ? Number(best.sim) : 0;

  if (best && confidence >= AUTO_MATCH_THRESHOLD) {
    return finalizeMatch(pool, {
      productId: best.id, canonicalName: best.canonical_name,
      confidence, method: 'fuzzy_name', sellerId, rawTitle, price, currency, productUrl, affiliateUrl,
    });
  }

  if (best && confidence >= REVIEW_THRESHOLD) {
    await pool.query(
      `INSERT INTO raw_product_staging
         (seller_id, raw_title, normalized_key, scraped_price, scraped_url,
          match_status, candidate_product_id, match_confidence, match_method)
       VALUES ($1,$2,$3,$4,$5,'needs_review',$6,$7,'fuzzy_name')`,
      [sellerId, rawTitle, normalizedKey, price, productUrl, best.id, confidence]
    );
    return {
      status: 'needs_review',
      candidateProductId: best.id,
      candidateName: best.canonical_name,
      confidence,
    };
  }

  // Hiçbir aday yeterince benzemiyor — muhtemelen yeni bir ürün
  await pool.query(
    `INSERT INTO raw_product_staging
       (seller_id, raw_title, normalized_key, scraped_price, scraped_url, match_status)
     VALUES ($1,$2,$3,$4,$5,'new_product')`,
    [sellerId, rawTitle, normalizedKey, price, productUrl]
  );
  return { status: 'new_candidate', confidence };
}

async function finalizeMatch(pool, { productId, canonicalName, confidence, method, sellerId, rawTitle, price, currency, productUrl, affiliateUrl }) {
  // Aynı satıcı+ürün için tekrar ingest edilirse (örn. scraper her gün
  // aynı ürünü tekrar tarar) yeni bir satır EKLEMEK yerine mevcut
  // satırı güncelliyoruz — önceden her ingest yeni bir satır açıyordu,
  // bu da zamanla bayat/yanlış "en uygun fiyat" hesaplarına yol
  // açıyordu (offers.product_id+seller_id+storage_gb+color üzerindeki
  // UNIQUE kısıt bunu artık veritabanı seviyesinde de garanti ediyor).
  //
  // Canlı scraper akışı henüz kapasite/renk varyantı ayırt etmiyor —
  // ürünün KENDİ spec.storage_gb'sini "varsayılan varyant" olarak
  // damgalıyoruz (color boş kalır). Farklı bir kapasite/renk için ayrı
  // bir gerçek teklif, sadece elle çalıştırılan araştırma script'leri
  // (bkz. apply-real-prices*.js) tarafından ekleniyor.
  const { rows: productRows } = await pool.query(`SELECT specs->>'storage_gb' AS storage_gb FROM products WHERE id = $1`, [productId]);
  const defaultStorageGb = Number(productRows[0]?.storage_gb) || 0;

  const { rows } = await pool.query(
    `INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency, storage_gb, color, last_checked_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'', now())
     ON CONFLICT (product_id, seller_id, storage_gb, color) DO UPDATE SET
       raw_title = EXCLUDED.raw_title,
       product_url = EXCLUDED.product_url,
       affiliate_url = EXCLUDED.affiliate_url,
       price = EXCLUDED.price,
       currency = EXCLUDED.currency,
       last_checked_at = now()
     RETURNING id`,
    [productId, sellerId, rawTitle, productUrl, affiliateUrl || productUrl, price, currency, defaultStorageGb]
  );
  // fiyat grafiği için bu anki fiyatı price_history'ye ayrı bir kayıt
  // olarak ekle — bu, offers'tan farklı olarak birikmesi GEREKEN veri
  await pool.query(
    `INSERT INTO price_history (offer_id, price) VALUES ($1, $2)`,
    [rows[0].id, price]
  );
  return { status: 'matched', productId, canonicalName, confidence, method };
}

module.exports = { matchProduct, AUTO_MATCH_THRESHOLD, REVIEW_THRESHOLD };
