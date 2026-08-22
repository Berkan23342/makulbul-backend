// server.js — Cepfiyat API
// PostgreSQL'deki products/offers/sellers/brands tablolarını
// siteye JSON olarak sunar.

require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const { matchProduct } = require('./match-product');
const { rankByPower } = require('./ai-rank');
const { getInstallmentOptions } = require('./installments');
const { renderProductPage, renderNotFoundPage, renderVerifyPage, slugify } = require('./product-page');
const { sendEmail } = require('./email');
const { checkPriceAlerts } = require('./check-price-alerts');

// Ürün detay sayfalarının (SSR) ve sitemap'in mutlak URL üretmesi için.
// Canlıya alınca .env'e gerçek domain'leri yazman yeterli.
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

const app = express();
// CORS artık sadece bilinen frontend origin'ine izin veriyor — eskiden
// cors() hiçbir kısıtlama olmadan her origin'e açıktı.
app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

// ---------------------------------------------------------------------
// Veritabanı bağlantısı
// ---------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Bağlantıyı erken test et, sorun varsa net hata ver
pool.query('SELECT 1')
  .then(() => console.log('✔ PostgreSQL bağlantısı başarılı'))
  .catch(err => console.error('✘ PostgreSQL bağlantı hatası:', err.message));

// ---------------------------------------------------------------------
// Yardımcı: bir ürün satırını + tekliflerini birlikte formatlar
// ---------------------------------------------------------------------
async function attachOffers(products) {
  if (products.length === 0) return products;
  const ids = products.map(p => p.id);
  const { rows: offers } = await pool.query(
    `SELECT o.product_id, o.price, o.currency, o.affiliate_url, o.in_stock,
            s.name AS seller_name
     FROM offers o
     JOIN sellers s ON s.id = o.seller_id
     WHERE o.product_id = ANY($1::uuid[])
     ORDER BY o.price ASC`,
    [ids]
  );
  return products.map(p => ({
    ...p,
    offers: offers
      .filter(o => o.product_id === p.id)
      .map(o => ({ ...o, installments: getInstallmentOptions(o.price, o.seller_name) })),
  }));
}

// ---------------------------------------------------------------------
// GET /api/products
// Query params: brand, maxPrice, nfc=true, sort=price|battery|camera
// ---------------------------------------------------------------------
app.get('/api/products', async (req, res) => {
  try {
    const { brand, maxPrice, nfc, sort } = req.query;
    const conditions = [`c.slug = 'telefon'`];
    const params = [];

    if (brand) {
      params.push(brand);
      conditions.push(`b.name = $${params.length}`);
    }
    if (nfc === 'true') {
      conditions.push(`(p.specs->>'has_nfc')::boolean = true`);
    }

    let sql = `
      SELECT p.id, p.canonical_name, b.name AS brand, p.specs,
             (SELECT MIN(o.price) FROM offers o WHERE o.product_id = p.id) AS best_price,
             (SELECT MIN(ph.price) FROM price_history ph
                JOIN offers o ON o.id = ph.offer_id
                WHERE o.product_id = p.id AND ph.recorded_at >= NOW() - INTERVAL '30 days') AS min_price_30d
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      JOIN categories c ON c.id = p.category_id
      WHERE ${conditions.join(' AND ')}
    `;

    if (maxPrice) {
      // en ucuz teklifi bütçe sınırına göre filtrelemek için HAVING benzeri alt sorgu
      sql = `SELECT * FROM (${sql}) t WHERE t.best_price <= $${params.length + 1}`;
      params.push(Number(maxPrice));
    }

    const sortMap = {
      price: 'best_price ASC',
      battery: `(specs->>'battery_mah')::int DESC`,
      camera: `(specs->>'main_camera_mp')::int DESC`,
      weight: `COALESCE((specs->>'weight_g')::int, 9999) ASC`,
      charging: `COALESCE((specs->>'wired_charging_watts')::int, 0) DESC`,
    };
    sql += ` ORDER BY ${sortMap[sort] || 'best_price ASC'}`;

    const { rows } = await pool.query(sql, params);
    const withOffers = await attachOffers(rows);
    res.json(withOffers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ürünler getirilemedi' });
  }
});

// ---------------------------------------------------------------------
// GET /api/products/:id — tek ürün detayı + tüm teklifler
// ---------------------------------------------------------------------
app.get('/api/products/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.canonical_name, b.name AS brand, p.specs
       FROM products p JOIN brands b ON b.id = p.brand_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Ürün bulunamadı' });
    const [withOffers] = await attachOffers(rows);
    res.json(withOffers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ürün getirilemedi' });
  }
});

