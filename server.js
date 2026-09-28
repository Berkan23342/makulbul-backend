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

// isSafeHttpUrl/urlMatchesSellerDomain: "javascript:..." gibi tehlikeli
// URI'leri ve satıcının kendi alan adıyla uyuşmayan linkleri reddeden
// ortak doğrulama — hem burada (ör. /satici-git yönlendirmesi) hem
// match-product.js'te (asıl yazma noktası) AYNI fonksiyon kullanılıyor,
// iki ayrı kopyanın zamanla birbirinden sapması riskini ortadan kaldırır.
const { matchProduct, isSafeHttpUrl, urlMatchesSellerDomain } = require('./match-product');
const { rankByPower, computeHardwareScore } = require('./ai-rank');
const { rankLaptopsByPower } = require('./ai-rank-laptop');
const { scoreCpu, scoreGpu, computeLaptopPowerScore } = require('./chip-tiers-laptop');
const {
  parseFieldThreshold, applyNumericThresholds, formatNumericReason,
  PHONE_NUMERIC_FIELDS, LAPTOP_NUMERIC_FIELDS, NUMERIC_FIELD_LABELS,
} = require('./numeric-field-filters');
const { parsePriceFilter } = require('./price-filter');
const { foldTurkish } = require('./text-normalize');
const { parseQueryWithAI } = require('./ai-query-fallback');
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

