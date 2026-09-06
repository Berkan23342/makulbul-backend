// server.js — Makulbul API
// PostgreSQL'deki products/offers/sellers/brands tablolarını
// siteye JSON olarak sunar.

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// Beklenmedik bir hata (örn. bir yerde unutulmuş bir .catch() eksikliği)
// tüm süreci çökertip sitedeki HERKESİ etkilemesin diye son bir güvenlik
// ağı — loglar, süreci ayakta tutar. Asıl düzeltme her zaman hatanın
// kaynağını bulup gidermektir, bu sadece bir arıza toleransı katmanıdır.
process.on('unhandledRejection', (reason) => {
  console.error('✘ Yakalanmamış promise reddi:', reason);
});

const { matchProduct } = require('./match-product');
const { rankByPower, computeHardwareScore } = require('./ai-rank');
const { getInstallmentOptions } = require('./installments');
const { renderProductPage, renderNotFoundPage, slugify } = require('./product-page');
const { createRateLimiter } = require('./rate-limit');

// Ürün detay sayfalarının (SSR) ve sitemap'in mutlak URL üretmesi için.
// Canlıya alınca .env'e gerçek domain'leri yazman yeterli.
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();
// Render/Railway gibi platformlarda sunucu bir ters proxy'nin arkasında
// çalışır — bu olmadan req.ip her zaman proxy'nin adresini gösterir ve
// aşağıdaki IP bazlı rate limit'ler işe yaramaz.
app.set('trust proxy', 1);

// Canlıda (NODE_ENV=production) http ile gelen isteği https'e yönlendir.
// Yerelde (http, proxy yok) bu adım atlanır.
if (IS_PROD) {
  app.use((req, res, next) => {
    if (req.secure || req.get('x-forwarded-proto') === 'https') return next();
    res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  });
}

// CORS artık sadece bilinen frontend origin'ine izin veriyor — eskiden
// cors() hiçbir kısıtlama olmadan her origin'e açıktı.
app.use(cors({ origin: FRONTEND_URL }));
// Boyut sınırı açıkça belirtildi — varsayılan zaten 100kb ama niyeti
// koda yazmak, ileride biri "limit yok" sanıp değiştirmesin diye.
app.use(express.json({ limit: '100kb' }));

// Temel güvenlik başlıkları — ek bağımlılık (helmet vb.) eklemeden
// tarayıcı seviyesinde birkaç yaygın saldırı sınıfını (clickjacking,
// MIME sniffing, referrer sızıntısı, harici script/kaynak yükleme)
// engeller. Sayfalar inline <style>/<script> kullandığı için CSP
// 'unsafe-inline' ile — bu yine de sayfaya YABANCI bir origin'den
// script/kaynak yüklenmesini engeller, sadece sayfanın kendi inline
// kodunu serbest bırakır.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self' " + FRONTEND_URL + "; " +
    "frame-ancestors 'none'; " +
    "base-uri 'none'; " +
    "form-action 'self'"
  );
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }
  next();
});

// ---------------------------------------------------------------------
// Oran sınırlayıcılar (spam/kötüye kullanım koruması)
// ---------------------------------------------------------------------
const aiSearchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyFn: req => req.ip,
  message: 'Çok fazla arama isteği gönderdin, biraz yavaşla.',
});
const ingestLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60, // scraper'lar toplu çalışabildiği için daha yüksek limit
  keyFn: req => req.ip,
  message: 'Çok fazla istek, biraz sonra tekrar dene.',
});

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

// Sitede SADECE bu üç satıcının teklifleri gösteriliyor — diğer
// satıcılardan (N11, MediaMarkt, Vatan Bilgisayar, Teknosa, marka
// resmi mağazaları vb.) gelen teklifler artık HİÇBİR yerde
// görünmüyor. Bu üçünde teklifi olmayan bir ürün "Şu an satışta
// değil" olarak gösterilir — başka bir siteden alışverişe
// yönlendirilmez.
const ALLOWED_SELLERS = ['Hepsiburada', 'Trendyol', 'Amazon TR'];