// ---------------------------------------------------------------------
// GET /api/products/:id/price-history — ürünün gün bazında en iyi
// (satıcılar arası en düşük) fiyat grafiği. Query params: days (varsayılan 90)
// ---------------------------------------------------------------------
app.get('/api/products/:id/price-history', async (req, res) => {
  try {
    const days = Math.min(Number(req.query.days) || 90, 365);
    const { rows } = await pool.query(
      `SELECT date_trunc('day', ph.recorded_at)::date AS date, MIN(ph.price) AS price
       FROM price_history ph
       JOIN offers o ON o.id = ph.offer_id
       WHERE o.product_id = $1
         AND ph.recorded_at >= NOW() - ($2 * INTERVAL '1 day')
       GROUP BY date
       ORDER BY date ASC`,
      [req.params.id, days]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Fiyat geçmişi getirilemedi' });
  }
});

// ---------------------------------------------------------------------
// POST /api/price-alerts — fiyat düşüş alarmı oluşturur (e-posta onayı
// gerektirir). Body: { productId, email, targetPrice }
//
// Önceden buraya HERHANGİ bir e-posta adresi girilebiliyor ve alarm
// hemen aktif oluyordu — yani biri başkasının e-postasını yazıp o kişiye
// istemsiz bildirim gönderttirebilirdi. Şimdi alarm "onaylanmamış"
// olarak kaydediliyor, gerçek bildirim ancak kullanıcı e-postasına gelen
// linke tıklayıp sahipliğini doğruladıktan sonra gönderiliyor
// (bkz. GET /api/price-alerts/verify).
// ---------------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/price-alerts', async (req, res) => {
  try {
    const { productId, email, targetPrice } = req.body;

    if (!productId || !email || !targetPrice) {
      return res.status(400).json({ error: 'productId, email ve targetPrice zorunludur' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Geçerli bir e-posta adresi gir' });
    }
    const target = Number(targetPrice);
    if (!Number.isFinite(target) || target <= 0) {
      return res.status(400).json({ error: 'Hedef fiyat geçerli bir sayı olmalı' });
    }

    const { rows: productRows } = await pool.query('SELECT id, canonical_name FROM products WHERE id = $1', [productId]);
    if (productRows.length === 0) {
      return res.status(404).json({ error: 'Ürün bulunamadı' });
    }

    const verifyToken = crypto.randomBytes(24).toString('hex');

    const { rows } = await pool.query(
      `INSERT INTO price_alerts (product_id, email, target_price, verify_token)
       VALUES ($1, $2, $3, $4)
       RETURNING id, product_id, email, target_price, created_at`,
      [productId, email, target, verifyToken]
    );

    const verifyUrl = `${BACKEND_URL}/api/price-alerts/verify?token=${verifyToken}`;
    await sendEmail({
      to: email,
      subject: `Fiyat alarmını onayla — ${productRows[0].canonical_name}`,
      text:
        `${productRows[0].canonical_name} için ${target.toLocaleString('tr-TR')} TL hedefiyle bir fiyat alarmı kurdun.\n\n` +
        `Bu alarmı aktif etmek için onayla:\n${verifyUrl}\n\n` +
        `Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin — onaylamadığın sürece hiçbir bildirim gönderilmeyecek.`,
    });

    res.status(201).json({ ...rows[0], needsVerification: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Alarm oluşturulamadı' });
  }
});

// ---------------------------------------------------------------------
// GET /api/price-alerts/verify?token=... — e-posta sahipliğini doğrular
// ---------------------------------------------------------------------
app.get('/api/price-alerts/verify', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).type('html').send(renderVerifyPage({
        success: false, message: 'Geçersiz bağlantı.', frontendUrl: FRONTEND_URL,
      }));
    }

    const { rows } = await pool.query(
      `UPDATE price_alerts SET verified_at = now()
       WHERE verify_token = $1 AND verified_at IS NULL AND is_active = true
       RETURNING id`,
      [token]
    );

    if (rows.length === 0) {
      return res.type('html').send(renderVerifyPage({
        success: false,
        message: 'Bu onay bağlantısı geçersiz, süresi dolmuş ya da zaten kullanılmış.',
        frontendUrl: FRONTEND_URL,
      }));
    }

    res.type('html').send(renderVerifyPage({
      success: true,
      message: 'Fiyat hedefine ulaşıldığında sana e-posta ile haber vereceğiz.',
      frontendUrl: FRONTEND_URL,
    }));
  } catch (err) {
    console.error(err);
    res.status(500).type('html').send('<h1>Bir hata oluştu</h1>');
  }
});