// Canlıda (NODE_ENV=production) http ve/veya www'lı isteği tek seferde
// https + www'sız standart adrese yönlendirir. Yerelde (http, proxy yok)
// bu adım atlanır.
// NOT: www'lı host (www.makulbul.com) önceden HTTPS'te de doğrudan 200
// ile aynı içeriği sunuyordu — sayfadaki canonical etiketi www'sız adresi
// gösterdiği için Google onu ayrı indexlemiyordu (bkz. Search Console'daki
// "Doğru standart etikete sahip alternatif sayfa" raporu), ama Google'ın
// crawl bütçesini gereksiz yere ikiye bölüyordu. Artık www'lı host'un
// kendisi de tek bir 301 ile www'sız + https adrese yönlendiriliyor.
if (IS_PROD) {
  app.use((req, res, next) => {
    const host = req.get('host') || '';
    const isHttps = req.secure || req.get('x-forwarded-proto') === 'https';
    const isWww = host.startsWith('www.');
    if (isHttps && !isWww) return next();
    const targetHost = isWww ? host.slice(4) : host;
    res.redirect(301, `https://${targetHost}${req.originalUrl}`);
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
    `SELECT o.id, o.product_id, o.price, o.currency, o.affiliate_url, o.in_stock,
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
    offers: offers.filter(o => o.product_id === p.id),
  }));
}

// ---------------------------------------------------------------------
// GET /api/products
// Query params: category=telefon|laptop (varsayılan telefon, eski
// davranışla geriye dönük uyumlu), brand, maxPrice, nfc=true,
// sort=price|battery|camera|weight|charging (laptop: cpu-power|ram)
// ---------------------------------------------------------------------
app.get('/api/products', async (req, res) => {
  try {
    const { brand, maxPrice, nfc, sort } = req.query;
    // category kesinlikle sadece bu iki sabit değerden biri olabilir
    // (kullanıcı girdisi doğrudan SQL'e enterpolasyon riski yok) — bu
    // yüzden $N parametresi yerine düz string olarak gömülüyor, mevcut
    // $1=ALLOWED_SELLERS numaralandırmasını bozmadan.
    const category = req.query.category === 'laptop' ? 'laptop' : 'telefon';
    const conditions = [`c.slug = '${category}'`];
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
             -- KRİTİK: o.in_stock = true ZORUNLU — aksi halde stokta
             -- olmayan (satıcıda tükenmiş) bir teklifin fiyatı "en uygun
             -- fiyat" diye gösterilebilir/tıklanabilir hâle gelirdi.
             -- Şu an yerel veritabanında TÜM teklifler stokta (in_stock=
             -- true) olduğu için bu hata görünmüyor ama canlıda bir
             -- satıcı bir ürünü tükettiği an gerçek bir sorun olurdu.
             (SELECT MIN(o.price) FROM offers o JOIN sellers s2 ON s2.id = o.seller_id
                WHERE o.product_id = p.id AND s2.name = ANY($1::text[]) AND o.in_stock = true) AS best_price,
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
      // Laptop'a özgü sıralamalar — CPU/GPU "güç" sıralaması nüanslı bir
      // puanlama gerektirdiği için (bkz. chip-tiers-laptop.js) burada SQL
      // ile yapılmıyor, sadece /api/ai-search'ün "en güçlü laptop" yolunda
      // hesaplanıyor. Burada sadece ham, tek sütunlu sıralamalar var.
      ram: `COALESCE((specs->>'ram_gb')::int, 0) DESC`,
      storage: `COALESCE((specs->>'storage_gb')::int, 0) DESC`,
      screen: `COALESCE((specs->>'screen_inch')::numeric, 0) DESC`,
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
      `SELECT p.id, p.canonical_name, b.name AS brand, p.specs, c.slug AS category
       FROM products p JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
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
// POST /api/visit — birinci taraf, kimliksiz sayfa görüntüleme sayacı.
// Çerez banner'ı "kullanım istatistiği için çerez kullanır" diyordu
// ama arkasında hiçbir şey yoktu. Bu, dış bir analitik hesabı (GA4 vb.)
// gerektirmeden, IP veya başka bir kimlik saklamadan (sadece hangi
// sayfa, ne zaman) temel kullanım verisi tutar.
// NOT: bu rota eskiden "/api/track" idi — sayfa yüklenir yüklenmez,
// gecikmesiz atılan ve adında "track" geçen bu istek canlıda HER
// SEFERİNDE 503 ile engelleniyordu (muhtemelen reklam/gizlilik
// engelleyiciler ve/veya Hostinger kenar katmanı bunu bot/izleyici
// deseni sayıyordu — client tarafında da window.load + gecikme +
// sendBeacon'a geçildi, bkz. public/index.html ve product-page.js).
// Body: { path }
// ---------------------------------------------------------------------
const visitLimiter = createRateLimiter({
  windowMs: 60 * 1000, max: 60, keyFn: req => req.ip,
});

app.post('/api/visit', visitLimiter, async (req, res) => {
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
// handleLaptopAiSearch — telefon /api/ai-search'ün (aşağıda) laptop
// kategorisi için AYRI, kendi kendine yeten karşılığı. BİLEREK telefon
// kodunun içine karıştırılmıyor/onu değiştirmiyor — telefon tarafı
// aylarca gerçek sorgularla test edilip inceltildi, oraya en ufak bir
// dokunuş bile o davranışı bozma riski taşır. Fiyat ayrıştırma ve model-
// adı eşleştirme gibi kategori-bağımsız mantık BİLEREK burada AYRICA
// (küçük bir kod tekrarıyla) yazıldı, aynı sebepten.
//
// Kriter seçimleri telefon motorundakiyle aynı ruhta ama laptop'a özgü:
// CPU/GPU (chip-tiers-laptop.js), RAM, depolama, ekran boyutu/çözünürlüğü,
// ağırlık, pil (Wh), dokunmatik ekran, aydınlatmalı klavye, parmak izi,
// webcam, işletim sistemi VE — telefonda hiç olmayan, laptopta çok doğal
// bir arama şekli — KULLANIM AMACI (oyun/öğrenci/ofis/tasarım/
// programlama gibi profiller, birden fazla alt-kriteri birden aktive eder).
async function handleLaptopAiSearch(req, res) {
  try {
    // KRİTİK: foldTurkish() hem küçük harfe çeviriyor HEM DE Türkçe özel
    // karakterleri (ı/ş/ğ/ü/ö/ç) ascii karşılığına indirgiyor — böylece
    // "guclu"/"yuksek ramli"/"ogrenci icin" gibi (gerçek kullanıcıların SIK
    // yazdığı, Türkçe karaktersiz) sorgular da aşağıdaki TÜM anahtar
    // kelime kontrolleriyle doğru eşleşiyor. Eskiden sadece toLowerCase()
    // uygulanıyordu — bu, BÜYÜK harfi düzeltiyordu ama "ü"yü "u"ya
    // çevirmiyordu, bu yüzden bu tür yazımlar SESSİZCE hiçbir filtreyi
    // tetiklemeden jenerik "en ucuz" sonucuna düşüyordu.
    const q = foldTurkish(req.body.query || '');

    // DOĞRUDAN ZIT ANLAMLI kelimeler ("ağır", "az ram", "kısa pil", "eski
    // model" gibi) — "X olmayan" YERİNE kullanıcı doğrudan zıt kelimeyi
    // yazdığında da ilgili yumuşak kriter tetiklensin diye. Her anahtar
    // için: pozitif kelime YOKSA (belirsizlik durumunda pozitif kelime
    // önceliklidir) VE zıt kelime VARSA true. Aşağıda hem `filters.X`
    // tetiklemesine hem de (invertedScore() ile) puanın doğru yönde ters
    // çevrilmesine dahil ediliyor — bkz. effInverted()'in tam açıklaması.
    const antonymWord = {
      top: q.includes('zayif') || q.includes('dusuk performans') || q.includes('yavas islemci'),
      highRam: q.includes('az ram') || q.includes('dusuk ram') || q.includes('kucuk ram'),
      highStorage: q.includes('az depolama') || q.includes('dusuk depolama') || q.includes('kucuk depolama'),
      light: q.includes('agir'),
      longBattery: q.includes('kisa pil') || q.includes('dusuk pil') || q.includes('zayif batarya'),
      newest: q.includes('eski'),
    };

    const filters = {
      maxPrice: null,
      minPrice: null,
      brand: null,
      // Kullanım amacı profilleri — her biri kendi alt-kriterlerini
      // (aşağıda "profil uygulama" bloğunda) devreye sokuyor.
      gaming: q.includes('oyun') || q.includes('gaming'),
      student: q.includes('ogrenci') || q.includes('okul icin') || q.includes('ders icin'),
      office: q.includes('ofis') || q.includes('is icin') || q.includes('gunluk kullanim') || q.includes('yazi isleri'),
      creative: q.includes('tasarim') || q.includes('video duzenleme') || q.includes('video montaj') || q.includes('kurgu') || q.includes('render') || q.includes('grafik tasarim'),
      programming: q.includes('yazilim') || q.includes('programlama') || q.includes('kod yazmak') || q.includes('gelistirici'),
      // "en iyi" telefon motorundaki gibi kasıtlı olarak YOK (çok belirsiz).
      // Sadece net güç/performans niyeti bu filtreyi tetikliyor.
      top: q.includes('guclu') || q.includes('performans') || q.includes('hizli islemci') || q.includes('hizli laptop') || antonymWord.top,
      light: q.includes('hafif') || q.includes('tasinabilir') || q.includes('kompakt') || antonymWord.light,
      longBattery: q.includes('uzun pil') || q.includes('pil omru') || q.includes('batarya omru') || q.includes('uzun batarya') || antonymWord.longBattery,
      highRam: q.includes('yuksek ram') || q.includes('bol ram') || q.includes('cok ram') || q.includes('buyuk ram') || antonymWord.highRam,
      highStorage: q.includes('genis depolama') || q.includes('bol depolama') || q.includes('cok depolama') || q.includes('yuksek depolama') || antonymWord.highStorage,
      bigScreen: q.includes('buyuk ekran') || q.includes('genis ekran'),
      smallScreen: q.includes('kucuk ekran') || q.includes('mini ekran'),
      highRefreshRate: /120\s*hz|144\s*hz|165\s*hz|180\s*hz|yuksek yenileme|akici ekran/.test(q),
      touchscreen: q.includes('dokunmatik'),
      backlitKeyboard: q.includes('aydinlatmali klavye') || q.includes('arkadan aydinlatma'),
      fingerprint: q.includes('parmak izi'),
      goodWebcam: q.includes('iyi webcam') || q.includes('kaliteli webcam') || q.includes('yuksek cozunurluklu webcam') || q.includes('goruntulu gorusme'),
      macos: q.includes('mac os') || q.includes('macos') || q.includes('apple laptop') || q.includes('macbook'),
      windows: q.includes('windows'),
      cheap: q.includes('ucuz') || q.includes('ekonomik') || q.includes('butce dostu'),
      expensive: q.includes('pahali') || q.includes('luks') || q.includes('premium') || q.includes('ust segment'),
      newest: q.includes('en yeni') || q.includes('yeni cikan') || q.includes('son model') || q.includes('son cikan') || antonymWord.newest,
    };

    // "X olmayan/olmadan laptop" — telefon motorundaki AYNI Türkçe
    // olumsuzluk deseni (bkz. oradaki uzun açıklama): olumsuz sıfat-fiil
    // eki her zaman "-meyen"/"-mayan" ile biter (desteklemeyen,
    // olmayan, içermeyen...).
    const negated = /meyen|mayan/.test(q) || q.includes('olmadan');
    // Bir yumuşak kriterin GERÇEK (efektif) yönü: "X olmayan" (negated)
    // VE "doğrudan zıt kelime" (antonymWord) ikisi de birer ters çevirme
    // sinyali — birlikte geldiklerinde ("ağır olmayan" = "agir" YAZILMIŞ +
    // "olmayan" da var) birbirlerini İPTAL EDER (XOR), çünkü "ağır
    // OLMAYAN" zaten "hafif" ile AYNI anlama geliyor, ÇİFT ters çevirme
    // YANLIŞ olurdu. antonymWord tanımlanmamış bir anahtar için (ör.
    // cheap/expensive/bigScreen/smallScreen — zaten HER İKİ yönün de
    // kendi kelimesi var) sonuç sadece düz `negated`e eşit kalır, eski
    // davranış AYNEN korunur.
    const effInverted = (key) => Boolean(antonymWord[key]) !== negated;

    // Fiyat ayrıştırma — telefon /api/ai-search ile PAYLAŞILAN, tek yerde
    // (price-filter.js) toplanmış mantık (bkz. o dosyanın başındaki not:
    // "her türlü sorgu" testinde bulunan 3 gerçek hatanın düzeltmesi —
    // yön kelimesinin komşu alana sızması, "en az"/"en fazla" prefix
    // desteğinin eksikliği, birimsiz çıplak sayıların yok sayılması).
    const qForPrice = q;
    const priceResult = parsePriceFilter(qForPrice);
    if (priceResult) {
      filters.minPrice = priceResult.minPrice;
      filters.maxPrice = priceResult.maxPrice;
    }

    // Sayısal eşik ayrıştırma — "8GB'dan yüksek RAM", "512GB üzeri
    // depolama", "1.5 kg altı laptop", "144Hz üzeri ekran" gibi SAYI +
    // YÖN belirten sorgu parçaları (bkz. numeric-field-filters.js).
    // Yön kelimesi olmadan çıplak "16GB" ASLA eşik sayılmaz — aşağıdaki
    // model-adı varyant eşleştirmesi (exactMatches) çıplak "NN gb/tb"
    // sayılarını RAM/depolama VARYANT SEÇİMİ için kullanıyor, bu ikisi
    // çakışmamalı.
    const numericThresholds = {};
    for (const field of LAPTOP_NUMERIC_FIELDS) {
      const t = parseFieldThreshold(q, field);
      if (t) numericThresholds[field.key] = t;
    }
    // refresh_rate_hz: sayı+yön bulunamadıysa ama nitel ifade ("yüksek
    // yenileme hızı"/"akıcı ekran") varsa eski sabit >=120 davranışı
    // (negatifse <120) AYNEN korunur.
    if (!numericThresholds.refresh_rate_hz && filters.highRefreshRate) {
      numericThresholds.refresh_rate_hz = negated ? { min: null, max: 119 } : { min: 120, max: null };
    }

    // Kullanım amacı PROFİLLERİ — her biri, o profille en çok ilgili
    // birkaç temel kriteri (kendi ağırlığıyla) devreye sokuyor. Kullanıcı
    // AYRICA o kriterlerden birini kendisi de yazmışsa (ör. "öğrenci için
    // ucuz laptop") çakışma olmuyor, aynı flag zaten true kalıyor.
    if (filters.student) { filters.cheap = true; filters.light = true; }
    if (filters.office) { filters.cheap = true; filters.light = true; filters.longBattery = true; }
    if (filters.creative) { filters.highRam = true; filters.gaming = true; filters.bigScreen = true; }
    if (filters.programming) { filters.highRam = true; filters.top = true; }

    // Marka tespiti — telefon motorundaki gibi sorguda EN ÖNCE geçen
    // marka kazanıyor. Lenovo'nun kendi ürün hattı adları (ThinkPad,
    // Legion, LOQ, Yoga, IdeaPad) da laptop dünyasında insanların marka
    // yerine söylediği çok yaygın isimler, o yüzden onlar da dahil.
    const BRAND_KEYWORDS = [
      { brand: 'Apple', keywords: ['apple', 'macbook'] },
      { brand: 'ASUS', keywords: ['asus'] },
      { brand: 'Acer', keywords: ['acer'] },
      { brand: 'Casper', keywords: ['casper'] },
      { brand: 'Dell', keywords: ['dell'] },
      { brand: 'Game Raider', keywords: ['game raider'] },
      { brand: 'HP', keywords: ['hp '] },
      { brand: 'Huawei', keywords: ['huawei'] },
      { brand: 'Lenovo', keywords: ['lenovo', 'thinkpad', 'thinkbook', 'ideapad', 'legion', 'loq', 'yoga slim'] },
      { brand: 'MONSTER', keywords: ['monster'] },
      { brand: 'MSI', keywords: ['msi'] },
      { brand: 'Microsoft', keywords: ['microsoft', 'surface'] },
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
    // macOS/Windows isteği de dolaylı bir marka sinyali: "mac laptop"
    // dendiğinde brand tespit edilmemiş olabilir ("mac" BRAND_KEYWORDS'te
    // yok, kelime çok belirsiz/çakışmalı olduğu için) ama macos=true —
    // bu durumda brand'i AÇIKÇA Apple'a sabitliyoruz (Apple dışında macOS
    // çalıştıran hiçbir laptop kataloğumuzda yok).
    if (filters.macos && !filters.brand) filters.brand = 'Apple';

    // AI SORGU YEDEK YOLU (bkz. ai-query-fallback.js'in başındaki tam
    // açıklama) — SADECE yukarıdaki kural tabanlı ayrıştırma HİÇBİR
    // kriter bulamadıysa (numericThresholds boş, fiyat/marka/yumuşak
    // tercih yok) devreye giriyor. Regex bir şey bulduysa (kısmi de olsa)
    // buraya HİÇ girilmiyor — maliyet/gecikme sadece "gerçekten
    // anlaşılamayan" azınlık sorgularda oluşuyor. ANTHROPIC_API_KEY
    // tanımlı değilse parseQueryWithAI sessizce null döner, davranış
    // AYNEN eskisi gibi kalır (bkz. ai-rank.js'teki AYNI desen).
    const hasRealCriteria = Object.keys(numericThresholds).length > 0 ||
      Object.entries(filters).some(([k, v]) => (['maxPrice', 'minPrice', 'brand'].includes(k) ? v != null : v === true));
    let usedAIQueryFallback = false;
    if (!hasRealCriteria) {
      const softFilterKeys = Object.keys(filters).filter(k => !['maxPrice', 'minPrice', 'brand'].includes(k));
      const aiResult = await parseQueryWithAI(q, {
        category: 'laptop',
        numericFields: LAPTOP_NUMERIC_FIELDS,
        labels: NUMERIC_FIELD_LABELS,
        softFilterKeys,
        brandNames: BRAND_KEYWORDS.map(b => b.brand),
      });
      if (aiResult) {
        usedAIQueryFallback = true;
        Object.assign(numericThresholds, aiResult.numericThresholds);
        if (aiResult.maxPrice != null) filters.maxPrice = aiResult.maxPrice;
        if (aiResult.minPrice != null) filters.minPrice = aiResult.minPrice;
        if (aiResult.brand) filters.brand = aiResult.brand;
        for (const key of aiResult.softFilters) filters[key] = true;
      }
    }

    const conditions = [`c.slug = 'laptop'`];
    const params = [];
    if (filters.brand) { params.push(filters.brand); conditions.push(`b.name = $${params.length}`); }
    if (filters.touchscreen) conditions.push(`(p.specs->>'has_touchscreen')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.backlitKeyboard) conditions.push(`(p.specs->>'has_backlit_keyboard')::boolean = ${negated ? 'false' : 'true'}`);
    if (filters.fingerprint) conditions.push(`(p.specs->>'has_fingerprint')::boolean = ${negated ? 'false' : 'true'}`);
    // refresh_rate_hz artık SQL'de değil, aşağıda numericThresholds ile
    // JS post-filter olarak uygulanıyor (bkz. yukarıdaki not) — böylece
    // sıfır sonuç durumunda fiyat filtresiyle AYNI dürüst geri düşüş
    // (geniş havuza dönme) davranışı bu alan için de mümkün oluyor.
    if (filters.windows && !filters.macos) {
      conditions.push(negated ? `(p.specs->>'os') ILIKE 'windows%'` : `(p.specs->>'os') ILIKE 'windows%'`);
      // "windows olmayan" nadir ama mantıklı bir istek — FreeDOS/macOS'a düşür.
      if (negated) { conditions.pop(); conditions.push(`(p.specs->>'os') NOT ILIKE 'windows%'`); }
    }
    if (filters.macos) {
      conditions.push(negated ? `(p.specs->>'os') != 'macOS'` : `(p.specs->>'os') = 'macOS'`);
    }

    params.push(ALLOWED_SELLERS);
    const sellersParamIdx = params.length;
    const { rows: candidates } = await pool.query(
      `SELECT p.id, p.canonical_name, p.model, b.name AS brand, p.specs,
              -- KRİTİK: o.in_stock = true ZORUNLU (üçünde de) — aksi
              -- halde stokta olmayan bir teklif "en uygun fiyat" diye
              -- gösterilip tıklanabilir hâle gelirdi (bkz. /api/products'daki
              -- AYNI notun tam açıklaması).
              (SELECT MIN(o.price) FROM offers o JOIN sellers s2 ON s2.id = o.seller_id
                 WHERE o.product_id = p.id AND s2.name = ANY($${sellersParamIdx}::text[]) AND o.in_stock = true) AS best_price,
              (SELECT s.name FROM offers o JOIN sellers s ON s.id = o.seller_id
                 WHERE o.product_id = p.id AND s.name = ANY($${sellersParamIdx}::text[]) AND o.in_stock = true
                 ORDER BY o.price ASC LIMIT 1) AS best_seller,
              (SELECT o.id FROM offers o JOIN sellers s3 ON s3.id = o.seller_id
                 WHERE o.product_id = p.id AND s3.name = ANY($${sellersParamIdx}::text[]) AND o.in_stock = true
                 ORDER BY o.price ASC LIMIT 1) AS best_offer_id
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    // Model adıyla ARAMA (ör. "ThinkPad E14 Gen 7", "MacBook Air 13 M4") —
    // telefon motorundaki AYNI token-eşleştirme fikri, ama eşleştirme
    // p.canonical_name (marka+model+ÇİP+RAM/depolama hepsi bir arada,
    // ör. "Lenovo ThinkPad E14 Gen 7 Ultra7 256V 16GB/1TB") yerine
    // p.model (sade "ThinkPad E14 Gen 7") üzerinden yapılıyor — laptop
    // canonical_name'leri telefonlardakinden çok daha uzun/detaylı
    // olduğu için TÜM kelimelerin sorguda geçmesini istemek ("Ultra7",
    // "256V" gibi teknik ekler dahil) gerçekçi hiçbir kullanıcı
    // sorgusuyla eşleşmezdi. p.model marka adını içermiyor bile
    // ("Lenovo" yok) — bu yüzden marka kelimesi burada da ayrıca
    // çıkarılmıyor, zaten model alanında hiç yer almıyor.
    function modelTokens(name) {
      return (name || '')
        .toLowerCase()
        .replace(/\+/g, ' plus ')
        .replace(/\d+\s?(gb|tb)\b/g, ' ')
        .replace(/[^\wçğıöşü0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 1 || /\d/.test(t));
    }
    function tokenPresentInQuery(query, token) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(query);
    }
    const qForModelMatch = q.replace(/\+/g, ' plus ');
    // p.model markaya/çipe/RAM'e göre AYRI ürün satırları arasında
    // PAYLAŞILIYOR (bkz. yukarıdaki not — laptop varyantları ayrı
    // products satırları, tek ürünün offer varyantları değil). Yani
    // "ThinkPad E14 Gen 7" gibi bir sorgu birden fazla RAM/depolama/OS
    // kombinasyonuna AYNI anda tam eşleşebilir. Hepsini topluyoruz;
    // sorgu belirli bir RAM/depolama sayısı içeriyorsa (ör. "32GB") o
    // rakamı specs'inde taşıyan varyant kazanır, yoksa en ucuz (satışta
    // olan) varyant öne çıkarılıyor.
    let exactMatches = [];
    let exactMatchScore = 0;
    for (const c of candidates) {
      const tokens = modelTokens(c.model);
      const hasNumber = tokens.some(t => /\d/.test(t));
      const meetsMinimum = tokens.length >= 2;
      const allPresent = meetsMinimum && hasNumber && tokens.every(t => tokenPresentInQuery(qForModelMatch, t));
      if (!allPresent) continue;
      if (tokens.length > exactMatchScore) {
        exactMatchScore = tokens.length;
        exactMatches = [c];
      } else if (tokens.length === exactMatchScore) {
        exactMatches.push(c);
      }
    }
    let exactMatch = null;
    if (exactMatches.length === 1) {
      exactMatch = exactMatches[0];
    } else if (exactMatches.length > 1) {
      // Sorgudaki "NN GB"/"NN TB" sayılarının RAM mi depolama mı olduğu
      // kelimeyle belirtilmemiş olabilir ("Dell Vostro 3530 32GB" gibi —
      // "ram" kelimesi hiç geçmiyor). Regex'e sabit bir kelime aramak
      // yerine, geçen HER "NN gb/tb" sayısını hem RAM hem depolama
      // boyutunda deniyoruz — hangi varyantların specs'i o sayıyla
      // GERÇEKTEN eşleşiyorsa onlar kazanıyor (bir laptopun RAM'i asla
      // 128GB'ın üzerine çıkmadığı, depolaması da asla 64GB'ın altına
      // inmediği için pratikte iki alan da yanlışlıkla aynı sayıyla
      // çakışmıyor).
      const gbNumbers = [...q.matchAll(/(\d+)\s?(gb|tb)\b/g)]
        .map(m => Number(m[1]) * (m[2] === 'tb' ? 1024 : 1));
      let narrowed = exactMatches;
      if (gbNumbers.length) {
        const byRamOrStorage = exactMatches.filter(c =>
          gbNumbers.includes(c.specs.ram_gb) || gbNumbers.includes(c.specs.storage_gb)
        );
        if (byRamOrStorage.length) narrowed = byRamOrStorage;
      }
      const withPrice = narrowed.filter(c => c.best_price !== null);
      exactMatch = (withPrice.length ? withPrice : narrowed)
        .sort((a, b) => (Number(a.best_price) || Infinity) - (Number(b.best_price) || Infinity))[0];
    }

    let pool_ = candidates;
    if (exactMatch) {
      pool_ = [exactMatch];
    } else {
      pool_ = candidates.filter(c => c.best_price !== null);
    }

    // Sayısal eşikler (RAM/depolama/pil/ekran/ağırlık/çekirdek/Hz) —
    // fiyat filtresiyle AYNI "dürüst geri düşüş" mantığı: bir kriter
    // sıfır sonuç verirse SADECE o kriter atlanır, önceki (başarıyla
    // uygulanmış) kriterler korunur (bkz. numeric-field-filters.js).
    const { pool: poolAfterNumeric, unmet: unmetNumeric } = applyNumericThresholds(pool_, numericThresholds);
    pool_ = poolAfterNumeric;

    let budgetUnmet = false;
    if (filters.maxPrice && filters.minPrice) {
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

    const normalize = (value, min, max) => (max <= min ? 50 : ((value - min) / (max - min)) * 100);
    // "gaming" GPU'yu CPU'dan çok daha ağırlıklı sayan KENDİ güç puanını
    // kullanıyor (computeLaptopPowerScore zaten GPU'yu %55 ağırlıklandırıyor,
    // ama saf "oyun" isteği için GPU'yu daha da öne çıkarıyoruz).
    const SOFT_METRICS = {
      top: c => computeLaptopPowerScore(c.specs),
      gaming: c => scoreGpu(c.specs.gpu) * 1.6 + scoreCpu(c.specs.cpu) / 400,
      highRam: c => c.specs.ram_gb || 0,
      highStorage: c => c.specs.storage_gb || 0,
      light: c => -(c.specs.weight_g || 99999),
      longBattery: c => c.specs.battery_wh || 0,
      bigScreen: c => c.specs.screen_inch || 0,
      smallScreen: c => -(c.specs.screen_inch || 999),
      goodWebcam: c => c.specs.webcam_mp || 0,
      cheap: c => -Number(c.best_price || 0),
      expensive: c => Number(c.best_price || 0),
      newest: c => c.specs.release_year || 0,
    };
    const WEIGHT = { cheap: 2, expensive: 2, gaming: 2 };
    const activeSoftKeys = Object.keys(SOFT_METRICS).filter(k => filters[k]);
    // "X olmayan laptop" — YUMUŞAK (soft) sıralama sinyalleri için de
    // negasyon desteği. Önceden "negated" SADECE gerçek boolean sert
    // filtrelerde (nfc/foldable/stylus vb.) işleniyordu — "işlemcisi
    // GÜÇLÜ OLMAYAN laptop" gibi bir sorgu, negasyon hiç dikkate
    // alınmadan tam TERSİNİ (katalogdaki EN GÜÇLÜ laptop'u) öneriyordu.
    // Aşağıdaki her anahtar için normalize edilmiş 0-100 puanı (100-puan)
    // olarak TERS ÇEVİRİYORUZ — "yüksek=iyi" yerine "düşük=iyi" olur.
    // gaming/goodWebcam ÇIKARILDI: "gaming" birden fazla anahtarı (GPU+CPU)
    // birden karıştıran ÖZEL bir puan ve "oyun için güçlü olmayan" gibi bir
    // istek zaten çelişkili/anlamsız (biri oyun için isterken diğeri
    // gücü reddediyor) — ters çevirmek yerine dokunulmadan bırakılıyor.
    const NON_NEGATABLE_SOFT_KEYS = new Set(['gaming']);
    const invertedScore = (key, raw) => (effInverted(key) && !NON_NEGATABLE_SOFT_KEYS.has(key)) ? (100 - raw) : raw;

    if (activeSoftKeys.length === 0) {
      pool_.sort((a, b) => a.best_price - b.best_price);
    } else if (activeSoftKeys.length === 1 && activeSoftKeys[0] === 'top' && !effInverted('top')) {
      // Tek kriter: ham donanım gücü — nüanslı (ve varsa ücretli AI
      // destekli) rankLaptopsByPower() yolu. NOT: negated ise bu dala
      // GİRMİYORUZ (AI'ın kendi sıralamasını "tersine çevirmek" güvenilir
      // değil) — aşağıdaki genel ağırlıklı puan yoluna düşüyor, orada
      // 'top' SOFT_METRICS'in bir parçası olduğu için normal ters çevirme
      // mekanizması (invertedScore) otomatik uygulanıyor.
      const { ranking, reasoning, usedAI } = await rankLaptopsByPower(pool_);
      const orderMap = new Map(ranking.map((id, i) => [id, i]));
      pool_.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      topReasoning = reasoning;
      topUsedAI = usedAI;
    } else {
      const ranges = {};
      for (const key of activeSoftKeys) {
        const values = pool_.map(SOFT_METRICS[key]);
        ranges[key] = { min: Math.min(...values), max: Math.max(...values) };
      }
      const scoreOf = c => {
        let weightedSum = 0, totalWeight = 0;
        for (const key of activeSoftKeys) {
          const w = WEIGHT[key] || 1;
          const norm = invertedScore(key, normalize(SOFT_METRICS[key](c), ranges[key].min, ranges[key].max));
          weightedSum += norm * w;
          totalWeight += w;
        }
        return weightedSum / totalWeight;
      };
      pool_.sort((a, b) => scoreOf(b) - scoreOf(a));
      if (filters.top) {
        topReasoning = effInverted('top')
          ? 'Donanım gücü tersine çevrilerek (en düşük performanslı öncelikli) diğer özelliklerle birlikte değerlendirildi'
          : 'Donanım gücü, istediğin diğer özelliklerle birlikte değerlendirildi';
      }
    }

    const pick = pool_[0] || null;
    if (pick && pick.best_price === null) {
      return res.json({
        pick: { id: pick.id, canonical_name: pick.canonical_name, best_price: null, best_seller: null, best_offer_id: null },
        reasons: ['Aradığın model bulundu', 'Şu an Hepsiburada, Trendyol veya Amazon TR üzerinde satışta değil'],
        candidates: [],
      });
    }
    const reasons = [];
    if (pick) {
      const bestPriceNum = Number(pick.best_price);
      // Kural tabanlı ayrıştırma bu sorguda hiçbir şey bulamadığı için
      // devreye giren AI yedek yolu kullanıldıysa dürüstçe belirt —
      // aşağıdaki diğer tüm reasons satırları normal şekilde (artık AI'ın
      // doldurduğu numericThresholds/filters üzerinden) eklenmeye devam ediyor.
      if (usedAIQueryFallback) reasons.push('Yapay zeka destekli sorgu analizi kullanıldı');
      if (exactMatch) reasons.push('Aradığın model bulundu');
      if (filters.maxPrice && filters.minPrice) {
        const rangeLabel = `${filters.minPrice.toLocaleString('tr-TR')}-${filters.maxPrice.toLocaleString('tr-TR')} TL`;
        reasons.push(budgetUnmet
          ? `Bu aralıkta (${rangeLabel}) uygun laptop bulunamadı, en yakın seçenek gösteriliyor: ${bestPriceNum.toLocaleString('tr-TR')} TL`
          : `Belirtilen aralıkta (${rangeLabel}): ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      } else if (filters.maxPrice) {
        reasons.push(budgetUnmet
          ? `Bu bütçede (${filters.maxPrice.toLocaleString('tr-TR')} TL altı) uygun laptop bulunamadı, en uygun fiyatlı seçenek gösteriliyor: ${bestPriceNum.toLocaleString('tr-TR')} TL`
          : `Bütçenin (${filters.maxPrice.toLocaleString('tr-TR')} TL) altında: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      } else if (filters.minPrice) {
        reasons.push(budgetUnmet
          ? `Bu bütçede (${filters.minPrice.toLocaleString('tr-TR')} TL üzeri) uygun laptop bulunamadı, en yakın seçenek gösteriliyor: ${bestPriceNum.toLocaleString('tr-TR')} TL`
          : `Belirtilen (${filters.minPrice.toLocaleString('tr-TR')} TL) üzerinde: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      }
      // Sayısal eşik kriterleri (RAM/depolama/pil/ekran/ağırlık/çekirdek)
      // — refresh_rate_hz burada AYRI ele alınıyor (aşağıda, negated'e
      // duyarlı daha doğal bir metinle), o yüzden burada atlanıyor.
      for (const [fieldKey, threshold] of Object.entries(numericThresholds)) {
        if (fieldKey === 'refresh_rate_hz') continue;
        const actualValue = pick.specs[fieldKey];
        const wasUnmet = unmetNumeric.some(u => u.fieldKey === fieldKey);
        if (actualValue == null && !wasUnmet) continue;
        reasons.push(formatNumericReason(fieldKey, threshold, actualValue, wasUnmet));
      }
      if (filters.gaming && pick.specs.gpu) reasons.push(`Oyun için güçlü ekran kartı: ${pick.specs.gpu}`);
      if (filters.top && !filters.gaming) {
        const label = topUsedAI ? 'Yapay zeka analizi' : 'Donanım analizi';
        reasons.push(topReasoning
          ? `${label}: ${topReasoning}`
          : (effInverted('top') ? `En düşük donanım seviyesi: ${pick.specs.cpu}, ${pick.specs.gpu}` : `En yüksek donanım seviyesi: ${pick.specs.cpu}, ${pick.specs.gpu}`));
      }
      if (filters.student) reasons.push('Öğrenci kullanımı için uygun fiyatlı ve hafif bir seçenek');
      if (filters.office) reasons.push('Günlük ofis işleri için hafif, uzun pilli bir seçenek');
      if (filters.creative && pick.specs.gpu) reasons.push(`Tasarım/video düzenleme için güçlü donanım: ${pick.specs.ram_gb}GB RAM, ${pick.specs.gpu}`);
      if (filters.programming && pick.specs.ram_gb) reasons.push(`Yazılım geliştirme için yeterli RAM ve işlemci: ${pick.specs.ram_gb}GB RAM, ${pick.specs.cpu}`);
      // NOT: her satır !numericThresholds.<alan> ile korunuyor — sayısal eşik
      // (ör. "8GB'dan yüksek RAM'li") zaten kendi (daha kesin) reasons
      // satırını yukarıdaki numericThresholds döngüsünde eklediyse, bu eski
      // "yumuşak" satır AYNI bilgiyi tekrar etmesin ("Yüksek RAM: 8GB" +
      // "En az 8GB RAM: 8GB" gibi kafa karıştırıcı ikili mesaj olmasın).
      // NOT: "X olmayan" (negated) her satırda TERS metne düşüyor — skor
      // zaten yukarıda invertedScore() ile ters çevrildiği için burada
      // sadece DOĞRU metni göstermek kalıyor (ör. "hafif OLMAYAN laptop"
      // seçilince "en hafif seçeneklerden" demek YANLIŞ/çelişkili olurdu).
      if (filters.highRam && !numericThresholds.ram_gb && pick.specs.ram_gb) reasons.push(effInverted('highRam') ? `Düşük RAM: ${pick.specs.ram_gb}GB` : `Yüksek RAM: ${pick.specs.ram_gb}GB`);
      if (filters.highStorage && !numericThresholds.storage_gb && pick.specs.storage_gb) reasons.push(effInverted('highStorage') ? `Kompakt depolama: ${formatGbReason(pick.specs.storage_gb)}` : `Geniş depolama: ${formatGbReason(pick.specs.storage_gb)}`);
      if (filters.light && !numericThresholds.weight_g && pick.specs.weight_g) reasons.push(effInverted('light')
        ? `Bu segmentteki en ağır seçeneklerden: ${(pick.specs.weight_g / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`
        : `Bu segmentteki en hafif seçeneklerden: ${(pick.specs.weight_g / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`);
      if (filters.longBattery && !numericThresholds.battery_wh && pick.specs.battery_wh) reasons.push(effInverted('longBattery') ? `Daha düşük batarya kapasitesi: ${pick.specs.battery_wh} Wh` : `Yüksek batarya kapasitesi: ${pick.specs.battery_wh} Wh`);
      if (filters.bigScreen && !numericThresholds.screen_inch && pick.specs.screen_inch) reasons.push(negated ? `Kompakt, taşınabilir ekran: ${pick.specs.screen_inch}"` : `Bu segmentteki en büyük ekranlardan: ${pick.specs.screen_inch}"`);
      if (filters.smallScreen && !numericThresholds.screen_inch && pick.specs.screen_inch) reasons.push(negated ? `Bu segmentteki en büyük ekranlardan: ${pick.specs.screen_inch}"` : `Kompakt, taşınabilir ekran: ${pick.specs.screen_inch}"`);
      // KRİTİK DÜZELTME: bu satır önceden SADECE dilbilgisel "olmayan"
      // negasyonuna (negated) bakıyordu — ama artık numericThresholds
      // AÇIK sayı+yön sorgularından da ("120Hz ALTI ekranlı telefon")
      // gelebiliyor, ve bu durumda negated=false olsa bile eşik aslında
      // bir ÜST SINIR (max, "standart/düşük Hz"). Doğru sinyal her zaman
      // eşiğin KENDİSİ (max mı min mi) — negated'e değil ona bakılmalı.
      if (numericThresholds.refresh_rate_hz && numericThresholds.refresh_rate_hz.max != null && pick.specs.refresh_rate_hz != null) reasons.push(`Standart yenileme hızlı ekran: ${pick.specs.refresh_rate_hz}Hz`);
      else if (numericThresholds.refresh_rate_hz && pick.specs.refresh_rate_hz) reasons.push(`Yüksek yenileme hızlı, akıcı ekran: ${pick.specs.refresh_rate_hz}Hz`);
      if (filters.touchscreen && negated) reasons.push('Dokunmatik ekran değil (istediğin gibi)');
      else if (filters.touchscreen && pick.specs.has_touchscreen) reasons.push('Dokunmatik ekran desteği var');
      if (filters.backlitKeyboard && negated) reasons.push('Aydınlatmalı klavyesi yok (istediğin gibi)');
      else if (filters.backlitKeyboard && pick.specs.has_backlit_keyboard) reasons.push('Aydınlatmalı klavyeye sahip');
      if (filters.fingerprint && negated) reasons.push('Parmak izi okuyucusu yok (istediğin gibi)');
      else if (filters.fingerprint && pick.specs.has_fingerprint) reasons.push('Parmak izi okuyucusuyla hızlı kilit açma');
      if (filters.goodWebcam && pick.specs.webcam_mp) reasons.push(negated ? `Düşük çözünürlüklü webcam: ${pick.specs.webcam_mp}MP` : `Yüksek çözünürlüklü webcam: ${pick.specs.webcam_mp}MP`);
      if (filters.macos) reasons.push('macOS çalıştırıyor');
      if (filters.windows && !filters.macos && pick.specs.os) reasons.push(`İşletim sistemi: ${pick.specs.os}`);
      // cheap/expensive: "ucuz OLMAYAN" ~ "pahalı" ve tam tersi — skoru
      // ters çevrildiği için (invertedScore) burada da karşı metni gösteriyoruz.
      if (filters.cheap && !filters.maxPrice && !filters.minPrice && !filters.student && !filters.office) reasons.push(negated ? `Üst segment bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL` : `Uygun fiyatlı bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      if (filters.expensive) reasons.push(negated ? `Uygun fiyatlı bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL` : `Üst segment bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      if (filters.newest && pick.specs.release_year) reasons.push(effInverted('newest') ? `Daha eski, köklü bir modelden: ${pick.specs.release_year}` : `En yeni modellerden: ${pick.specs.release_year}`);
      if (reasons.length === 0) reasons.push(`En uygun fiyatlı seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      reasons.push(`En uygun fiyat ${pick.best_seller} üzerinden`);
    }

    res.json({ pick, reasons, candidates: pool_.slice(0, 12) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Arama yapılamadı' });
  }
}
function formatGbReason(gb) {
  const n = Number(gb);
  return (n >= 1024 && n % 1024 === 0) ? `${n / 1024}TB` : `${n}GB`;
}

// ---------------------------------------------------------------------
// POST /api/ai-search — basit kural tabanlı öneri (body: { query: "..." })
// ---------------------------------------------------------------------
app.post('/api/ai-search', aiSearchLimiter, async (req, res) => {
  // Laptop kategorisi tamamen AYRI bir yolda ele alınıyor (bkz. yukarıdaki
  // handleLaptopAiSearch) — aşağıdaki telefon mantığına HİÇ girmiyor.
  if (req.body.category === 'laptop') return handleLaptopAiSearch(req, res);
  try {
    // KRİTİK: foldTurkish() hem küçük harfe çeviriyor HEM DE Türkçe özel
    // karakterleri (ı/ş/ğ/ü/ö/ç) ascii karşılığına indirgiyor — böylece
    // "guclu"/"yuksek ramli"/"ogrenci icin" gibi (gerçek kullanıcıların SIK
    // yazdığı, Türkçe karaktersiz) sorgular da aşağıdaki TÜM anahtar
    // kelime kontrolleriyle doğru eşleşiyor. Eskiden sadece toLowerCase()
    // uygulanıyordu — bu, BÜYÜK harfi düzeltiyordu ama "ü"yü "u"ya
    // çevirmiyordu, bu yüzden bu tür yazımlar SESSİZCE hiçbir filtreyi
    // tetiklemeden jenerik "en ucuz" sonucuna düşüyordu.
    const q = foldTurkish(req.body.query || '');

    // DOĞRUDAN ZIT ANLAMLI kelimeler — bkz. laptop handler'ındaki (yukarı,
    // handleLaptopAiSearch) AYNI mekanizmanın tam açıklaması.
    const antonymWord = {
      top: q.includes('zayif') || q.includes('dusuk performans') || q.includes('yavas islemci'),
      light: q.includes('agir'),
      battery: q.includes('az pil') || q.includes('dusuk pil') || q.includes('kisa pil') || q.includes('az batarya'),
      fastCharge: q.includes('yavas') && q.includes('sarj'),
      brightScreen: q.includes('mat ekran') || q.includes('dusuk parlaklik') || q.includes('kisik ekran'),
      highRam: q.includes('az ram') || q.includes('dusuk ram') || q.includes('kucuk ram'),
      newest: q.includes('eski'),
    };

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
        && !q.includes('on kamera') && !q.includes('selfie')
        && !q.includes('telefoto') && !q.includes('zoom') && !q.includes('uzak cekim')
        && !q.includes('dugme') && !q.includes('kumanda'),
      battery: q.includes('pil') || q.includes('batarya') || antonymWord.battery,
      // "en iyi" kasıtlı olarak burada YOK — çok belirsiz ("en iyi kamera",
      // "en iyi telefon" gibi her şeyi kapsayabilir) ve eskiden her sorguda
      // ham donanım gücü sıralamasını tetikleyip diğer belirtilen kriterleri
      // (kamera, pil vb.) es geçiyordu. Artık sadece net güç/performans
      // niyeti (güçlü/performans/oyun) bu filtreyi tetikliyor.
      top: q.includes('guclu') || q.includes('performans') || q.includes('oyun') || antonymWord.top,
      light: q.includes('hafif') || q.includes('kompakt') || antonymWord.light,
      durable: q.includes('dayanikli') || q.includes('su gecirmez') || q.includes('saglam'),
      // KELİME SIRASINDAN BAĞIMSIZ: "hızlı şarj" YERİNE "şarjı hızlı"
      // (Türkçe'de son derece doğal, nesne-önce sıralama) de tetiklemeli —
      // sabit "hizli sarj" alt-dizesi SADECE bu tek sıralamayı yakalıyordu.
      // headphoneJack'teki AYNI "iki kelime de var mı" desenini kullanıyoruz.
      fastCharge: (q.includes('hizli') && q.includes('sarj')) || (q.includes('cabuk') && q.includes('sarj')) || antonymWord.fastCharge,
      wirelessCharge: q.includes('kablosuz sarj'),
      zoom: q.includes('zoom') || q.includes('telefoto') || q.includes('uzak cekim'),
      selfie: q.includes('selfie') || q.includes('on kamera'),
      brightScreen: q.includes('parlak ekran') || q.includes('gunes') || q.includes('gun isigi') || antonymWord.brightScreen,
      // "yenileme hızı"/"Hz" verisi 40 üründe de vardı ama hiçbir filtre
      // veya arayüz alanı bunu kullanmıyordu — toplanan ama hiç
      // sorgulanamayan "ölü veri" idi. Artık gerçek bir sert filtre:
      // katalogda hem 60Hz (çoğu temel iPhone) hem 120/144Hz ürün olduğu
      // için bu ayrım anlamlı sonuç üretebiliyor.
      highRefreshRate: /120\s*hz|144\s*hz|yuksek yenileme|akici ekran/.test(q),
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
      irBlaster: (q.includes('kumanda') && !q.includes('kamera kumanda')) || q.includes('kizilotesi') || q.includes('ir blaster'),
      faceUnlock: q.includes('yuz tanima') || q.includes('face id'),
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
      headphoneJack: (q.includes('kulaklik') && q.includes('giris')) || q.includes('3.5mm') || q.includes('3,5mm') || q.includes('aux'),
      expandableStorage: q.includes('hafiza kart') || q.includes('microsd') || q.includes('sd kart'),
      cameraButton: q.includes('kamera dugme') || q.includes('deklansor') || q.includes('kamera kumanda') || q.includes('cekim dugme'),
      // ESKİDEN "ucuz"/"pahalı" hiç tanınmıyordu — sadece BAŞKA hiçbir
      // kriter yokken varsayılan "ucuza göre sırala" davranışıyla ucuz
      // isteği tesadüfen karşılanıyordu. Ama "hızlı şarj olan UCUZ telefon"
      // gibi bir sorguda bu kelime tamamen görmezden gelinip sonuç
      // katalogdaki EN PAHALI hızlı şarj telefonu olabiliyordu — "pahalı"
      // için de aynı şekilde tersi oluyordu. Artık ikisi de gerçek birer
      // yumuşak kriter, diğerleriyle birlikte harmanlanıyor.
      cheap: q.includes('ucuz') || q.includes('ekonomik'),
      expensive: q.includes('pahali') || q.includes('luks') || q.includes('premium') || q.includes('ust segment'),
      // Ekran boyutu, RAM ve çıkış yılı 48 üründe de vardı ama hiçbir
      // sorgu bunları kullanmıyordu — "büyük ekranlı"/"yüksek ram'li"/
      // "en yeni" gibi son derece doğal istekler hiç karşılık bulmadan
      // sessizce en ucuz telefona düşüyordu.
      bigScreen: q.includes('buyuk ekran') || q.includes('genis ekran'),
      smallScreen: q.includes('kucuk ekran') || q.includes('mini ekran'),
      highRam: q.includes('yuksek ram') || q.includes('bol ram') || q.includes('cok ram') || q.includes('buyuk ram') || antonymWord.highRam,
      newest: q.includes('en yeni') || q.includes('yeni cikan') || q.includes('son model') || q.includes('son cikan') || antonymWord.newest,
    };
    // Renk sorgusu: query'de geçen ilk renk kökünü (ek almadan, "mavi"
    // hem "Mavi Titanyum" hem "Buzul Mavisi" içinde alt-dize olarak
    // eşleşir) bul. Eşleşme varsa SERT filtre olarak uygulanıyor —
    // "mavi telefon" dendiğinde mavi seçeneği OLMAYAN bir telefon
    // önerilmemeli.
    const COLOR_KEYWORDS = ['siyah', 'beyaz', 'mavi', 'kırmızı', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'gümüş', 'altın', 'turuncu', 'lacivert', 'turkuaz', 'lavanta', 'bej', 'titanyum'];
    // KRİTİK DÜZELTME: naif `q.includes(c)` "altın" (renk) ile "altında"/
    // "altına"/"altından" (fiyat/eşik yön kelimesi "alt" kökünün hâl ekli
    // biçimleri) arasındaki YAZIM ÇAKIŞMASINI (harfler tesadüfen üst üste
    // biniyor: a-l-t-ı-n-d-a) fark etmiyordu — "25000 TL'NİN ALTINDA
    // telefon" gibi son derece yaygın bir bütçe sorgusu, SESSİZCE "altın
    // (gold) renkli telefon" sert filtresini tetikleyip sonucu sadece
    // birkaç altın renkli iPhone'a daraltıyordu, sorgudaki gerçek bütçe/
    // kriterler bir kenara atılıyordu. tokenPresentInQuery() (aşağıda
    // tanımlı, model-adı eşleştirmesiyle aynı fonksiyon — JS'te function
    // deklarasyonları hoisted olduğu için burada da kullanılabiliyor) ile
    // kelime sınırı kontrolü ekleniyor: "altın" hâlâ "altın telefon"/
    // "altın renkli"/"altın rengi" gibi meşru kullanımlarda eşleşiyor,
    // ama "altında/altına/altından" gibi bitişik son-ek biçimlerinde
    // ARTIK eşleşmiyor (bkz. az yukarıdaki fonksiyonun kendi yorumu).
    // NOT: burada COLOR_KEYWORDS'ün KENDİSİ foldTurkish'ten GEÇİRİLMİYOR —
    // "colorMatch" daha sonra SQL'de gerçek DB renk değerleriyle (ör.
    // "Kırmızı", ı/ş harfli) eşleştirilmek üzere ORİJİNAL Türkçe haliyle
    // kullanılıyor. Sadece KARŞILAŞTIRMA anında (q zaten katlanmış
    // olduğu için) `c`yi de foldTurkish(c) ile katlıyoruz — böylece
    // "kirmizi telefon" (Türkçe karaktersiz) da doğru tespit ediliyor,
    // ama SQL'e giden değer hâlâ doğru "kırmızı" oluyor.
    const colorMatch = COLOR_KEYWORDS.find(c => tokenPresentInQuery(q, foldTurkish(c)));
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
    // Bir yumuşak kriterin GERÇEK (efektif) yönü — bkz. laptop handler'ındaki
    // (yukarı, handleLaptopAiSearch) AYNI mekanizmanın tam açıklaması: "X
    // olmayan" (negated) ile "doğrudan zıt kelime" (antonymWord) birlikte
    // geldiğinde (ör. "ağır olmayan" = "agir" + "olmayan") birbirini İPTAL
    // EDER (XOR), çünkü ikisi zaten AYNI anlama geliyor.
    const effInverted = (key) => Boolean(antonymWord[key]) !== negated;
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
    // Fiyat ayrıştırma — laptop handler'ıyla PAYLAŞILAN, tek yerde
    // (price-filter.js) toplanmış mantık. Bkz. o dosyanın başındaki not:
    // "her türlü sorgu" testinde bulunan 3 gerçek hatanın düzeltmesi —
    // yön kelimesinin komşu alana sızması, "en az"/"en fazla" prefix
    // desteğinin eksikliği, birimsiz çıplak sayıların yok sayılması.
    const priceResult = parsePriceFilter(qForPrice);
    if (priceResult) {
      filters.minPrice = priceResult.minPrice;
      filters.maxPrice = priceResult.maxPrice;
    }

    // Sayısal eşik ayrıştırma — "8GB'dan yüksek RAM", "256GB üzeri
    // depolama", "6000 mAh üzeri pil", "6.7 inçten büyük ekran", "150
    // gramdan hafif" gibi SAYI + YÖN belirten sorgu parçaları (bkz.
    // numeric-field-filters.js — laptop motorundaki AYNI mekanizma).
    const numericThresholds = {};
    for (const field of PHONE_NUMERIC_FIELDS) {
      const t = parseFieldThreshold(q, field);
      if (t) numericThresholds[field.key] = t;
    }
    // refresh_rate_hz: sayı+yön bulunamadıysa ama nitel ifade ("yüksek
    // yenileme hızı"/"akıcı ekran") varsa eski sabit >=120 davranışı
    // (negatifse <120) AYNEN korunur.
    if (!numericThresholds.refresh_rate_hz && filters.highRefreshRate) {
      numericThresholds.refresh_rate_hz = negated ? { min: null, max: 119 } : { min: 120, max: null };
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

    // AI SORGU YEDEK YOLU — bkz. laptop handler'ındaki (handleLaptopAiSearch)
    // AYNI mekanizmanın ve ai-query-fallback.js'in tam açıklaması.
    const hasRealCriteria = Object.keys(numericThresholds).length > 0 || subBrandPrefix != null ||
      Object.entries(filters).some(([k, v]) => (['maxPrice', 'minPrice', 'brand'].includes(k) ? v != null : v === true));
    let usedAIQueryFallback = false;
    if (!hasRealCriteria) {
      const softFilterKeys = Object.keys(filters).filter(k => !['maxPrice', 'minPrice', 'brand'].includes(k));
      const aiResult = await parseQueryWithAI(q, {
        category: 'telefon',
        numericFields: PHONE_NUMERIC_FIELDS,
        labels: NUMERIC_FIELD_LABELS,
        softFilterKeys,
        brandNames: BRAND_KEYWORDS.map(b => b.brand),
      });
      if (aiResult) {
        usedAIQueryFallback = true;
        Object.assign(numericThresholds, aiResult.numericThresholds);
        if (aiResult.maxPrice != null) filters.maxPrice = aiResult.maxPrice;
        if (aiResult.minPrice != null) filters.minPrice = aiResult.minPrice;
        if (aiResult.brand) filters.brand = aiResult.brand;
        for (const key of aiResult.softFilters) filters[key] = true;
      }
    }

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
    // refresh_rate_hz artık SQL'de değil, aşağıda numericThresholds ile
    // JS post-filter olarak uygulanıyor (bkz. yukarıdaki not) — laptop
    // motorundaki AYNI değişiklik, aynı sebep (dürüst geri düşüş).
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
              -- KRİTİK: o.in_stock = true ZORUNLU (üçünde de) — bkz.
              -- /api/products'daki AYNI notun tam açıklaması.
              (SELECT MIN(o.price) FROM offers o JOIN sellers s2 ON s2.id = o.seller_id
                 WHERE o.product_id = p.id AND s2.name = ANY($${sellersParamIdx}::text[]) AND o.in_stock = true) AS best_price,
              (SELECT s.name FROM offers o JOIN sellers s ON s.id = o.seller_id
                 WHERE o.product_id = p.id AND s.name = ANY($${sellersParamIdx}::text[]) AND o.in_stock = true
                 ORDER BY o.price ASC LIMIT 1) AS best_seller,
              -- Önceden burada doğrudan o.affiliate_url seçilip ai-search
              -- yanıtında ham hâliyle gönderiliyordu — artık offer.id
              -- gönderiliyor, frontend /satici-git/:id üzerinden gidiyor
              -- (bkz. GET /satici-git/:offerId). Gerçek link artık AI
              -- arama sonucunda da sayfa kaynağında hiç görünmüyor.
              (SELECT o.id FROM offers o JOIN sellers s3 ON s3.id = o.seller_id
                 WHERE o.product_id = p.id AND s3.name = ANY($${sellersParamIdx}::text[]) AND o.in_stock = true
                 ORDER BY o.price ASC LIMIT 1) AS best_offer_id
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

    // Sayısal eşikler (RAM/depolama/pil/kamera MP/ekran/ağırlık/şarj/
    // parlaklık/Hz) — fiyat filtresiyle AYNI "dürüst geri düşüş" mantığı:
    // bir kriter sıfır sonuç verirse SADECE o kriter atlanır, önceki
    // (başarıyla uygulanmış) kriterler korunur (bkz. numeric-field-filters.js).
    const { pool: poolAfterNumeric, unmet: unmetNumeric } = applyNumericThresholds(pool_, numericThresholds);
    pool_ = poolAfterNumeric;

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
    // "X olmayan telefon" — yumuşak sıralama sinyalleri için de negasyon
    // desteği (bkz. laptop handler'ındaki AYNI mekanizmanın tam açıklaması).
    // camera/zoom/selfie/durable ÇIKARILDI: bunlar birden fazla spec'i
    // birleştiren KARMAŞIK puanlar ve "iyi kameralı olmayan" gibi bir istek
    // için "en kötü kamera"yı bir ÖZELLİK gibi metinle sunmak (ör.
    // "Kapsamlı kamera sistemi: 8MP...") kendiyle çelişen/yanıltıcı bir
    // mesaj üretirdi — bu yüzden bu alanlarda negasyon şimdilik kapsam dışı.
    const NON_NEGATABLE_SOFT_KEYS = new Set(['camera', 'zoom', 'selfie', 'durable']);
    const invertedScore = (key, raw) => (effInverted(key) && !NON_NEGATABLE_SOFT_KEYS.has(key)) ? (100 - raw) : raw;

    if (activeSoftKeys.length === 0 && filters.top && !effInverted('top')) {
      // Tek kriter: ham donanım gücü — nüanslı (ve varsa ücretli AI destekli)
      // rankByPower() yolu aynen korunuyor. NOT: negated ise bu dala
      // GİRMİYORUZ (bkz. laptop handler'ındaki aynı notun açıklaması) —
      // aşağıdaki genel ağırlıklı puan yoluna düşüyor (hwRange üzerinden).
      const { ranking, reasoning, usedAI } = await rankByPower(pool_);
      const orderMap = new Map(ranking.map((id, i) => [id, i]));
      pool_.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
      topReasoning = reasoning;
      topUsedAI = usedAI;
    } else if (activeSoftKeys.length > 0 || filters.top) {
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
          const norm = invertedScore(key, normalize(SOFT_METRICS[key](c), ranges[key].min, ranges[key].max));
          weightedSum += norm * w;
          totalWeight += w;
        }
        if (hwRange) {
          const hwNorm = invertedScore('top', normalize(computeHardwareScore(c), hwRange.min, hwRange.max));
          weightedSum += hwNorm;
          totalWeight += 1;
        }
        return weightedSum / totalWeight;
      };
      pool_.sort((a, b) => scoreOf(b) - scoreOf(a));
      if (filters.top) {
        topReasoning = effInverted('top')
          ? 'Donanım gücü tersine çevrilerek (en düşük performanslı öncelikli) diğer özelliklerle birlikte değerlendirildi'
          : 'Donanım gücü, istediğin diğer özelliklerle birlikte değerlendirildi';
      }
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
        pick: { id: pick.id, canonical_name: pick.canonical_name, best_price: null, best_seller: null, best_offer_id: null },
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
      // Kural tabanlı ayrıştırma bu sorguda hiçbir şey bulamadığı için
      // devreye giren AI yedek yolu kullanıldıysa dürüstçe belirt.
      if (usedAIQueryFallback) reasons.push('Yapay zeka destekli sorgu analizi kullanıldı');
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
      // Sayısal eşik kriterleri (RAM/depolama/pil/kamera MP/ekran/ağırlık/
      // şarj/parlaklık) — refresh_rate_hz burada AYRI ele alınıyor
      // (aşağıda, negated'e duyarlı daha doğal bir metinle), o yüzden
      // burada atlanıyor.
      for (const [fieldKey, threshold] of Object.entries(numericThresholds)) {
        if (fieldKey === 'refresh_rate_hz') continue;
        const actualValue = pick.specs[fieldKey];
        const wasUnmet = unmetNumeric.some(u => u.fieldKey === fieldKey);
        if (actualValue == null && !wasUnmet) continue;
        reasons.push(formatNumericReason(fieldKey, threshold, actualValue, wasUnmet));
      }
      if (filters.nfc && negated) reasons.push('NFC desteklemiyor (istediğin gibi)');
      else if (filters.nfc && pick.specs.has_nfc) reasons.push('NFC destekli');
      if (filters.wirelessCharge && negated) reasons.push('Kablosuz şarj desteklemiyor (istediğin gibi)');
      else if (filters.wirelessCharge && !numericThresholds.wireless_charging_watts && pick.specs.wireless_charging_watts) reasons.push(`En hızlı kablosuz şarj: ${pick.specs.wireless_charging_watts}W`);
      if (filters.camera) {
        const parts = [`${pick.specs.main_camera_mp}MP ana kamera`];
        if (pick.specs.ultra_wide_mp) parts.push(`${pick.specs.ultra_wide_mp}MP geniş açı`);
        if (pick.specs.telephoto_mp) parts.push(`${pick.specs.telephoto_mp}MP telefoto`);
        if (pick.specs.optical_zoom_x) parts.push(`${pick.specs.optical_zoom_x}x optik zoom`);
        reasons.push(`Kapsamlı kamera sistemi: ${parts.join(', ')}`);
      }
      if (filters.zoom && pick.specs.optical_zoom_x) reasons.push(`En yüksek optik zoom: ${pick.specs.optical_zoom_x}x`);
      if (filters.selfie && pick.specs.front_camera_mp) reasons.push(`En yüksek çözünürlüklü ön kamera: ${pick.specs.front_camera_mp}MP`);
      // NOT: her satır !numericThresholds.<alan> ile korunuyor — bkz. laptop
      // handler'ındaki aynı notun tam açıklaması (sayısal eşik zaten kendi
      // reasons satırını eklediyse bu eski "yumuşak" satır tekrar etmesin).
      // NOT: negated satırlar için bkz. laptop handler'ındaki aynı notun
      // tam açıklaması (skor invertedScore() ile ters çevrildi, metin de
      // buna uygun gösteriliyor — durable HARİÇ, o negasyonda değişmeden
      // kalıyor, bkz. NON_NEGATABLE_SOFT_KEYS).
      if (filters.battery && !numericThresholds.battery_mah) reasons.push(effInverted('battery') ? `Daha düşük batarya kapasitesi: ${pick.specs.battery_mah}mAh` : `Yüksek batarya kapasitesi: ${pick.specs.battery_mah}mAh`);
      if (filters.fastCharge && !numericThresholds.wired_charging_watts && pick.specs.wired_charging_watts) reasons.push(effInverted('fastCharge') ? `Daha yavaş kablolu şarj: ${pick.specs.wired_charging_watts}W` : `En hızlı kablolu şarj: ${pick.specs.wired_charging_watts}W`);
      if (filters.light && !numericThresholds.weight_g && pick.specs.weight_g) reasons.push(effInverted('light') ? `Bu segmentteki en ağır seçeneklerden: ${pick.specs.weight_g}g` : `Bu segmentteki en hafif seçeneklerden: ${pick.specs.weight_g}g`);
      if (filters.durable && pick.specs.ip_rating) reasons.push(`Yüksek dayanıklılık sınıfı: ${pick.specs.ip_rating}`);
      if (filters.brightScreen && !numericThresholds.screen_nits && pick.specs.screen_nits) reasons.push(effInverted('brightScreen') ? `Daha düşük parlaklıkta bir ekran: ${pick.specs.screen_nits} nit` : `Güneş altında bile okunaklı, parlak ekran: ${pick.specs.screen_nits} nit`);
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
      // KRİTİK DÜZELTME: bu satır önceden SADECE dilbilgisel "olmayan"
      // negasyonuna (negated) bakıyordu — ama artık numericThresholds
      // AÇIK sayı+yön sorgularından da ("120Hz ALTI ekranlı telefon")
      // gelebiliyor, ve bu durumda negated=false olsa bile eşik aslında
      // bir ÜST SINIR (max, "standart/düşük Hz"). Doğru sinyal her zaman
      // eşiğin KENDİSİ (max mı min mi) — negated'e değil ona bakılmalı.
      if (numericThresholds.refresh_rate_hz && numericThresholds.refresh_rate_hz.max != null && pick.specs.refresh_rate_hz != null) reasons.push(`Standart yenileme hızlı ekran: ${pick.specs.refresh_rate_hz}Hz`);
      else if (numericThresholds.refresh_rate_hz && pick.specs.refresh_rate_hz) reasons.push(`Yüksek yenileme hızlı, akıcı ekran: ${pick.specs.refresh_rate_hz}Hz`);
      if (filters.headphoneJack && negated) reasons.push('Kulaklık girişi yok (istediğin gibi)');
      else if (filters.headphoneJack && pick.specs.has_headphone_jack) reasons.push('3.5mm kulaklık girişi var — kablosuz kulaklığa gerek kalmadan bağlanabiliyorsun');
      if (filters.expandableStorage && negated) reasons.push('Hafıza kartı desteklemiyor (istediğin gibi)');
      else if (filters.expandableStorage && pick.specs.has_expandable_storage) reasons.push('microSD kart ile depolama alanı genişletilebiliyor');
      if (filters.cameraButton && negated) reasons.push('Fiziksel kamera düğmesi yok (istediğin gibi)');
      else if (filters.cameraButton && pick.specs.has_camera_button) reasons.push('Fiziksel kamera düğmesiyle hızlı çekim yapabiliyorsun');
      if (filters.cheap && !filters.maxPrice && !filters.minPrice) reasons.push(negated ? `Üst segment bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL` : `Uygun fiyatlı bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      if (filters.expensive) reasons.push(negated ? `Uygun fiyatlı bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL` : `Üst segment bir seçenek: ${bestPriceNum.toLocaleString('tr-TR')} TL`);
      if (filters.bigScreen && !numericThresholds.screen_inch && pick.specs.screen_inch) reasons.push(negated ? `Kompakt, küçük ekran: ${pick.specs.screen_inch}"` : `Bu segmentteki en büyük ekranlardan: ${pick.specs.screen_inch}"`);
      if (filters.smallScreen && !numericThresholds.screen_inch && pick.specs.screen_inch) reasons.push(negated ? `Bu segmentteki en büyük ekranlardan: ${pick.specs.screen_inch}"` : `Kompakt, küçük ekran: ${pick.specs.screen_inch}"`);
      if (filters.highRam && !numericThresholds.ram_gb && pick.specs.ram_gb) reasons.push(effInverted('highRam') ? `Düşük RAM: ${pick.specs.ram_gb}GB` : `Yüksek RAM: ${pick.specs.ram_gb}GB`);
      if (filters.newest && pick.specs.release_year) reasons.push(effInverted('newest') ? `Daha eski, köklü bir modelden: ${pick.specs.release_year}` : `En yeni modellerden: ${pick.specs.release_year}`);
      if (colorMatch && Array.isArray(pick.specs.colors)) {
        const exactColor = pick.specs.colors.find(c => c.toLowerCase().includes(colorMatch));
        if (exactColor) reasons.push(`Bu renk seçeneğiyle satılıyor: ${exactColor}`);
      }
      if (filters.top) {
        const label = topUsedAI ? 'Yapay zeka analizi' : 'Donanım analizi';
        reasons.push(topReasoning
          ? `${label}: ${topReasoning}`
          : (effInverted('top') ? `En düşük donanım seviyesi: ${pick.specs.ram_gb}GB RAM, ${pick.specs.chip}` : `En yüksek donanım seviyesi: ${pick.specs.ram_gb}GB RAM, ${pick.specs.chip}`));
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

// ---------------------------------------------------------------------
// POST /api/ingest-offer — Scraper'ların ham ürün verisini gönderdiği uç
// nokta. Otomatik eşleştirme motorunu (match-product.js) çalıştırır.
// Body: { sellerName, rawTitle, price, currency?, productUrl, affiliateUrl?, gtin?, mpn? }
// ---------------------------------------------------------------------
// Bu uç nokta veri YAZIYOR — gösterilen fiyatları/"Satıcıya Git"
// linklerini doğrudan etkiliyor. Önceden ingestLimiter dışında hiçbir
// erişim kontrolü yoktu: rate limit'e takılmadığı sürece kimliği
// belirsiz herhangi biri, var olan bir satıcı adını (ör. "Hepsiburada")
// seçip sahte bir fiyat/link "besleyebiliyordu" — bu hem kullanıcıyı
// hem de o satıcı markasını riske atardı (bkz. match-product.js'teki
// website_domain kontrolü, bunun tamamlayıcısı). .env'de INGEST_API_KEY
// tanımlıysa X-Ingest-Key başlığı eşleşmeyen istekler reddedilir;
// tanımlı değilse (yerel geliştirme) eskisi gibi açık kalır.
app.post('/api/ingest-offer', ingestLimiter, async (req, res) => {
  if (process.env.INGEST_API_KEY && req.get('X-Ingest-Key') !== process.env.INGEST_API_KEY) {
    return res.status(401).json({ error: 'Yetkisiz' });
  }
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
    // match-product.js girdi doğrulama hatalarını (geçersiz URL, satıcı
    // alan adıyla uyuşmayan link) err.statusCode=400 ile işaretliyor —
    // bunları istemciye "sunucu hatası" (500) değil, gerçek nedenleriyle
    // (400) döndürüyoruz; başka her şey hâlâ genel bir mesajla 500 kalır.
    if (err.statusCode === 400) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Eşleştirme yapılamadı' });
  }
});

// ---------------------------------------------------------------------
// GET /satici-git/:offerId — affiliate link "cloaking" (gizleme) katmanı.
// ÖNCEDEN "Satıcıya Git" linkleri doğrudan offers.affiliate_url'i sayfa
// kaynağında (HTML'de) taşıyordu. Bunun bilinen bir riski var: bazı
// zararlı tarayıcı eklentileri (ya da rakip bir affiliate ağı) sayfadaki
// linkleri tarayıp kendi takip kimliğiyle DEĞİŞTİREREK tıklamayı bize,
// ama komisyonu kendine yönlendirebiliyor ("affiliate link hijacking").
// Artık HİÇBİR sayfada gerçek affiliate_url görünmüyor — her "Satıcıya
// Git" linki buraya işaret ediyor, asıl adrese sadece TIKLANDIĞI anda,
// sunucu tarafında 302 ile yönlendiriliyor. Bu ayrıca match-product.js
//'teki satıcı alan adı doğrulamasını TIKLAMA ANINDA bir kez daha
// uyguluyor — savunma derinliği: veriye nasıl/ne zaman yazıldığından
// bağımsız, kullanıcıyı GERÇEKTEN göndereceğimiz her link son kez kontrol
// edilmiş oluyor.
// ---------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.get('/satici-git/:offerId', async (req, res) => {
  // Postgres, uuid tipi bir sütunla geçersiz formatlı bir değer
  // karşılaştırılınca hata fırlatır — bu, aşağıdaki catch'e düşüp
  // yanlışlıkla "sunucu hatası" (500) gibi görünürdü; format hatası
  // aslında bir istemci hatası (400) olduğu için burada erken kontrol
  // ediyoruz.
  if (!UUID_RE.test(req.params.offerId)) {
    return res.status(400).send('Geçersiz teklif kimliği.');
  }
  try {
    const { rows } = await pool.query(
      `SELECT o.affiliate_url, s.website_domain
       FROM offers o JOIN sellers s ON s.id = o.seller_id
       WHERE o.id = $1`,
      [req.params.offerId]
    );
    if (rows.length === 0) {
      return res.status(404).send('Teklif bulunamadı.');
    }
    const { affiliate_url: affiliateUrl, website_domain: websiteDomain } = rows[0];
    if (!isSafeHttpUrl(affiliateUrl) || !urlMatchesSellerDomain(affiliateUrl, websiteDomain)) {
      // Buraya düşülmesi normalde imkansız (yazma anında zaten aynı
      // kontrol var) — ama veritabanına başka bir yoldan (elle çalışan
      // bir script, gelecekte eklenecek bir admin paneli) hatalı bir
      // değer girerse kullanıcıyı sessizce yanlış/güvensiz bir adrese
      // göndermek yerine burada durduruyoruz.
      console.error(`⚠ /satici-git: satıcı alan adıyla uyuşmayan link engellendi (offerId=${req.params.offerId})`);
      return res.status(400).send('Geçersiz link.');
    }
    res.redirect(302, affiliateUrl);
  } catch (err) {
    console.error(err);
    res.status(500).send('Yönlendirilemedi.');
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
      `SELECT p.id, p.canonical_name, b.name AS brand, p.specs, c.slug AS category,
              (SELECT MIN(ph.price) FROM price_history ph
                 JOIN offers o ON o.id = ph.offer_id
                 WHERE o.product_id = p.id AND ph.recorded_at >= NOW() - INTERVAL '30 days') AS min_price_30d
       FROM products p JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
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
    // NOT: laptop kategorisi burada de bilerek dahil — şu an production
    // veritabanında hiç laptop satırı yok (kod+tasarım tamamlanıp veri
    // taşınana kadar sadece local'de var), o yüzden bu sorgu canlıda
    // zararsızca 0 ek satır döner; laptop verisi taşındığında sitemap
    // otomatik olarak onları da içerecek.
    const { rows } = await pool.query(
      `SELECT p.id, p.canonical_name FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE c.slug IN ('telefon', 'laptop')`
    );
    // Anasayfa (statik frontend'de barınıyor) ÖNCELİKLE listelenmeli —
    // önceden sadece ürün sayfaları vardı, arama motorları asıl giriş
    // noktasını (ana sayfa) bu dosyadan hiç göremiyordu.
    // NOT: canonical etiketiyle (FRONTEND_URL + "/") birebir eşleşmeli —
    // "/index.html" farklı bir URL sayılıp yinelenen içerik/standart URL
    // karışıklığına yol açabiliyordu.
    const homeUrl = `  <url><loc>${FRONTEND_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;
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

// ---------------------------------------------------------------------
// Statik frontend (public/) — kart ızgarası, AI arama, gizlilik/
// kullanım şartları sayfaları. Önceden bu dosyalar AYRI bir statik
// sunucuda (cepfiyat-frontend, farklı bir port/domain) barınıyordu;
// tek bir Hostinger Node uygulaması olarak deploy edildiği için backend
// artık bunları da AYNI origin'den sunuyor (public/index.html'deki
// API_BASE='' bu yüzden — göreceli /api/... çağrıları otomatik olarak
// buraya gelir). Yukarıdaki /api/*, /urun/*, /sitemap.xml, /robots.txt,
// /og-image.png rotalarıyla ÇAKIŞMAZ — bunlardan sonra kayıtlı olduğu
// için sadece EŞLEŞMEYEN yollarda devreye girer.
app.use(express.static(path.join(__dirname, 'public')));

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