// ---------------------------------------------------------------------
// Yardımcı: bir ürün satırını + tekliflerini birlikte formatlar
// ---------------------------------------------------------------------
async function attachOffers(products) {
  if (products.length === 0) return products;
  const ids = products.map(p => p.id);
  const { rows: offers } = await pool.query(
    `SELECT o.product_id, o.price, o.currency, o.affiliate_url, o.in_stock,
            o.storage_gb, o.color,
            s.name AS seller_name
     FROM offers o
     JOIN sellers s ON s.id = o.seller_id
     WHERE o.product_id = ANY($1::uuid[]) AND s.name = ANY($2::text[])
     ORDER BY o.price ASC`,
    [ids, ALLOWED_SELLERS]
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
    // ALLOWED_SELLERS her zaman $1 — aşağıdaki best_price alt sorgusu
    // buna referans veriyor, sonraki dinamik filtreler (brand/maxPrice)
    // $2'den başlıyor.
    const params = [ALLOWED_SELLERS];

    if (brand) {
      params.push(brand);
      conditions.push(`b.name = $${params.length}`);
    }
    if (nfc === 'true') {
      conditions.push(`(p.specs->>'has_nfc')::boolean = true`);
    }

    let sql = `
      SELECT p.id, p.canonical_name, b.name AS brand, p.specs,
             (SELECT MIN(o.price) FROM offers o JOIN sellers s2 ON s2.id = o.seller_id
                WHERE o.product_id = p.id AND s2.name = ANY($1::text[])) AS best_price,
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
// POST /api/track — birinci taraf, kimliksiz sayfa görüntüleme sayacı.
// Çerez banner'ı "kullanım istatistiği için çerez kullanır" diyordu
// ama arkasında hiçbir şey yoktu. Bu, dış bir analitik hesabı (GA4 vb.)
// gerektirmeden, IP veya başka bir kimlik saklamadan (sadece hangi
// sayfa, ne zaman) temel kullanım verisi tutar.
// Body: { path }
// ---------------------------------------------------------------------
const trackLimiter = createRateLimiter({
  windowMs: 60 * 1000, max: 60, keyFn: req => req.ip,
});

app.post('/api/track', trackLimiter, async (req, res) => {
  try {
    const path = String(req.body?.path || '').slice(0, 300);
    if (!path) return res.status(400).json({ error: 'path zorunludur' });
    await pool.query(
      `INSERT INTO page_views (path, referrer) VALUES ($1, $2)`,
      [path, req.get('referer') || null]
    );
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Kaydedilemedi' });
  }
});

// ---------------------------------------------------------------------
// GET /api/stats — toplam ve son 30 günlük görüntüleme istatistikleri.
// Veri kimliksiz/toplu olsa da trafik/iş bilgisini herkese açık
// bırakmamak için, .env'de STATS_KEY tanımlıysa ?key= ile eşleşmeyen
// istekler reddedilir. STATS_KEY tanımlı değilse (yerel geliştirme)
// endpoint açık kalır.
// ---------------------------------------------------------------------
app.get('/api/stats', async (req, res) => {
  if (process.env.STATS_KEY && req.query.key !== process.env.STATS_KEY) {
    return res.status(403).json({ error: 'Yetkisiz' });
  }
  try {
    const { rows: totalRows } = await pool.query(`SELECT COUNT(*) AS total FROM page_views`);
    const { rows: last30 } = await pool.query(`
      SELECT date_trunc('day', created_at)::date AS date, COUNT(*) AS views
      FROM page_views
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY date ORDER BY date ASC
    `);
    const { rows: topPaths } = await pool.query(`
      SELECT path, COUNT(*) AS views
      FROM page_views
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY path ORDER BY views DESC LIMIT 20
    `);
    res.json({ totalViews: Number(totalRows[0].total), last30Days: last30, topPaths });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'İstatistikler getirilemedi' });
  }
});

// ---------------------------------------------------------------------
// POST /api/ai-search — basit kural tabanlı öneri (body: { query: "..." })
// ---------------------------------------------------------------------
app.post('/api/ai-search', aiSearchLimiter, async (req, res) => {
  try {
    const q = (req.body.query || '').toLowerCase();

    const filters = {
      maxPrice: null,
      minPrice: null,
      brand: null,
      nfc: q.includes('nfc'),
      // "telefoto"/"zoom"/"ön kamera"/"selfie" geçen sorgularda genel kamera
      // (MP) sıralamasına değil, kendi özel kriterine (zoom/selfie) düşsün
      // "kamera düğmesi/düğmeli/kumandası" (fiziksel deklanşör düğmesi)
      // burada da hariç tutuluyor — aksi halde "kamera düğmeli ucuz
      // telefon" sorgusu hem bu genel MP/lens kalite puanlamasını HEM
      // cameraButton sert filtresini birlikte tetikliyor, ve "ucuz"
      // isteğine rağmen düğmeli telefonlar arasında en UCUZ değil en
      // ZENGİN kamera sistemine sahip olanı (Sony Xperia 1 VII, 64.999
      // TL) öneriyordu — oysa aynı düğmeye sahip iPhone 16 (55.999 TL)
      // daha ucuzdu. Düğme sorgusu kamera KALİTESİYLE değil donanımsal
      // bir anahtarla ilgili, ikisi karıştırılmamalı.
      camera: q.includes('kamera')
        && !q.includes('ön kamera') && !q.includes('selfie')
        && !q.includes('telefoto') && !q.includes('zoom') && !q.includes('uzak çekim')
        && !q.includes('düğme') && !q.includes('kumanda'),
      battery: q.includes('pil') || q.includes('batarya'),
      // "en iyi" kasıtlı olarak burada YOK — çok belirsiz ("en iyi kamera",
      // "en iyi telefon" gibi her şeyi kapsayabilir) ve eskiden her sorguda
      // ham donanım gücü sıralamasını tetikleyip diğer belirtilen kriterleri
      // (kamera, pil vb.) es geçiyordu. Artık sadece net güç/performans
      // niyeti (güçlü/performans/oyun) bu filtreyi tetikliyor.
      top: q.includes('güçlü') || q.includes('performans') || q.includes('oyun'),
      light: q.includes('hafif') || q.includes('kompakt'),
      durable: q.includes('dayanıklı') || q.includes('su geçirmez') || q.includes('sağlam'),
      fastCharge: q.includes('hızlı şarj') || q.includes('çabuk şarj'),
      wirelessCharge: q.includes('kablosuz şarj'),
      zoom: q.includes('zoom') || q.includes('telefoto') || q.includes('uzak çekim'),
      selfie: q.includes('selfie') || q.includes('ön kamera'),
      brightScreen: q.includes('parlak ekran') || q.includes('güneş') || q.includes('gün ışığı'),
      // "yenileme hızı"/"Hz" verisi 40 üründe de vardı ama hiçbir filtre
      // veya arayüz alanı bunu kullanmıyordu — toplanan ama hiç
      // sorgulanamayan "ölü veri" idi. Artık gerçek bir sert filtre:
      // katalogda hem 60Hz (çoğu temel iPhone) hem 120/144Hz ürün olduğu
      // için bu ayrım anlamlı sonuç üretebiliyor.
      highRefreshRate: /120\s*hz|144\s*hz|yüksek yenileme|akıcı ekran/.test(q),
      // Bunlar "hangisi daha iyi" değil "var mı yok mu" soruları — NFC gibi
      // net bir gereksinim, o yüzden soft puanlama yerine SQL'de sert filtre
      // olarak uygulanıyor (aşağıda conditions.push).
      video8k: q.includes('8k') || q.includes('8 k'),
      satellite: q.includes('uydu'),
      // "katlanabilir" tam kelimesi aranıyordu — ama "katlanan telefon"
      // (farklı bir çekim: katlan-an, katlan-ır vb.) da en az o kadar
      // doğal bir ifade ve HİÇ eşleşmiyordu. "katlan" fiil kökü tüm
      // çekimlerde (katlanabilir/katlanan/katlanır/katlandığında) ortak.
      foldable: q.includes('katlan') || q.includes('fold'),
      stylus: q.includes('s pen') || q.includes('kalem') || q.includes('stylus'),
      // "kumanda" tek başına TV/klima kızılötesi kumandası demek, ama
      // Apple'ın Türkçe pazarlamasında "Kamera Kumandası" (Camera
      // Control) düğmesinin adı da bu kelimeyi içeriyor — "kamera
      // kumandalı ucuz telefon" dediğinde ikisi de tetiklenip
      // (has_ir_blaster=true AND has_camera_button=true) kesişimi boş
      // küme çıkarıyordu (o iki özelliğe birlikte sahip TEK ürün yok),
      // sonuç sessizce "SONUÇ YOK" oluyordu. "kamera kumanda-" öbeği
      // varsa bu sadece kamera düğmesi demektir, IR kumandasıyla alakasız.
      irBlaster: (q.includes('kumanda') && !q.includes('kamera kumanda')) || q.includes('kızılötesi') || q.includes('ir blaster'),
      faceUnlock: q.includes('yüz tanıma') || q.includes('face id'),
      physicalSim: q.includes('fiziksel sim') || q.includes('fiziksel kart'),
      // Sony Xperia'nın eklenmesiyle gelen üç yeni özellik: kulaklık
      // girişi ve hafıza kartı deposu artık katalogda GERÇEKTEN ayrım
      // yaratıyor (Sony bunları koruyor, geri kalan hiçbir marka
      // korumuyor); kamera düğmesi ise Apple'ın iPhone 16 nesliyle
      // gelen "Kamera Kumanda" düğmesi VE Sony'nin fiziksel deklanşörü
      // için ortak bir filtre.
      // İLK SÜRÜMDE bu üçü tam kelime öbeği arıyordu ("kulaklık girişi",
      // "hafıza kartı", "kamera düğmesi") — ama Türkçe eklemeli bir dil:
      // kullanıcı çok daha doğal olarak "kulaklık GİRİŞLİ telefon",
      // "hafıza KARTLI telefon", "kamera DÜĞMELİ telefon" der (iyelik eki
      // "-i" yerine sıfat eki "-li"). Tam öbek arandığı için bu son derece
      // doğal ifadeler HİÇ eşleşmiyordu — kanıt: "kamera düğmeli ucuz
      // telefon" filtreyi hiç tetiklemeden genel "kamera" anahtar
      // kelimesine (kamera düğmesiyle alakasız MP bazlı kamera puanlamasına)
      // düşüyor, "hafıza kartlı"/"kulaklık girişli" ise HİÇBİR filtreye
      // düşmeden sessizce en ucuz telefonu (kamerayla/girişle hiç ilgisi
      // olmayan Redmi Note 15 5G) öneriyordu. Kök kelimeyi (sondaki
      // iyelik/sıfat ekini olmadan) aramak her iki çekimi de yakalıyor.
      headphoneJack: (q.includes('kulaklık') && q.includes('giriş')) || q.includes('3.5mm') || q.includes('3,5mm') || q.includes('aux'),
      expandableStorage: q.includes('hafıza kart') || q.includes('microsd') || q.includes('sd kart'),
      cameraButton: q.includes('kamera düğme') || q.includes('deklanşör') || q.includes('kamera kumanda') || q.includes('çekim düğme'),
      // ESKİDEN "ucuz"/"pahalı" hiç tanınmıyordu — sadece BAŞKA hiçbir
      // kriter yokken varsayılan "ucuza göre sırala" davranışıyla ucuz
      // isteği tesadüfen karşılanıyordu. Ama "hızlı şarj olan UCUZ telefon"
      // gibi bir sorguda bu kelime tamamen görmezden gelinip sonuç
      // katalogdaki EN PAHALI hızlı şarj telefonu olabiliyordu — "pahalı"
      // için de aynı şekilde tersi oluyordu. Artık ikisi de gerçek birer
      // yumuşak kriter, diğerleriyle birlikte harmanlanıyor.
      cheap: q.includes('ucuz') || q.includes('ekonomik'),
      expensive: q.includes('pahalı') || q.includes('lüks') || q.includes('premium') || q.includes('üst segment'),
      // Ekran boyutu, RAM ve çıkış yılı 48 üründe de vardı ama hiçbir
      // sorgu bunları kullanmıyordu — "büyük ekranlı"/"yüksek ram'li"/
      // "en yeni" gibi son derece doğal istekler hiç karşılık bulmadan
      // sessizce en ucuz telefona düşüyordu.
      bigScreen: q.includes('büyük ekran') || q.includes('geniş ekran'),
      smallScreen: q.includes('küçük ekran') || q.includes('mini ekran'),
      highRam: q.includes('yüksek ram') || q.includes('bol ram') || q.includes('çok ram') || q.includes('büyük ram'),
      newest: q.includes('en yeni') || q.includes('yeni çıkan') || q.includes('son model') || q.includes('son çıkan'),
    };
    // Renk sorgusu: query'de geçen ilk renk kökünü (ek almadan, "mavi"
    // hem "Mavi Titanyum" hem "Buzul Mavisi" içinde alt-dize olarak
    // eşleşir) bul. Eşleşme varsa SERT filtre olarak uygulanıyor —
    // "mavi telefon" dendiğinde mavi seçeneği OLMAYAN bir telefon
    // önerilmemeli.
    const COLOR_KEYWORDS = ['siyah', 'beyaz', 'mavi', 'kırmızı', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'gümüş', 'altın', 'turuncu', 'lacivert', 'turkuaz', 'lavanta', 'bej', 'titanyum'];
    const colorMatch = COLOR_KEYWORDS.find(c => q.includes(c));
    // "X olmayan/olmadan telefon" — kullanıcı özelliğin TERSİNİ istiyor.
    // Önceden bu hiç fark edilmiyordu: "kablosuz şarjı olmayan telefon"
    // sorgusu "kablosuz şarj" alt dizesi hâlâ eşleştiği için normal
    // (pozitif, en yüksek W'ı maksimize eden) davranışı tetikliyor ve
    // kataloğun EN HIZLI kablosuz şarj eden telefonunu (80W) öneriyordu
    // — istenenin tam tersi. Aşağıdaki ikili (var/yok) özellikler için
    // negasyon artık destekleniyor (aşağıdaki sert filtre bloğuna bakın).
    //
    // İLK SÜRÜM sadece "olmayan"/"olmadan" kelimelerini arıyordu — ama
    // Türkçe'de olumsuz sıfat-fiil eki HANGİ FİİLE eklenirse eklensin
    // her zaman "-meyen"/"-mayan" ile biter (ünlü uyumu: e/a): "olmayan"
    // (ol-ma-yan), ama aynı zamanda "çekemeyen" (çek-e-me-yen, "8K
    // çekemeyen telefon"), "desteklemeyen" (destekle-me-yen), "içermeyen"
    // (içer-me-yen) de bu kalıba uyuyor. Sadece "olmayan" arandığı için
    // "8k video çekemeyen telefon" hiç negatif algılanmıyor, "çekemeyen"
    // yine de "8k" alt dizesiyle POZİTİF filtreyi tetikleyip 8K
    // ÇEKEBİLEN bir telefonu (istenenin tam tersini) öneriyordu. Fiil
    // kökünden bağımsız olarak eki (meyen/mayan) aramak bu sınıftaki
    // TÜM olumsuz ifadeleri tek seferde yakalıyor.
    const negated = /meyen|mayan/.test(q) || q.includes('olmadan');
    // "25 bin", "25bin", "30k", "25.000 TL", "25,000TL", "100.000 tl" gibi
    // biçimlerin hepsini yakalar. Sayı grubu ondalık/binlik ayraçlı da
    // olabilir (\d{1,3}(?:[.,]\d{3})*) — bu durumda "bin"/"k" ile TEKRAR
    // çarpmıyoruz (aksi halde "25.000 bin TL" gibi anlamsız bir değer
    // çıkardı); sadece ayraçsız "25 bin" gibi kısaltmalarda ×1000 yapıyoruz.
    //
    // "4k"/"8k" (video çözünürlüğü) fiyat regex'iyle ÇAKIŞIYORDU: "8K video
    // çekebilen telefon" sorgusunda "8k" -> 8.000 TL bütçesi olarak
    // yanlış algılanıyordu (hiçbir telefon 8.000 TL altında olmadığı için
    // filtre sessizce tüm listeye düşüyordu, ama "reasons" metninde hâlâ
    // "Bütçenin (8.000 TL) altında: 44999 TL" gibi anlamsız/çelişkili bir
    // satır görünüyordu). Fiyatı SADECE bu iki bilinen çözünürlük kalıbı
    // çıkarılmış bir kopya üzerinde arıyoruz; "video8k" filtresi orijinal
    // q'ya bakmaya devam ediyor, etkilenmiyor.
    // KRİTİK DÜZELTME: \d{1,3} (en fazla 3 basamak) kullanılıyordu — bu,
    // ayraçsız 4+ basamaklı düz sayıları (ki insanların fiyat yazma
    // biçiminin BÜYÜK ÇOĞUNLUĞU budur: "20000 TL", "25000 tl" gibi)
    // TAMAMEN YANLIŞ parse ediyordu. Örnek: "25000 tl" regex'i SADECE
    // sondaki "000"u yakalıyor, baştaki "25"i YUTUYORDU — sonuç
    // maxPrice=0 (JS'te 0 falsy olduğu için "if (filters.maxPrice)"
    // kontrolü hiç çalışmıyor, bütçe filtresi SESSİZCE tamamen devre dışı
    // kalıyordu). Somut kanıt: "25000 TL altı kamera odaklı telefon"
    // sorgusu 109.999 TL'lik bir telefon öneriyordu, hiçbir bütçe uyarısı
    // olmadan. \d+ (sınırsız basamak) kullanmak hem bu düz sayı biçimini
    // DOĞRU yakalıyor hem de "25.000"/"100.000" gibi noktalı/virgüllü
    // binlik ayraçlı biçimleri de bozmadan destekliyor.
    const qForPrice = q.replace(/\b[248]k\b/g, '');
    // Bir "N bin/k/TL" eşleşmesini gerçek TL değerine çevirir — hem tek
    // fiyat hem de aralık ("X ile Y arası") ayrıştırması bunu paylaşıyor.
    function parseAmount(numGroup, unit) {
      const hasThousandsSep = /[.,]\d{3}/.test(numGroup);
      const rawNum = numGroup.replace(/[.,]/g, '');
      let value = parseInt(rawNum, 10);
      if ((unit === 'bin' || unit === 'k') && !hasThousandsSep) value *= 1000;
      return value;
    }

    // ESKİDEN "50000 ile 80000 arası telefon" gibi ARALIK sorguları HİÇ
    // tanınmıyordu (tek sayı yakalayan regex boşa çıkıyordu çünkü aralarda
    // "tl"/"bin" geçmeyebiliyordu) — sonuç, bütçe tamamen yok sayılıp
    // katalogdaki en ucuz telefonun (17.949 TL) önerilmesiydi, istenen
    // 50-80 bin aralığıyla hiç ilgisi olmadan. Artık "X (ile/ila/-) Y
    // aras-" kalıbı önce deneniyor; eşleşirse hem minPrice hem maxPrice
    // birlikte set ediliyor.
    const rangeMatch = qForPrice.match(
      /(\d+(?:[.,]\d{3})*)\s*(bin|k)?\s*(?:ile|ila|-)\s*(\d+(?:[.,]\d{3})*)\s*(bin|k|tl)?\s*aras/
    );
    if (rangeMatch) {
      const unitA = rangeMatch[2] || rangeMatch[4];
      const unitB = rangeMatch[4] || rangeMatch[2];
      const a = parseAmount(rangeMatch[1], unitA);
      const b = parseAmount(rangeMatch[3], unitB);
      filters.minPrice = Math.min(a, b);
      filters.maxPrice = Math.max(a, b);
    } else {
      const priceMatch = qForPrice.match(/(\d+(?:[.,]\d{3})*)\s*(bin|k|tl)/);
      if (priceMatch) {
        const value = parseAmount(priceMatch[1], priceMatch[2]);

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
    }

    // Marka tespiti: sorguda birden fazla marka adı geçerse (nadir ama
    // olası, örn. "Samsung değil de iPhone istiyorum"), sıralı if
    // zincirinde SONUNCU eşleşen marka kazanıyordu — bu, kullanıcının
    // asıl kastettiğiyle alakasız, kod sırasına bağlı bir davranıştı.
    // Artık sorgu metninde EN ÖNCE geçen marka adı kazanıyor, çünkü
    // insanlar genelde asıl istedikleri markayı önce söyler.
    const BRAND_KEYWORDS = [
      { brand: 'Apple', keywords: ['apple', 'iphone'] },
      { brand: 'Samsung', keywords: ['samsung', 'galaxy'] },
      { brand: 'Xiaomi', keywords: ['xiaomi', 'redmi', 'poco'] },
      { brand: 'Google', keywords: ['google', 'pixel'] },
      { brand: 'OnePlus', keywords: ['oneplus', 'one plus'] },
      { brand: 'Sony', keywords: ['sony', 'xperia'] },
      { brand: 'Honor', keywords: ['honor'] },
    ];
    let earliestBrandIdx = Infinity;
    for (const { brand, keywords } of BRAND_KEYWORDS) {
      for (const kw of keywords) {
        const idx = q.indexOf(kw);
        if (idx !== -1 && idx < earliestBrandIdx) {
          earliestBrandIdx = idx;
          filters.brand = brand;
        }
      }
    }
    // "POCO"/"Redmi" ŞİRKET olarak Xiaomi'ye ait, ama kullanıcı bu kelimeyi
    // yazdığında brand=Xiaomi'ye genellemek yanlış: "POCO telefon" yazan
    // biri eskiden Xiaomi markalı en ucuz telefon olan bir REDMI ürünü
    // görüyordu, hiç POCO ürünü değil. Alt-marka adı ürün isminin BAŞINDA
    // olduğu için (ör. "POCO F7...", "Redmi Note 15..."), isim öneki ile
    // daha kesin bir eşleştirme yapıyoruz.
    let subBrandPrefix = null;
    if (q.includes('poco')) subBrandPrefix = 'POCO';
    else if (q.includes('redmi')) subBrandPrefix = 'Redmi';

    const conditions = [`c.slug = 'telefon'`];
    const params = [];
    if (filters.brand) { params.push(filters.brand); conditions.push(`b.name = $${params.length}`); }
    if (subBrandPrefix) { params.push(subBrandPrefix + '%'); conditions.push(`p.canonical_name ILIKE $${params.length}`); }
    // Aşağıdaki ikili (var/yok) filtrelerin hepsi "negated" bayrağına
    // göre YÖN DEĞİŞTİRİYOR — "X olan" isteniyorsa true, "X olmayan"
    // isteniyorsa false aranıyor.
    if (filters.nfc) conditions.push(`(p.specs->>'has_nfc')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.video8k) conditions.push(`(p.specs->>'video_8k')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.satellite) conditions.push(`(p.specs->>'satellite_connectivity')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.foldable) conditions.push(`(p.specs->>'is_foldable')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.stylus) conditions.push(`(p.specs->>'has_stylus_support')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.irBlaster) conditions.push(`(p.specs->>'has_ir_blaster')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.faceUnlock) { params.push('Face ID (yüz tanıma)'); conditions.push(`p.specs->>'biometric_unlock' ${negated ? '!=' : '='} $${params.length}`); }
    if (filters.physicalSim) {
      conditions.push(negated
        ? `(p.specs->>'sim_type') = 'Sadece eSIM'`
        : `(p.specs->>'sim_type') IS DISTINCT FROM 'Sadece eSIM'`);
    }
    if (filters.highRefreshRate) conditions.push(`(p.specs->>'refresh_rate_hz')::int ${negated ? '<' : '>='} 120`);
    if (filters.headphoneJack) conditions.push(`(p.specs->>'has_headphone_jack')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.expandableStorage) conditions.push(`(p.specs->>'has_expandable_storage')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.cameraButton) conditions.push(`(p.specs->>'has_camera_button')::boolean = ${negated ? 'false' : 'true'}`);
    // wirelessCharge normalde SOFT bir metrik (en yüksek W'ı maksimize
    // eder) — ama "kablosuz şarjı OLMAYAN" tam bir "hiç yok" isteği,
    // düşük-ama-mevcut bir wattaj bu isteği karşılamaz. Negatifse sert
    // filtreye çeviriyoruz (aşağıda activeSoftKeys'ten de çıkarılıyor).
    if (filters.wirelessCharge && negated) conditions.push(`(p.specs->>'wireless_charging_watts') IS NULL`);
    if (colorMatch) {
      params.push(`%${colorMatch}%`);
      conditions.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.specs->'colors') AS col WHERE col ILIKE $${params.length})`);
    }

    // ALLOWED_SELLERS'ı params'ın SONUNA ekliyoruz (mevcut dinamik
    // filtrelerin numaralandırmasını bozmadan) ve alt sorgulardaki
    // JOIN'lerde bu satıcı kısıtlamasını uyguluyoruz — böylece AI'ın
    // önerdiği fiyat/satıcı/link HER ZAMAN sitede gösterilen üç
    // satıcıdan (Hepsiburada/Trendyol/Amazon TR) biri oluyor.
    params.push(ALLOWED_SELLERS);
    const sellersParamIdx = params.length;
    const { rows: candidates } = await pool.query(
      `SELECT p.id, p.canonical_name, b.name AS brand, p.specs,
              (SELECT MIN(o.price) FROM offers o JOIN sellers s2 ON s2.id = o.seller_id
                 WHERE o.product_id = p.id AND s2.name = ANY($${sellersParamIdx}::text[])) AS best_price,
              (SELECT s.name FROM offers o JOIN sellers s ON s.id = o.seller_id
                 WHERE o.product_id = p.id AND s.name = ANY($${sellersParamIdx}::text[])
                 ORDER BY o.price ASC LIMIT 1) AS best_seller,
              (SELECT o.affiliate_url FROM offers o JOIN sellers s3 ON s3.id = o.seller_id
                 WHERE o.product_id = p.id AND s3.name = ANY($${sellersParamIdx}::text[])
                 ORDER BY o.price ASC LIMIT 1) AS best_url
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${conditions.join(' AND ')}`,
      params
    );
    // best_price NULL demek: bu ürünün Hepsiburada/Trendyol/Amazon TR
    // üzerinde HİÇ teklifi yok (satış yok). Burada candidates'tan
    // ÇIKARMIYORUZ — çünkü kullanıcı ismiyle o modeli sorarsa ("iPhone
    // 17 Pro" gibi) exact-match'in onu bulup dürüstçe "satışta değil"
    // demesi gerekiyor; sessizce farklı bir modele kaymak, çözdüğümüz
    // "iPhone 17 Pro yazınca iPhone 13 mini öneriliyordu" hatasının
    // aynısını farklı bir yoldan geri getirirdi. Satılamayan ürünler
    // sadece GENEL (isim aranmayan) öneri havuzundan çıkarılıyor —
    // aşağıya bakın.

    // ESKİDEN belirli bir model adı yazan biri (ör. "iPhone 17 Pro") hiç
    // dikkate alınmıyordu — sadece marka tespit edilip o markanın EN UCUZ
    // ürünü öneriliyordu (kanıt: "iPhone 17 Pro" yazınca "iPhone 13 mini"
    // öneriliyordu, aralarında hiçbir ilişki yokken). Şimdi her adayın
    // ürün adından (depolama/"apple"/"samsung"/"5g"/"nfc" gibi genel
    // sonekler çıkarılmış) anlamlı kelimeleri sorguda ARANIYOR; sorgu bir
    // ürünün TÜM kelimelerini içeriyorsa (ve en az biri model numarası
    // gibi rakam taşıyorsa) o ürün doğrudan sonuç oluyor. Birden fazla
    // varyant eşleşirse (ör. "iPhone 17 Pro" hem "17 Pro" hem "17 Pro
    // Max"a alt-küme olarak uyar) en FAZLA kelime eşleşen (en spesifik)
    // varyant kazanıyor — "17 Pro Max" sorgusu yanlışlıkla sade "17 Pro"ya
    // düşmüyor.
    function modelTokens(name) {
      return name
        .toLowerCase()
        .replace(/\+/g, ' plus ')
        .replace(/\d+\s?gb\b/g, ' ')
        .replace(/[^\wçğıöşü0-9\s]/g, ' ')
        .split(/\s+/)
        // "apple"/"samsung"/"google" gibi şirket adları buradan çıkarılıyor
        // çünkü kullanıcılar model ararken bunları SÖYLEMEZ ("iPhone 17
        // Pro" der, "Apple iPhone 17 Pro" demez — "Pixel 10 Pro" der,
        // "Google Pixel 10 Pro" demez). "google" burada eksikti: "pixel 10
        // pro" araması, tokens listesinde hâlâ zorunlu duran "google"
        // kelimesi sorguda hiç geçmediği için hiçbir zaman tam eşleşme
        // SAYILMIYOR, bunun yerine markaya göre filtrelenmiş havuzdaki
        // varsayılan (en ucuz) ürüne düşülüyordu — kanıt: "pixel 10 pro"
        // yanlışlıkla "Google Pixel 10" (Pro OLMAYAN, temel model) sonucu
        // veriyordu. Xiaomi/Redmi/POCO/OnePlus buradan hariç tutulmuyor
        // çünkü onlar gerçekten kullanıcıların söylediği ürün hattı adları.
        // "galaxy" da benzer sebeple eklendi: Z serisinde kullanıcılar
        // neredeyse hiç "Galaxy" demeden sadece "Z Fold7"/"Fold7" diyor —
        // "galaxy" zorunlu tutulduğunda bu isimler HİÇ tam eşleşmiyor,
        // sorgu bunun yerine genel "katlanabilir" anahtar kelime filtresine
        // düşüp o filtrenin havuzundaki EN UCUZ telefonu (ki Fold7 değil,
        // Flip7 FE'ydi) yanlışlıkla öneriyordu.
        // "sony" da aynı sebeple eklendi: kullanıcılar "Xperia 1 VII" der,
        // "Sony Xperia 1 VII" demez (marka adı "Xperia" ürün hattı adının
        // gölgesinde kalıyor — tıpkı "Pixel" gibi). "Honor" burada YOK,
        // çünkü Xiaomi/OnePlus gibi kullanıcılar bunu genelde söylüyor.
        //
        // t.length > 1 kuralı tek karakterli "gürültü" kelimelerini
        // (örn. "Z Fold7"deki yalnız "z") elemek için var — ama "Sony
        // Xperia 1 VII" gibi modellerde tek haneli "1" GÜRÜLTÜ DEĞİL,
        // modelin kendisini belirleyen rakam (Xperia 1 ile Xperia 10 iki
        // AYRI, ilgisiz ürün hattı). Bu kural tüm tek karakterleri kör
        // kör eliyordu: "1" tokeni hiç hayatta kalmıyor, dolayısıyla
        // "Xperia 1 VII" hiçbir zaman tam eşleşme sayılmıyor (hasNumber
        // kontrolü bile geçemiyor) ve sorgu "xperia 1 vii" yazınca
        // markaya göre filtrelenmiş havuzdaki EN UCUZ Sony telefonuna
        // (Xperia 10 VII) düşülüyordu. Çözüm: rakam olan tek karakterleri
        // (uzunluğuna bakmaksızın) koru, sadece tek harfleri ele.
        .filter(t => (t.length > 1 || /\d/.test(t)) && !['apple', 'samsung', 'google', 'galaxy', 'sony', '5g', '4g', 'nfc'].includes(t));
    }
    // q.includes(t) düz alt-dize araması yapıyordu — bu, bir tokenin
    // BAŞKA bir tokenin İÇİNDE geçtiği durumlarda YANLIŞ eşleşme
    // üretiyordu: "13" tokeni "13r" sorgu metninin bir alt-dizesi olduğu
    // için "OnePlus 13R" araması "OnePlus 13"ü de eşit derecede
    // (tokens.length ikisi için de 2) eşleşmiş sayıyor, ardından SQL'in
    // döndürdüğü rastgele sıraya göre hangisinin kazanacağı belirleniyordu.
    // Kanıt: "iphone 17e" sorgusu da aynı sebeple "iPhone 17"yi
    // döndürüyordu ("17" tokeni "17e"nin içinde geçiyor). Kelime sınırı
    // (lookbehind/lookahead ile [a-z0-9] olmayan bir sınır) zorunlu
    // kılınarak "13" artık "13r" içinde EŞLEŞMİYOR.
    function tokenPresentInQuery(query, token) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(query);
    }
    // Ürün adlarındaki "+" işareti modelTokens() içinde "plus" kelimesine
    // çevriliyor (ör. "Galaxy S26+" -> tokens: [..., 'plus']), ama sorgu
    // metni AYNI dönüşümden GEÇMİYORDU — kullanıcı "galaxy s26+" yazdığında
    // (ürünün resmi adını birebir yazmış olmasına rağmen) "plus" tokeni
    // sorguda hiç bulunamıyor, ve S26+ yerine sade S26 öneriliyordu.
    const qForModelMatch = q.replace(/\+/g, ' plus ');
    // "galaxy" çıkarıldıktan sonra bazı modellerin (Z Fold7, Z Flip7, S26,
    // A56...) geriye TEK bir token'ı kalıyor (ör. "fold7", "s26"). Genel
    // kural en az 2 token istiyor (tek başına "13" veya "pro" gibi belirsiz
    // kelimelerin yanlışlıkla tetiklenmesini önlemek için) — ama bu tek
    // token hem harf hem rakam içeren "bileşik" bir model kodu ise (ör.
    // "fold7", "s26", "a56", "13r") zaten yeterince spesifik/az çakışma
    // riskli, o yüzden tek başına da tam eşleşme sayılabilir.
    const isCompoundToken = t => /[a-z]/.test(t) && /\d/.test(t);
    let exactMatch = null;
    let exactMatchScore = 0;
    for (const c of candidates) {
      const tokens = modelTokens(c.canonical_name);
      const hasNumber = tokens.some(t => /\d/.test(t));
      const meetsMinimum = tokens.length >= 2 || (tokens.length === 1 && isCompoundToken(tokens[0]));
      const allPresent = meetsMinimum && hasNumber && tokens.every(t => tokenPresentInQuery(qForModelMatch, t));
      if (allPresent && tokens.length > exactMatchScore) {
        exactMatchScore = tokens.length;
        exactMatch = c;
      }
    }

    let pool_ = candidates;
    if (exactMatch) {
      // İsimle arandığında satışta olmasa bile bulunan ÜRÜNÜN KENDİSİ
      // gösteriliyor — aşağıda best_price null ise "satışta değil"
      // diye dürüstçe belirtiliyor, farklı bir modele kaymıyoruz.
      pool_ = [exactMatch];
    } else {
      // Genel (isim aranmayan: "en güçlü model", "ucuz telefon" gibi)
      // sorgularda satışta olmayan ürünler öneri havuzuna hiç girmiyor
      // — kullanıcı özellikle istemediği sürece satın alınamayacak bir
      // şeyi önermek yanlış olur.
      pool_ = candidates.filter(c => c.best_price !== null);
    }
    // budgetUnmet: bütçeyi karşılayan HİÇBİR telefon yoksa true olur — bu
    // durumda tüm listeye geri düşülüyor (boş sonuç göstermektense en
    // yakın/en uygun seçeneği gösteriyoruz), ama aşağıdaki "reasons"
    // metninde ARTIK "bütçenin altında" diye YANLIŞ bir iddiada
    // bulunmuyoruz — bunun yerine dürüstçe bütçenin karşılanamadığını
    // söylüyoruz (ör. "8.000 TL altı" sorgusunda hiçbir telefon o kadar
    // ucuz değilken eskiden hâlâ "Bütçenin (8.000 TL) altında: 17.949 TL"
    // gibi çelişkili/yanlış bir satır gösteriliyordu).
    let budgetUnmet = false;
    if (filters.maxPrice && filters.minPrice) {
      // Aralık sorgusu ("50 bin ile 80 bin arası") — ESKİDEN if/else-if
      // zinciri yüzünden minPrice hiç uygulanmıyordu, sadece maxPrice
      // kontrol ediliyordu.
      const inRange = pool_.filter(c => c.best_price >= filters.minPrice && c.best_price <= filters.maxPrice);
      budgetUnmet = inRange.length === 0;
      pool_ = inRange.length > 0 ? inRange : pool_;
    } else if (filters.maxPrice) {
      const underBudget = pool_.filter(c => c.best_price <= filters.maxPrice);
      budgetUnmet = underBudget.length === 0;
      pool_ = underBudget.length > 0 ? underBudget : pool_;
    } else if (filters.minPrice) {
      const overBudget = pool_.filter(c => c.best_price >= filters.minPrice);
      budgetUnmet = overBudget.length === 0;
      pool_ = overBudget.length > 0 ? overBudget : pool_;
    }

    let topReasoning = null;
    let topUsedAI = false;

    // ESKİDEN: sorgu birden fazla kriter içerse bile ("hafif VE pili uzun
    // bir telefon" gibi) if/else zinciri SADECE İLK eşleşen kriteri
    // uyguluyor, geri kalanını tamamen görmezden geliyordu — bu da "daha
    // doğru" değil, rastgele kod-sırasına bağlı bir öneri üretiyordu.
    // ŞİMDİ: sorguda geçen TÜM yumuşak (soft) kriterler için her adayın
    // 0-100 aralığında normalize edilmiş bir alt-puanı hesaplanıyor, bu
    // puanların ortalaması alınıp öyle sıralanıyor — böylece birden fazla
    // istek aynı anda dikkate alınıyor.
    const normalize = (value, min, max) => (max <= min ? 50 : ((value - min) / (max - min)) * 100);
    const SOFT_METRICS = {
      // SADECE ana sensörün megapiksel sayısına bakmak yanıltıcı: bütçe
      // telefonları genelde tek büyük-MP'li (ör. 200MP) ama başka lensi
      // olmayan bir sensörle "kağıt üzerinde" kazanıyordu — örn. 18.000 TL
      // bir telefon salt "200MP" yazdığı için, geniş açı+telefoto+optik
      // zoom'a sahip 37.000 TL'lik çok daha yetenekli bir kamera sistemine
      // sahip telefonun ÖNÜNE geçiyordu (gerçek fotoğraf kalitesinde MP
      // sayısı ~50'den sonra ciddi şekilde düzleşir — sensör boyutu/piksel
      // birleştirme sınırları yüzünden). Artık ana kamera katkısı 50MP'de
      // tavanlanıyor, ikincil lensler (geniş açı/telefoto) ve optik zoom da
      // puana ekleniyor — böylece "kamera odaklı" gerçekten daha yetenekli/
      // çok lensli sistemleri öne çıkarıyor, tek şişirilmiş MP sayısını değil.
      camera: c => {
        const main = Math.min(c.specs.main_camera_mp || 0, 50);
        const ultra = c.specs.ultra_wide_mp || 0;
        const tele = c.specs.telephoto_mp || 0;
        const zoomBonus = (c.specs.optical_zoom_x || 0) * 10;
        return main + ultra * 0.4 + tele * 0.4 + zoomBonus;
      },
      zoom: c => c.specs.optical_zoom_x || 0,
      selfie: c => c.specs.front_camera_mp || 0,
      battery: c => c.specs.battery_mah || 0,
      fastCharge: c => c.specs.wired_charging_watts || 0,
      wirelessCharge: c => c.specs.wireless_charging_watts || 0,
      light: c => -(c.specs.weight_g || 9999), // negatif: daha hafif = daha yüksek normalize puan
      // IP69 (toz+basınçlı su) > IP68 > diğer
      durable: c => ((c.specs.ip_rating || '').includes('69') ? 2 : (c.specs.ip_rating || '').includes('68') ? 1 : 0),
      brightScreen: c => c.specs.screen_nits || 0,
      cheap: c => -Number(c.best_price || 0), // negatif: ucuz = yüksek puan
      expensive: c => Number(c.best_price || 0),
      bigScreen: c => c.specs.screen_inch || 0,
      smallScreen: c => -(c.specs.screen_inch || 999), // negatif: küçük ekran = yüksek puan
      highRam: c => c.specs.ram_gb || 0,
      newest: c => c.specs.release_year || 0,
    };
    // wirelessCharge negatifse (yukarıda sert filtreye çevrildi, "hiç
    // yok" aranıyor) artık bir soft-metrik olarak "en yüksek W" diye
    // ayrıca puanlanmasın — aksi halde kablosuz şarjı OLMAYAN telefonlar
    // arasında (hepsi 0 puan alacağından) anlamsız bir tiebreak olurdu.
    const activeSoftKeys = Object.keys(SOFT_METRICS).filter(k => filters[k] && !(k === 'wirelessCharge' && negated));

    if (activeSoftKeys.length === 0 && filters.top) {
      // Tek kriter: ham donanım gücü — nüanslı (ve varsa ücretli AI destekli)
      // rankByPower() yolu aynen korunuyor.
      const { ranking, reasoning, usedAI } = await rankByPower(pool_);
      const orderMap = new Map(ranking.map((id, i) => [id, i]));
      pool_.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      topReasoning = reasoning;
      topUsedAI = usedAI;
    } else if (activeSoftKeys.length > 0) {
      // Bir ya da daha fazla yumuşak kriter var (donanım gücüyle birlikte
      // istenmiş olabilir) — hepsini tek bir bileşik puanda harmanla.
      // "top" da isteniyorsa, ücretli AI çağrısı yapmadan (bileşik puanla
      // uyumlu, anlık) computeHardwareScore()'u ek bir bileşen olarak katıyoruz.
      const ranges = {};
      for (const key of activeSoftKeys) {
        const values = pool_.map(SOFT_METRICS[key]);
        ranges[key] = { min: Math.min(...values), max: Math.max(...values) };
      }
      let hwRange = null;
      if (filters.top) {
        const hwValues = pool_.map(computeHardwareScore);
        hwRange = { min: Math.min(...hwValues), max: Math.max(...hwValues) };
      }

      // "ucuz"/"pahalı" birlikte başka bir kriterle (ör. "hızlı şarj")
      // istendiğinde EŞİT ağırlıklı ortalama yanıltıcı sonuç verebiliyordu:
      // katalogdaki EN UÇ değere sahip bir telefon (ör. 120W ile en hızlı
      // şarj) fiyatı 2 katına çıksa bile salt o tek boyuttaki aşırılığı
      // sayesinde "ucuz" isteğini eziyordu (POCO F7 Ultra, 120W/52.499 TL,
      // 90W/24.909 TL'lik POCO X7 Pro'yu geçiyordu — oysa ikisi arasındaki
      // hız farkı fiyat farkını hak etmiyor). Kullanıcı fiyatı AÇIKÇA
      // belirttiğinde bu genelde birincil kısıt olduğu için "cheap"/
      // "expensive" diğer kriterlere göre 2x ağırlıklı sayılıyor.
      const WEIGHT = { cheap: 2, expensive: 2 };
      const scoreOf = c => {
        let weightedSum = 0, totalWeight = 0;
        for (const key of activeSoftKeys) {
          const w = WEIGHT[key] || 1;
          weightedSum += normalize(SOFT_METRICS[key](c), ranges[key].min, ranges[key].max) * w;
          totalWeight += w;
        }
        if (hwRange) {
          weightedSum += normalize(computeHardwareScore(c), hwRange.min, hwRange.max);
          totalWeight += 1;
        }
        return weightedSum / totalWeight;
      };
      pool_.sort((a, b) => scoreOf(b) - scoreOf(a));
      if (filters.top) topReasoning = 'Donanım gücü, istediğin diğer özelliklerle birlikte değerlendirildi';
    } else {
      pool_.sort((a, b) => a.best_price - b.best_price);
    }

    const pick = pool_[0] || null;
    // İsimle arandığı için satışta olmasa bile gösterilen bir eşleşme
    // (bkz. yukarıdaki exactMatch dalı) — Number(null) SESSİZCE 0
    // verir, bu yüzden normal fiyat formatlama/gerekçe mantığına hiç
    // girmeden burada ayrı ve dürüst bir yanıt dönüyoruz.
    if (pick && pick.best_price === null) {
      return res.json({
        pick: { id: pick.id, canonical_name: pick.canonical_name, best_price: null, best_seller: null, best_url: null },
        reasons: ['Aradığın model bulundu', 'Şu an Hepsiburada, Trendyol veya Amazon TR üzerinde satışta değil'],
        candidates: [],
      });
    }
    const reasons = [];
    if (pick) {
      // pg, numeric sütunları JS'e STRING olarak döndürür ("17949.00").
      // String.prototype.toLocaleString() sayı BİÇİMLENDİRMESİ yapmaz,
      // string'i olduğu gibi geri verir — bu yüzden "reasons" metinlerinde
      // "17949.00 TL" gibi biçimlendirilmemiş fiyatlar görünüyordu (doğru
      // biçim: "17.949 TL"). Number()'a çevirmeden .toLocaleString()
      // çağırmak SESSİZCE yanlış (biçimsiz) sonuç veriyordu, hata fırlatmıyordu.
      const bestPriceNum = Number(pick.best_price);
      if (exactMatch) reasons.push('Aradığın model bulundu');
      if (filters.maxPrice && filters.minPrice) {
        const rangeLabel = `${filters.minPrice.toLocaleString('tr-TR')}-${filters.maxPrice.toLocaleString('tr-TR')} TL`;
        reasons.push(budgetUnmet
          ? `Bu aralıkta (${rangeLabel}) uygun telefon bulunamadı, en yakın seçenek gösteriliyor: ${bestPriceNum.toLocaleString('tr-TR')} TL`
          : `Belirtilen aralıkta (${rangeLabel}): ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      } else if (filters.maxPrice) {
        reasons.push(budgetUnmet
          ? `Bu bütçede (${filters.maxPrice.toLocaleString('tr-TR')} TL altı) uygun telefon bulunamadı, en uygun fiyatlı seçenek gösteriliyor: ${bestPriceNum.toLocaleString('tr-TR')} TL`
          : `Bütçenin (${filters.maxPrice.toLocaleString('tr-TR')} TL) altında: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      } else if (filters.minPrice) {
        reasons.push(budgetUnmet
          ? `Bu bütçede (${filters.minPrice.toLocaleString('tr-TR')} TL üzeri) uygun telefon bulunamadı, en yakın seçenek gösteriliyor: ${bestPriceNum.toLocaleString('tr-TR')} TL`
          : `Belirtilen (${filters.minPrice.toLocaleString('tr-TR')} TL) üzerinde: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      }
      if (filters.nfc && negated) reasons.push('NFC desteklemiyor (istediğin gibi)');
      else if (filters.nfc && pick.specs.has_nfc) reasons.push('NFC destekli');
      if (filters.wirelessCharge && negated) reasons.push('Kablosuz şarj desteklemiyor (istediğin gibi)');
      else if (filters.wirelessCharge && pick.specs.wireless_charging_watts) reasons.push(`En hızlı kablosuz şarj: ${pick.specs.wireless_charging_watts}W`);
      if (filters.camera) {
        const parts = [`${pick.specs.main_camera_mp}MP ana kamera`];
        if (pick.specs.ultra_wide_mp) parts.push(`${pick.specs.ultra_wide_mp}MP geniş açı`);
        if (pick.specs.telephoto_mp) parts.push(`${pick.specs.telephoto_mp}MP telefoto`);
        if (pick.specs.optical_zoom_x) parts.push(`${pick.specs.optical_zoom_x}x optik zoom`);
        reasons.push(`Kapsamlı kamera sistemi: ${parts.join(', ')}`);
      }
      if (filters.zoom && pick.specs.optical_zoom_x) reasons.push(`En yüksek optik zoom: ${pick.specs.optical_zoom_x}x`);
      if (filters.selfie && pick.specs.front_camera_mp) reasons.push(`En yüksek çözünürlüklü ön kamera: ${pick.specs.front_camera_mp}MP`);
      if (filters.battery) reasons.push(`Yüksek batarya kapasitesi: ${pick.specs.battery_mah}mAh`);
      if (filters.fastCharge && pick.specs.wired_charging_watts) reasons.push(`En hızlı kablolu şarj: ${pick.specs.wired_charging_watts}W`);
      if (filters.light && pick.specs.weight_g) reasons.push(`Bu segmentteki en hafif seçeneklerden: ${pick.specs.weight_g}g`);
      if (filters.durable && pick.specs.ip_rating) reasons.push(`Yüksek dayanıklılık sınıfı: ${pick.specs.ip_rating}`);
      if (filters.brightScreen && pick.specs.screen_nits) reasons.push(`Güneş altında bile okunaklı, parlak ekran: ${pick.specs.screen_nits} nit`);
      if (filters.video8k && negated) reasons.push('8K video kaydı desteklemiyor (istediğin gibi)');
      else if (filters.video8k && pick.specs.video_8k) reasons.push('8K çözünürlükte video kaydı yapabiliyor');
      if (filters.satellite && negated) reasons.push('Uydu bağlantısı yok (istediğin gibi)');
      else if (filters.satellite && pick.specs.satellite_connectivity) reasons.push('Çekim alanı dışında uydu üzerinden acil durum mesajı gönderebiliyor');
      if (filters.foldable && negated) reasons.push('Katlanabilir değil, klasik tasarım (istediğin gibi)');
      else if (filters.foldable && pick.specs.is_foldable) reasons.push(`Katlanabilir tasarım: ${pick.specs.fold_style}`);
      if (filters.stylus && negated) reasons.push('Stylus desteklemiyor (istediğin gibi)');
      else if (filters.stylus && pick.specs.has_stylus_support) reasons.push('S Pen ile kullanılabiliyor');
      if (filters.irBlaster && negated) reasons.push('Kızılötesi (IR) kumandası yok (istediğin gibi)');
      else if (filters.irBlaster && pick.specs.has_ir_blaster) reasons.push('Kızılötesi (IR) kumanda özelliği var — TV, klima gibi cihazları telefonla yönetebilirsin');
      if (filters.faceUnlock && pick.specs.biometric_unlock) reasons.push(`Kilit açma yöntemi: ${pick.specs.biometric_unlock}`);
      if (filters.physicalSim && pick.specs.sim_type) reasons.push(`SIM desteği: ${pick.specs.sim_type}`);
      if (filters.highRefreshRate && negated && pick.specs.refresh_rate_hz) reasons.push(`Standart yenileme hızlı ekran: ${pick.specs.refresh_rate_hz}Hz`);
      else if (filters.highRefreshRate && pick.specs.refresh_rate_hz) reasons.push(`Yüksek yenileme hızlı, akıcı ekran: ${pick.specs.refresh_rate_hz}Hz`);
      if (filters.headphoneJack && negated) reasons.push('Kulaklık girişi yok (istediğin gibi)');
      else if (filters.headphoneJack && pick.specs.has_headphone_jack) reasons.push('3.5mm kulaklık girişi var — kablosuz kulaklığa gerek kalmadan bağlanabiliyorsun');
      if (filters.expandableStorage && negated) reasons.push('Hafıza kartı desteklemiyor (istediğin gibi)');
      else if (filters.expandableStorage && pick.specs.has_expandable_storage) reasons.push('microSD kart ile depolama alanı genişletilebiliyor');
      if (filters.cameraButton && negated) reasons.push('Fiziksel kamera düğmesi yok (istediğin gibi)');
      else if (filters.cameraButton && pick.specs.has_camera_button) reasons.push('Fiziksel kamera düğmesiyle hızlı çekim yapabiliyorsun');
      if (filters.cheap && !filters.maxPrice && !filters.minPrice) reasons.push(`Uygun fiyatlı bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      if (filters.expensive) reasons.push(`Üst segment bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      if (filters.bigScreen && pick.specs.screen_inch) reasons.push(`Bu segmentteki en büyük ekranlardan: ${pick.specs.screen_inch}"`);
      if (filters.smallScreen && pick.specs.screen_inch) reasons.push(`Kompakt, küçük ekran: ${pick.specs.screen_inch}"`);
      if (filters.highRam && pick.specs.ram_gb) reasons.push(`Yüksek RAM: ${pick.specs.ram_gb}GB`);
      if (filters.newest && pick.specs.release_year) reasons.push(`En yeni modellerden: ${pick.specs.release_year}`);
      if (colorMatch && Array.isArray(pick.specs.colors)) {
        const exactColor = pick.specs.colors.find(c => c.toLowerCase().includes(colorMatch));
        if (exactColor) reasons.push(`Bu renk seçeneğiyle satılıyor: ${exactColor}`);
      }
      if (filters.top) {
        const label = topUsedAI ? 'Yapay zeka analizi' : 'Donanım analizi';
        reasons.push(topReasoning
          ? `${label}: ${topReasoning}`
          : `En yüksek donanım seviyesi: ${pick.specs.ram_gb}GB RAM, ${pick.specs.chip}`);
      }
      if (reasons.length === 0) reasons.push(`En uygun fiyatlı seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      reasons.push(`En uygun fiyat ${pick.best_seller} üzerinden`);
    }

    res.json({ pick, reasons, candidates: pool_.slice(0, 12) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Arama yapılamadı' });
  }
});

// Sadece http/https URL'lerini kabul eder. Bunsuz bir saldırgan
// productUrl/affiliateUrl alanına "javascript:..." gibi bir URI
// verebiliyordu — bu, veritabanına öylece kaydolup sonra "Satıcıya Git"
// linki olarak render edildiğinde tıklanınca sitede JS çalıştırabilen
// depolanmış (stored) bir XSS açığıydı. Test ederek doğruladım ve
// kapattım.
function isSafeHttpUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// POST /api/ingest-offer — Scraper'ların ham ürün verisini gönderdiği uç
// nokta. Otomatik eşleştirme motorunu (match-product.js) çalıştırır.
// Body: { sellerName, rawTitle, price, currency?, productUrl, affiliateUrl?, gtin?, mpn? }
// ---------------------------------------------------------------------
app.post('/api/ingest-offer', ingestLimiter, async (req, res) => {
  try {
    const { sellerName, rawTitle, price, currency, productUrl, affiliateUrl, gtin, mpn } = req.body;
    if (!sellerName || !rawTitle || !price || !productUrl) {
      return res.status(400).json({ error: 'sellerName, rawTitle, price, productUrl zorunludur' });
    }
    if (typeof sellerName !== 'string' || typeof rawTitle !== 'string' || rawTitle.length > 300 || sellerName.length > 200) {
      return res.status(400).json({ error: 'sellerName/rawTitle geçersiz ya da çok uzun' });
    }
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ error: 'price geçerli, pozitif bir sayı olmalı' });
    }
    if (!isSafeHttpUrl(productUrl) || (affiliateUrl !== undefined && !isSafeHttpUrl(affiliateUrl))) {
      return res.status(400).json({ error: 'productUrl/affiliateUrl geçerli bir http(s) adresi olmalı' });
    }

    const { rows: sellerRows } = await pool.query('SELECT id FROM sellers WHERE name = $1', [sellerName]);
    if (sellerRows.length === 0) {
      return res.status(404).json({ error: `Satıcı bulunamadı: ${sellerName}` });
    }

    const result = await matchProduct(pool, {
      rawTitle, gtin, mpn, price: numericPrice, currency, productUrl, affiliateUrl,
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
    // Anasayfa (statik frontend'de barınıyor) ÖNCELİKLE listelenmeli —
    // önceden sadece ürün sayfaları vardı, arama motorları asıl giriş
    // noktasını (ana sayfa) bu dosyadan hiç göremiyordu.
    const homeUrl = `  <url><loc>${FRONTEND_URL}/index.html</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;
    const urls = rows.map(p =>
      `  <url><loc>${BACKEND_URL}/urun/${p.id}/${slugify(p.canonical_name)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`
    ).join('\n');
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${homeUrl}\n${urls}\n</urlset>\n`
    );
  } catch (err) {
    console.error(err);
    res.status(500).type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${BACKEND_URL}/sitemap.xml\n`);
});

// Sosyal paylaşımda (WhatsApp/Twitter/LinkedIn önizlemesi) kullanılan
// markalı görsel — og:image olarak ürün sayfalarında kullanılıyor.
// Gerçek ürün fotoğrafımız yok (telifsiz kaynak yok), o yüzden tek,
// jenerik bir marka kartı kullanıyoruz.
app.get('/og-image.png', (req, res) => {
  res.sendFile(path.join(__dirname, 'og-image.png'));
});

// Tanımsız route'lar için düz JSON 404 (Express'in varsayılan HTML
// sayfası yerine).
app.use((req, res) => {
  res.status(404).json({ error: 'Bulunamadı' });
});

// ---------------------------------------------------------------------
// Genel hata yakalayıcı — MUTLAKA en sonda olmalı (Express, 4 parametreli
// fonksiyonu error handler olarak tanır). Bozuk JSON gönderme gibi bir
// route handler'ın try/catch'ine hiç girmeyen hatalar (express.json()
// gibi middleware'lerden atılanlar) buraya düşer. Bunsuz Express
// varsayılan olarak tam dosya yolunu ve stack trace'i içeren bir HTML
// sayfası döndürüyordu — gerçek isteklerle doğrulayıp kapattım.
// ---------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error('✘ Yakalanmamış hata:', err);
  res.status(err.status || 500).json({ error: 'Geçersiz istek' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Makulbul API çalışıyor: http://localhost:${PORT}`);
});