// ---------------------------------------------------------------------
// POST /api/ai-search — basit kural tabanlı öneri (body: { query: "..." })
// ---------------------------------------------------------------------
app.post('/api/ai-search', async (req, res) => {
  try {
    const q = (req.body.query || '').toLowerCase();

    const filters = {
      maxPrice: null,
      minPrice: null,
      brand: null,
      nfc: q.includes('nfc'),
      // "telefoto"/"zoom"/"ön kamera"/"selfie" geçen sorgularda genel kamera
      // (MP) sıralamasına değil, kendi özel kriterine (zoom/selfie) düşsün
      camera: q.includes('kamera')
        && !q.includes('ön kamera') && !q.includes('selfie')
        && !q.includes('telefoto') && !q.includes('zoom') && !q.includes('uzak çekim'),
      battery: q.includes('pil') || q.includes('batarya'),
      top: q.includes('güçlü') || q.includes('performans') || q.includes('en iyi') || q.includes('oyun'),
      light: q.includes('hafif') || q.includes('kompakt'),
      durable: q.includes('dayanıklı') || q.includes('su geçirmez') || q.includes('sağlam'),
      fastCharge: q.includes('hızlı şarj') || q.includes('çabuk şarj'),
      wirelessCharge: q.includes('kablosuz şarj'),
      zoom: q.includes('zoom') || q.includes('telefoto') || q.includes('uzak çekim'),
      selfie: q.includes('selfie') || q.includes('ön kamera'),
    };
    const priceMatch = q.match(/(\d+)[.,]?(\d{3})?\s*(bin|tl)/);
    if (priceMatch) {
      let num = priceMatch[1] + (priceMatch[2] || '');
      if (priceMatch[3] === 'bin' && !priceMatch[2]) num = priceMatch[1] + '000';
      const value = parseInt(num, 10);

      // Sayının yönünü ("altında" mı "üzerinde" mi) sorgu metninden anla;
      // yön belirtilmemişse varsayılan olarak bütçe üst sınırı (altında) say.
      const overWords = ['üzerinde', 'üzeri', 'üstünde', 'üstü', 'fazla', 'yukarı', 'daha pahalı'];
      const underWords = ['altında', 'altı', 'aşağı', 'daha ucuz'];
      const isOver = overWords.some(w => q.includes(w));
      const isUnder = underWords.some(w => q.includes(w));

      if (isOver && !isUnder) {
        filters.minPrice = value;
      } else {
        filters.maxPrice = value;
      }
    }
    if (q.includes('apple') || q.includes('iphone')) filters.brand = 'Apple';
    if (q.includes('samsung') || q.includes('galaxy')) filters.brand = 'Samsung';
    if (q.includes('xiaomi') || q.includes('redmi') || q.includes('poco')) filters.brand = 'Xiaomi';

    const conditions = [`c.slug = 'telefon'`];
    const params = [];
    if (filters.brand) { params.push(filters.brand); conditions.push(`b.name = $${params.length}`); }
    if (filters.nfc) conditions.push(`(p.specs->>'has_nfc')::boolean = true`);

    const { rows: candidates } = await pool.query(
      `SELECT p.id, p.canonical_name, b.name AS brand, p.specs,
              (SELECT MIN(o.price) FROM offers o WHERE o.product_id = p.id) AS best_price,
              (SELECT s.name FROM offers o JOIN sellers s ON s.id = o.seller_id
                 WHERE o.product_id = p.id ORDER BY o.price ASC LIMIT 1) AS best_seller,
              (SELECT o.affiliate_url FROM offers o
                 WHERE o.product_id = p.id ORDER BY o.price ASC LIMIT 1) AS best_url
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    let pool_ = candidates;
    if (filters.maxPrice) {
      const underBudget = pool_.filter(c => c.best_price <= filters.maxPrice);
      pool_ = underBudget.length > 0 ? underBudget : pool_;
    } else if (filters.minPrice) {
      const overBudget = pool_.filter(c => c.best_price >= filters.minPrice);
      pool_ = overBudget.length > 0 ? overBudget : pool_;
    }

    let topReasoning = null;
    let topUsedAI = false;
    if (filters.camera) {
      pool_.sort((a, b) => (b.specs.main_camera_mp||0) - (a.specs.main_camera_mp||0));
    } else if (filters.zoom) {
      pool_.sort((a, b) => (b.specs.optical_zoom_x||0) - (a.specs.optical_zoom_x||0));
    } else if (filters.selfie) {
      pool_.sort((a, b) => (b.specs.front_camera_mp||0) - (a.specs.front_camera_mp||0));
    } else if (filters.battery) {
      pool_.sort((a, b) => (b.specs.battery_mah||0) - (a.specs.battery_mah||0));
    } else if (filters.fastCharge) {
      pool_.sort((a, b) => (b.specs.wired_charging_watts||0) - (a.specs.wired_charging_watts||0));
    } else if (filters.wirelessCharge) {
      // eskiden bu, spec verisi eksik olan (yeni) telefonları SQL'de tamamen
      // dışlıyordu — artık sadece sıralamada geriye düşüyorlar, listeden atılmıyorlar
      pool_.sort((a, b) => (b.specs.wireless_charging_watts||0) - (a.specs.wireless_charging_watts||0));
    } else if (filters.light) {
      // ağırlık bilgisi olmayanları listenin sonuna at (0 -> Infinity)
      pool_.sort((a, b) => (a.specs.weight_g || 9999) - (b.specs.weight_g || 9999));
    } else if (filters.durable) {
      // IP69 (toz+basınçlı su) > IP68 > diğer, ağırlık ikinci kriter değil
      const durabilityScore = p => (p.specs.ip_rating || '').includes('69') ? 2 : (p.specs.ip_rating || '').includes('68') ? 1 : 0;
      pool_.sort((a, b) => durabilityScore(b) - durabilityScore(a));
    } else if (filters.top) {
      const { ranking, reasoning, usedAI } = await rankByPower(pool_);
      const orderMap = new Map(ranking.map((id, i) => [id, i]));
      pool_.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      topReasoning = reasoning;
      topUsedAI = usedAI;
    } else {
      pool_.sort((a, b) => a.best_price - b.best_price);
    }

    const pick = pool_[0] || null;
    const reasons = [];
    if (pick) {
      if (filters.maxPrice) reasons.push(`Bütçenin (${filters.maxPrice.toLocaleString('tr-TR')} TL) altında: ${pick.best_price.toLocaleString('tr-TR')} TL`);
      if (filters.minPrice) reasons.push(`Belirtilen (${filters.minPrice.toLocaleString('tr-TR')} TL) üzerinde: ${pick.best_price.toLocaleString('tr-TR')} TL`);
      if (filters.nfc && pick.specs.has_nfc) reasons.push('NFC destekli');
      if (filters.wirelessCharge && pick.specs.wireless_charging_watts) reasons.push(`En hızlı kablosuz şarj: ${pick.specs.wireless_charging_watts}W`);
      if (filters.camera) reasons.push(`Yüksek çözünürlüklü kamera: ${pick.specs.main_camera_mp}MP`);
      if (filters.zoom && pick.specs.optical_zoom_x) reasons.push(`En yüksek optik zoom: ${pick.specs.optical_zoom_x}x`);
      if (filters.selfie && pick.specs.front_camera_mp) reasons.push(`En yüksek çözünürlüklü ön kamera: ${pick.specs.front_camera_mp}MP`);
      if (filters.battery) reasons.push(`Yüksek batarya kapasitesi: ${pick.specs.battery_mah}mAh`);
      if (filters.fastCharge && pick.specs.wired_charging_watts) reasons.push(`En hızlı kablolu şarj: ${pick.specs.wired_charging_watts}W`);
      if (filters.light && pick.specs.weight_g) reasons.push(`Bu segmentteki en hafif seçeneklerden: ${pick.specs.weight_g}g`);
      if (filters.durable && pick.specs.ip_rating) reasons.push(`Yüksek dayanıklılık sınıfı: ${pick.specs.ip_rating}`);
      if (filters.top) {
        const label = topUsedAI ? 'Yapay zeka analizi' : 'Donanım analizi';
        reasons.push(topReasoning
          ? `${label}: ${topReasoning}`
          : `En yüksek donanım seviyesi: ${pick.specs.ram_gb}GB RAM, ${pick.specs.chip}`);
      }
      if (reasons.length === 0) reasons.push(`En uygun fiyatlı seçenek: ${pick.best_price.toLocaleString('tr-TR')} TL`);
      reasons.push(`En uygun fiyat ${pick.best_seller} üzerinden`);
    }

    res.json({ pick, reasons, candidates: pool_.slice(0, 12) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Arama yapılamadı' });
  }
});

// ---------------------------------------------------------------------
// POST /api/ingest-offer — Scraper'ların ham ürün verisini gönderdiği uç
// nokta. Otomatik eşleştirme motorunu (match-product.js) çalıştırır.
// Body: { sellerName, rawTitle, price, currency?, productUrl, affiliateUrl?, gtin?, mpn? }
// ---------------------------------------------------------------------
app.post('/api/ingest-offer', async (req, res) => {
  try {
    const { sellerName, rawTitle, price, currency, productUrl, affiliateUrl, gtin, mpn } = req.body;
    if (!sellerName || !rawTitle || !price || !productUrl) {
      return res.status(400).json({ error: 'sellerName, rawTitle, price, productUrl zorunludur' });
    }

    const { rows: sellerRows } = await pool.query('SELECT id FROM sellers WHERE name = $1', [sellerName]);
    if (sellerRows.length === 0) {
      return res.status(404).json({ error: `Satıcı bulunamadı: ${sellerName}` });
    }

    const result = await matchProduct(pool, {
      rawTitle, gtin, mpn, price, currency, productUrl, affiliateUrl,
      sellerId: sellerRows[0].id,
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Eşleştirme yapılamadı' });
  }
});

// ---------------------------------------------------------------------
// GET /urun/:id/:slug? — ürün detay sayfası (sunucu tarafında render
// edilmiş düz HTML). index.html tamamen JS ile render olduğu için arama
// motoru botları ve link önizleme botları ürünleri hiç göremiyordu —
// bu sayfa gerçek meta etiketleri ve içerikle o boşluğu kapatıyor.
// :slug tamamen kozmetik/SEO amaçlı; asıl arama :id ile yapılıyor.
// ---------------------------------------------------------------------
app.get('/urun/:id/:slug?', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.canonical_name, b.name AS brand, p.specs,
              (SELECT MIN(ph.price) FROM price_history ph
                 JOIN offers o ON o.id = ph.offer_id
                 WHERE o.product_id = p.id AND ph.recorded_at >= NOW() - INTERVAL '30 days') AS min_price_30d
       FROM products p JOIN brands b ON b.id = p.brand_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).type('html').send(renderNotFoundPage(FRONTEND_URL));
    }
    const [product] = await attachOffers(rows);
    res.type('html').send(renderProductPage(product, {
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
      minPrice30d: product.min_price_30d,
    }));
  } catch (err) {
    console.error(err);
    res.status(500).type('html').send('<h1>Bir hata oluştu</h1>');
  }
});

// ---------------------------------------------------------------------
// GET /sitemap.xml ve GET /robots.txt — arama motorlarının tüm ürün
// sayfalarını keşfedebilmesi için. Katalog tamamen JS ile render
// olduğundan botlar ürün linklerini anasayfadan takip edemeyebilir;
// sitemap bu ürünleri doğrudan listeleyerek garantiye alıyor.
// ---------------------------------------------------------------------
app.get('/sitemap.xml', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.canonical_name FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE c.slug = 'telefon'`
    );
    const urls = rows.map(p =>
      `  <url><loc>${BACKEND_URL}/urun/${p.id}/${slugify(p.canonical_name)}</loc></url>`
    ).join('\n');
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
    );
  } catch (err) {
    console.error(err);
    res.status(500).type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${BACKEND_URL}/sitemap.xml\n`);
});

// Fiyat alarmlarını düzenli aralıklarla kontrol et — eskiden bu sadece
// elle (node check-price-alerts.js) çalıştırılıyordu, canlıya alınca
// ayrıca bir cron kurmayı unutmak kolaydı. Artık sunucu ayaktayken
// kendiliğinden çalışıyor.
const ALERT_CHECK_INTERVAL_MS = 60 * 60 * 1000; // saatte bir
function runPriceAlertCheck() {
  checkPriceAlerts(pool, { frontendUrl: FRONTEND_URL })
    .catch(err => console.error('✘ Fiyat alarmı kontrolü hatası:', err.message));
}
setInterval(runPriceAlertCheck, ALERT_CHECK_INTERVAL_MS);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cepfiyat API çalışıyor: http://localhost:${PORT}`);
  runPriceAlertCheck(); // sunucu açılır açılmaz bir kez de hemen çalıştır
});
