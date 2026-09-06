// product-page.js — /urun/:id sayfası için sunucu tarafında (SSR) render
// edilen tam HTML sayfası.
//
// Neden gerekli: index.html tamamen istemci tarafında (fetch + JS) render
// ediyor — yani sayfanın ilk HTML'inde ürün adı/fiyatı/açıklaması hiç
// bulunmuyor, sadece boş bir <div id="grid"> var. Google dışındaki çoğu
// bot (Bing, WhatsApp/Twitter link önizlemesi, vb.) JS çalıştırmadığı
// için bu sayfaları hiç göremez. Bu modül, her ürün için gerçek meta
// etiketleri ve tüm görünür içeriği (özellikler, satıcılar, fiyat) JS
// olmadan da okunabilir düz HTML olarak üretir.
//
// Şablon motoru KULLANMIYORUZ — projede zaten hiç yok, ek bağımlılık
// eklememek için düz template literal ile yazıldı (chip-tiers.js,
// installments.js ile aynı "sade, bağımlılıksız" felsefe).

function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
    .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// canonical_name içindeki depolama kapasitesini ("256GB", "1 TB" vb.)
// başlıktan çıkarır — artık kapasite sayfada SEÇİLEBİLİR bir seçenek
// (bkz. variant-picker), o yüzden ana başlıkta sadece marka+model
// kalmalı. Sadece kapasite token'ını kaldırıyoruz; "iPhone 13 mini"
// gibi model adının parçası olan sayılara ya da "NFC"/"5G" gibi diğer
// SKU etiketlerine dokunmuyoruz (onlar seçilebilir birer seçenek değil,
// modelin sabit bir parçası). <title>/meta/JSON-LD gibi SEO amaçlı
// alanlarda hâlâ TAM canonical_name kullanılıyor — sadece görünür ana
// başlık (h1/kart h3) bundan etkileniyor.
// 1024 GB'ın katı olan kapasiteleri "1TB"/"2TB" gibi okunaklı gösterir
// (ör. araştırmadan gelen bazı gerçek teklifler storage_gb=1024) —
// diğer tüm değerler ("256", "512" vb.) olduğu gibi "NNNGB" kalır.
function formatGb(gb) {
  const n = Number(gb);
  return (n >= 1024 && n % 1024 === 0) ? `${n / 1024}TB` : `${n}GB`;
}

function displayModelName(canonicalName) {
  return String(canonicalName || '')
    .replace(/\s*\b\d+\s?(GB|TB)\b/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// server.js artık ingest sırasında http(s) dışı URL'leri reddediyor,
// ama bu render katmanında ikinci bir savunma satırı — esc() sadece
// HTML özel karakterlerini kaçırır, "javascript:..." gibi bir şemayı
// engellemez, o yüzden href'e basmadan önce ayrıca şema kontrolü yapılır.
function safeHref(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? esc(url) : '#';
  } catch {
    return '#';
  }
}

function fmtTL(n) {
  return Number(n).toLocaleString('tr-TR') + ' TL';
}

// Renk isimlerinden (ör. "Kozmik Turuncu", "Buzul Mavisi") yaklaşık bir
// gösterim rengi çıkarır — marka rengiyle birebir aynı olması şart değil,
// sadece görsel bir ipucu (hangi rengin "sıcak/soğuk/açık/koyu" olduğunu
// hissettirmek için).
function colorSwatchHex(name) {
  const n = name.toLowerCase();
  if (n.includes('siyah') || n.includes('obsidyen') || n.includes('gece') || n.includes('arduvaz')) return '#1c1c1e';
  if (n.includes('beyaz') || n.includes('porselen') || n.includes('bulut')) return '#f2f1ed';
  if (n.includes('mavi') || n.includes('lacivert') || n.includes('indigo') || n.includes('gökyüzü') || n.includes('gelgit')) return '#3d6ea5';
  if (n.includes('kırmızı') || n.includes('mercan') || n.includes('red')) return '#c0392b';
  if (n.includes('yeşil') || n.includes('yosun') || n.includes('yeşim') || n.includes('adaçayı') || n.includes('zeytin') || n.includes('limon otu')) return '#5c7d5a';
  if (n.includes('sarı')) return '#d8c22c';
  if (n.includes('mor') || n.includes('lavanta') || n.includes('orkide') || n.includes('kobalt')) return '#7b5ea7';
  if (n.includes('pembe') || n.includes('rose')) return '#dfa3b5';
  if (n.includes('turkuaz')) return '#2a9d8f';
  if (n.includes('turuncu')) return '#d9782d';
  if (n.includes('altın') || n.includes('gold')) return '#c9a86a';
  if (n.includes('gümüş') || n.includes('silver')) return '#c7c7c9';
  if (n.includes('gri') || n.includes('grafit') || n.includes('antrasit') || n.includes('titanyum')) return '#8a8a8e';
  if (n.includes('bej')) return '#d8c6a8';
  return '#9a9a9a';
}

const SPEC_LABELS = [
  ['ram_gb', 'RAM', v => `${v} GB`],
  ['storage_gb', 'Depolama', v => (v >= 1024 && v % 1024 === 0) ? `${v / 1024} TB` : `${v} GB`],
  ['screen_inch', 'Ekran', v => `${v}"`],
  ['refresh_rate_hz', 'Ekran Yenileme Hızı', v => `${v}Hz`],
  ['battery_mah', 'Batarya', v => `${v} mAh`],
  ['chip', 'Çip', v => v],
  ['main_camera_mp', 'Ana Kamera', v => `${v} MP`],
  ['ultra_wide_mp', 'Geniş Açı Kamera', v => `${v} MP`],
  ['telephoto_mp', 'Telefoto Kamera', v => `${v} MP`],
  ['optical_zoom_x', 'Optik Zoom', v => `${v}x`],
  ['front_camera_mp', 'Ön Kamera', v => `${v} MP`],
  ['weight_g', 'Ağırlık', v => `${v} g`],
  ['ip_rating', 'Su/Toz Direnci', v => v],
  ['wired_charging_watts', 'Kablolu Şarj', v => `${v}W`],
  ['wireless_charging_watts', 'Kablosuz Şarj', v => `${v}W`],
  ['has_nfc', 'NFC', v => (v ? 'Var' : 'Yok')],
  ['has_5g', '5G', v => (v ? 'Var' : 'Yok')],
  ['screen_nits', 'Ekran Parlaklığı', v => `${v} nit`],
  ['build_material', 'Gövde Malzemesi', v => v],
  ['has_stereo_speakers', 'Stereo Hoparlör', v => (v ? 'Var' : 'Yok')],
  ['biometric_unlock', 'Kilit Açma Yöntemi', v => v],
  ['is_foldable', 'Katlanabilir', v => (v ? 'Evet' : 'Hayır')],
  ['fold_style', 'Katlama Tipi', v => v],
  ['has_stylus_support', 'Kalem (Stylus) Desteği', v => (v ? 'Var' : 'Yok')],
  ['sim_type', 'SIM Desteği', v => v],
  ['has_ir_blaster', 'Kızılötesi (IR) Kumanda', v => (v ? 'Var' : 'Yok')],
  ['video_8k', '8K Video Kaydı', v => (v ? 'Var' : 'Yok')],
  ['satellite_connectivity', 'Uydu Bağlantısı', v => (v ? 'Var' : 'Yok')],
  ['has_headphone_jack', 'Kulaklık Girişi (3.5mm)', v => (v ? 'Var' : 'Yok')],
  ['has_expandable_storage', 'Hafıza Kartı Desteği (microSD)', v => (v ? 'Var' : 'Yok')],
  ['has_camera_button', 'Fiziksel Kamera Düğmesi', v => (v ? 'Var' : 'Yok')],
  ['release_year', 'Çıkış Yılı', v => v],
];

// Sayfanın her yerinde ortak: nav, tipografi, renk token'ları — index.html
// ile aynı tasarım dili, ama sadece bu sayfada gereken alt küme.
const PAGE_STYLE = `
  :root{
    --bg:#0a0a0e;--surface:#16171f;--surface-2:#1e202b;--border:#2a2c38;
    --text:#edeef3;--muted:#9a9db0;--signal:#7c82ff;--signal-soft:#1b1c3d;
    --deal:#c8ff4d;--deal-ink:#12140a;--radius:14px;--maxw:820px;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;-webkit-font-smoothing:antialiased}
  h1,h2,.display{font-family:'Space Grotesk',sans-serif}
  a{color:inherit}
  .wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
  .nav{position:sticky;top:0;z-index:10;background:rgba(10,10,14,.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--border)}
  .nav .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
  .logo{font-weight:700;font-size:19px;display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--text)}
  .logo .dot{width:9px;height:9px;border-radius:50%;background:var(--deal);display:inline-block}
  .back-link{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600;color:var(--signal);text-decoration:none;margin:24px 0}
  main{padding-bottom:70px}
  .product-hero{display:flex;gap:26px;align-items:flex-start;margin-bottom:36px;flex-wrap:wrap}
  .hero-thumb{
    width:150px;height:150px;border-radius:16px;flex-shrink:0;
    background:radial-gradient(circle at 30% 24%, var(--signal-soft), var(--bg) 72%);
    border:1px solid var(--border);display:flex;align-items:center;justify-content:center;
  }
  .hero-thumb svg{width:64px;height:64px}
  .hero-thumb .thumb-body{fill:none;stroke:var(--signal);stroke-width:2}
  .hero-thumb .thumb-screen{fill:var(--signal-soft)}
  .hero-thumb .thumb-detail{fill:var(--signal)}
  .hero-info{flex:1;min-width:240px}
  .brand-badge{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--signal);display:block;margin-bottom:8px}
  h1{font-size:clamp(22px,3.4vw,30px);line-height:1.2;margin:0 0 14px;letter-spacing:-.01em}
  .price-big{font-family:'IBM Plex Mono',monospace;font-size:32px;font-weight:600}
  .seller-line{font-size:13.5px;color:var(--muted);margin-top:4px}
  .lowest-badge{display:flex;align-items:center;gap:5px;margin-top:9px;font-size:12px;font-weight:600;color:var(--deal)}
  .lowest-badge svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  .color-picker{margin-top:18px}
  .color-picker-label{font-size:12px;color:var(--muted);margin-bottom:8px}
  .color-swatches{display:flex;gap:8px;flex-wrap:wrap}
  .color-swatch{
    width:30px;height:30px;border-radius:50%;padding:2px;border:2px solid transparent;
    background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;
  }
  .color-swatch.selected{border-color:var(--signal)}
  .color-swatch .swatch-dot{
    width:100%;height:100%;border-radius:50%;background:var(--swatch-color);
    border:1px solid rgba(255,255,255,.15);display:block;
  }
  .color-picker-selected{font-size:13px;color:var(--text);margin-top:9px;font-weight:600}
  .variant-picker{margin-top:18px;display:flex;flex-direction:column;gap:16px}
  .variant-picker-label{font-size:12px;color:var(--muted);margin-bottom:8px}
  .variant-pills{display:flex;gap:8px;flex-wrap:wrap}
  .variant-pill{
    background:var(--surface-2);border:1.5px solid var(--border);color:var(--text);
    font-size:13px;font-weight:600;padding:8px 14px;border-radius:9px;cursor:pointer;
    font-family:'IBM Plex Mono',monospace;
  }
  .variant-pill.selected{border-color:var(--signal);background:var(--signal-soft);color:var(--signal)}
  .offer-variant-tag{font-size:11px;color:var(--muted);font-weight:500;font-family:'IBM Plex Mono',monospace}
  section{margin-bottom:36px}
  section h2{font-size:18px;margin:0 0 16px}
  table.spec-table{width:100%;border-collapse:collapse;font-size:13.5px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
  table.spec-table th,table.spec-table td{text-align:left;padding:11px 16px;border-bottom:1px solid var(--border)}
  table.spec-table tr:last-child th,table.spec-table tr:last-child td{border-bottom:none}
  table.spec-table th{color:var(--muted);font-weight:500;width:46%}
  table.spec-table td{font-family:'IBM Plex Mono',monospace}
  .offer-row{
    background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;
  }
  .offer-row-top{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
  .offer-row-info{display:flex;flex-direction:column;gap:3px}
  .offer-seller{font-size:14px;font-weight:600}
  .offer-price{font-family:'IBM Plex Mono',monospace;font-size:15px;color:var(--muted)}
  .offer-buy{
    display:inline-flex;align-items:center;gap:7px;background:var(--signal);color:#fff;font-weight:700;
    font-size:13px;padding:9px 14px;border-radius:9px;text-decoration:none;white-space:nowrap;
  }
  .ad-tag{font-size:9px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.03em}
  .muted{color:var(--muted);font-size:13px;margin:0}
  .not-found{padding:80px 24px;text-align:center}
`;

const THUMB_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <rect class="thumb-body" x="20" y="6" width="24" height="52" rx="7"/>
  <rect class="thumb-screen" x="24" y="12.5" width="16" height="33" rx="1.5"/>
  <rect class="thumb-detail" x="27" y="8.5" width="10" height="1.8" rx=".9"/>
  <circle class="thumb-detail" cx="32" cy="50.5" r="1.7"/>
</svg>`;

// index.html ile aynı favicon — /urun/:id sayfalarında hiç yoktu
const FAVICON_LINK = `<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22><rect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%230a0a0e%22/><circle cx=%2216%22 cy=%2216%22 r=%227%22 fill=%22%23c8ff4d%22/></svg>">`;

function renderNav(frontendUrl) {
  return `<header class="nav"><div class="wrap">
    <a href="${frontendUrl}/index.html" class="logo"><span class="dot"></span>Makulbul</a>
  </div></header>`;
}

function renderNotFoundPage(frontendUrl) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="UTF-8">
<title>Ürün bulunamadı — Makulbul</title>
<meta name="robots" content="noindex">
${FAVICON_LINK}
<style>${PAGE_STYLE}</style>
</head><body>
${renderNav(frontendUrl)}
<div class="wrap not-found">
  <h1>Ürün bulunamadı</h1>
  <p class="muted">Bu ürün kaldırılmış olabilir.</p>
  <a class="back-link" href="${frontendUrl}/index.html#catalog">← Tüm modellere dön</a>
</div>
</body></html>`;
}

function renderProductPage(product, { backendUrl, frontendUrl, minPrice30d }) {
  const specs = product.specs || {};
  const offers = [...(product.offers || [])].sort((a, b) => a.price - b.price);
  const best = offers[0];
  const slug = slugify(product.canonical_name);
  const canonicalUrl = `${backendUrl}/urun/${product.id}/${slug}`;
  const title = `${product.canonical_name} Fiyatları ve Özellikleri — Makulbul`;
  const description = best
    ? `${product.canonical_name} fiyatlarını karşılaştır: ${offers.length} satıcı arasında en uygun fiyat ${fmtTL(best.price)}. Teknik özellikler, fiyat geçmişi ve satıcı karşılaştırması Makulbul'ta.`
    : `${product.canonical_name} teknik özellikleri ve fiyat karşılaştırması Makulbul'ta.`;

  const isLowestIn30d = best && minPrice30d != null && Number(best.price) <= Number(minPrice30d) + 0.5;

  // Araştırma, kataloğumuzdaki birçok ürünün artık KENDİ spec'indeki
  // kapasitede sıfır satılmadığını ama AYNI modelin FARKLI bir
  // kapasitede/renkte gerçekten satışta olduğunu ortaya çıkardı (bkz.
  // apply-real-prices-round2.js). Tekliflerdeki GERÇEK (storage_gb,
  // color) kombinasyonlarını grupluyoruz — birden fazla gerçek varyant
  // varsa interaktif bir seçici gösteriyoruz (fiyat/satıcı listesi
  // GERÇEKTEN değişiyor); tek varyant varsa (kataloğun çoğunluğu) eski
  // sade görünüm (salt bilgilendirici renk swatch'ları) korunuyor.
  function variantKeyOf(o) { return `${o.storage_gb}::${o.color}`; }
  const variantGroups = new Map();
  for (const o of offers) {
    const key = variantKeyOf(o);
    if (!variantGroups.has(key)) variantGroups.set(key, { storage_gb: o.storage_gb, color: o.color, offers: [] });
    variantGroups.get(key).offers.push(o);
  }
  const variants = [...variantGroups.values()]
    .map(v => ({ ...v, offers: v.offers.sort((a, b) => a.price - b.price) }))
    .sort((a, b) => a.offers[0].price - b.offers[0].price);
  const hasVariantPicker = variants.length > 1;
  const defaultVariant = variants[0];
  const storageOptions = [...new Set(variants.map(v => v.storage_gb))].sort((a, b) => a - b);

  // "Depolama" spek satırı: birden fazla gerçek varyant varsa (ör.
  // ürünün nominal spec'i 128GB ama en ucuz gerçek teklif 512GB'da),
  // sayfa İLK AÇILIŞTA da varsayılan (en ucuz) varyantın kapasitesini
  // göstermeli — yoksa kullanıcı hiç bir seçime tıklamadan sayfayı
  // görürse "Depolama: 128 GB" yazarken üstteki fiyat/teklif aslında
  // 512GB'a ait olur, tutarsız görünür.
  const displayStorageGb = hasVariantPicker ? defaultVariant.storage_gb : specs.storage_gb;
  const specRows = SPEC_LABELS
    .filter(([key]) => specs[key] !== undefined && specs[key] !== null)
    .map(([key, label, fmtFn]) => `<tr><th>${esc(label)}</th><td${key === 'storage_gb' ? ' id="spec-storage-value"' : ''}>${esc(key === 'storage_gb' ? fmtFn(displayStorageGb) : fmtFn(specs[key]))}</td></tr>`)
    .join('');

  // Renk seçimi TEK varyantlı ürünlerde salt bilgilendirme amaçlı —
  // kataloğumuzda o durumda renge göre ayrı fiyat/teklif yok.
  const colors = Array.isArray(specs.colors) ? specs.colors : [];

  const variantPickerHTML = hasVariantPicker ? `
    <div class="variant-picker" id="variant-picker" data-variants="${esc(JSON.stringify(variants))}">
      ${storageOptions.length > 1 ? `
      <div class="variant-group">
        <div class="variant-picker-label">Depolama</div>
        <div class="variant-pills" id="storage-pills">
          ${storageOptions.map(gb => `<button type="button" class="variant-pill${gb === defaultVariant.storage_gb ? ' selected' : ''}" data-storage="${gb}">${formatGb(gb)}</button>`).join('')}
        </div>
      </div>` : ''}
      <div class="variant-group" id="variant-color-group"></div>
    </div>` : (colors.length ? `
    <div class="color-picker" id="color-picker">
      <div class="color-picker-label">Renk Seçenekleri</div>
      <div class="color-swatches">
        ${colors.map((c, i) => `
          <button type="button" class="color-swatch${i === 0 ? ' selected' : ''}" data-color="${esc(c)}" style="--swatch-color:${colorSwatchHex(c)}" title="${esc(c)}" aria-label="${esc(c)}"><span class="swatch-dot"></span></button>
        `).join('')}
      </div>
      <div class="color-picker-selected">${esc(colors[0])}</div>
    </div>` : '');

  function offerRowHTML(o) {
    const tag = hasVariantPicker && (o.storage_gb || o.color)
      ? ` <span class="offer-variant-tag">${o.storage_gb ? formatGb(o.storage_gb) : ''}${o.storage_gb && o.color ? ', ' : ''}${esc(o.color || '')}</span>`
      : '';
    return `
    <div class="offer-row">
      <div class="offer-row-top">
        <div class="offer-row-info">
          <span class="offer-seller">${esc(o.seller_name)}${tag}</span>
          <span class="offer-price">${fmtTL(o.price)}</span>
        </div>
        <a class="offer-buy" href="${safeHref(o.affiliate_url)}" target="_blank" rel="nofollow sponsored noopener">Satıcıya Git <span class="ad-tag">Reklam</span></a>
      </div>
    </div>`;
  }
  // İlk yüklemede sadece VARSAYILAN (en ucuz) varyantın teklifleri
  // gösteriliyor — kalan varyantlar seçici ile client-side filtreleniyor
  // (tüm teklif verisi zaten sayfaya gömülü, yeni bir istek gerekmiyor).
  const initialOfferList = hasVariantPicker ? defaultVariant.offers : offers;
  const offerRows = initialOfferList.map(offerRowHTML).join('');

  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.canonical_name,
    brand: { '@type': 'Brand', name: product.brand },
    ...(best ? {
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'TRY',
        lowPrice: Number(best.price),
        highPrice: Number(offers[offers.length - 1].price),
        offerCount: offers.length,
        availability: 'https://schema.org/InStock',
      },
    } : {}),
  };

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Makulbul">
<meta property="og:locale" content="tr_TR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:image" content="${backendUrl}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${backendUrl}/og-image.png">
${best ? `<meta property="product:price:amount" content="${Number(best.price)}"><meta property="product:price:currency" content="TRY">` : ''}
<meta name="theme-color" content="#0a0a0e">
${FAVICON_LINK}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>
<style>${PAGE_STYLE}</style>
</head>
<body>
${renderNav(frontendUrl)}
<main class="wrap">
  <a class="back-link" href="${frontendUrl}/index.html#catalog">← Tüm modellere dön</a>

  <div class="product-hero">
    <div class="hero-thumb">${THUMB_SVG}</div>
    <div class="hero-info">
      <span class="brand-badge">${esc(product.brand)}</span>
      <h1>${esc(displayModelName(product.canonical_name))}</h1>
      ${best ? `
        <div class="price-big" id="price-big">${fmtTL(best.price)}</div>
        <div class="seller-line" id="seller-line">${esc(best.seller_name)} üzerinden en uygun fiyat · ${initialOfferList.length} satıcı karşılaştırıldı</div>
        ${isLowestIn30d ? `<div class="lowest-badge"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v9"/><path d="M4.5 8 8 11.5 11.5 8"/></svg><span>Son 30 günün en düşük fiyatı</span></div>` : ''}
      ` : `<p class="muted">Şu an satışta değil.</p>`}
      ${variantPickerHTML}
    </div>
  </div>

  <section>
    <h2>Teknik özellikler</h2>
    <table class="spec-table">${specRows}</table>
  </section>

  <section>
    <h2 id="offers-heading">Satıcılar (${initialOfferList.length})</h2>
    <div id="offer-rows-container">${offerRows || '<p class="muted">Şu an aktif teklif bulunmuyor.</p>'}</div>
  </section>

  <section>
    <h2>Fiyat geçmişi</h2>
    <p class="muted">Yakında</p>
  </section>
</main>

<script>
(function(){
  var API_BASE = ${JSON.stringify(backendUrl)};

  // Birinci taraf, kimliksiz sayfa görüntüleme sayacı
  fetch(API_BASE + '/api/track', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ path: location.pathname }),
  }).catch(function(){});

  // Renk seçici: sadece görsel bir tercih (fiyat/teklif renge göre
  // değişmiyor, kataloğumuzda böyle bir ayrım yok) — hangi swatch'a
  // tıklandıysa "selected" durumuna geçiyor ve alttaki etikette adı
  // gösteriliyor.
  var picker = document.getElementById('color-picker');
  if (picker) {
    var swatches = picker.querySelectorAll('.color-swatch');
    var label = picker.querySelector('.color-picker-selected');
    swatches.forEach(function(btn){
      btn.addEventListener('click', function(){
        swatches.forEach(function(b){ b.classList.remove('selected'); });
        btn.classList.add('selected');
        if (label) label.textContent = btn.dataset.color;
      });
    });
  }

  // Depolama/renk VARYANT seçici: renk seçicinin aksine burası salt
  // görsel değil — her (kapasite, renk) kombinasyonunun KENDİ gerçek
  // satıcı tekliflerini gösteriyor (bkz. apply-real-prices-round2.js).
  // Seçim değiştikçe fiyat, satıcı sayısı, "Depolama" spek satırı ve
  // teklif listesi GERÇEKTEN güncelleniyor — yeni bir istek atmadan,
  // sayfaya zaten gömülü olan tüm varyant verisini filtreleyerek.
  var variantPicker = document.getElementById('variant-picker');
  if (variantPicker) {
    var variants = JSON.parse(variantPicker.getAttribute('data-variants'));
    var fmt = function(n){ return Number(n).toLocaleString('tr-TR') + ' TL'; };
    var storagePillsEl = document.getElementById('storage-pills');
    var colorGroupEl = document.getElementById('variant-color-group');
    var priceBigEl = document.getElementById('price-big');
    var sellerLineEl = document.getElementById('seller-line');
    var offersHeadingEl = document.getElementById('offers-heading');
    var offerRowsContainerEl = document.getElementById('offer-rows-container');
    var specStorageEl = document.getElementById('spec-storage-value');

    function escHtml(s){
      return String(s || '').replace(/[&<>"']/g, function(c){
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
      });
    }
    function safeUrl(url){
      try {
        var u = new URL(url, location.href);
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '#';
      } catch (e) { return '#'; }
    }
    // Sunucu tarafındaki formatGb() ile aynı mantık — 1024'ün katı olan
    // kapasiteleri "1TB" gibi okunaklı gösterir.
    function formatGb(gb){
      var n = Number(gb);
      return (n >= 1024 && n % 1024 === 0) ? (n / 1024) + 'TB' : n + 'GB';
    }
    // Sunucu tarafındaki colorSwatchHex() ile aynı mantık — client-side
    // tekrar yazılmak zorunda çünkü seçim değişince YENİ swatch'lar
    // burada, tarayıcıda üretiliyor.
    function colorHex(name){
      var n = (name || '').toLowerCase();
      if (n.indexOf('siyah')>-1||n.indexOf('obsidyen')>-1||n.indexOf('gece')>-1||n.indexOf('arduvaz')>-1) return '#1c1c1e';
      if (n.indexOf('beyaz')>-1||n.indexOf('porselen')>-1||n.indexOf('bulut')>-1) return '#f2f1ed';
      if (n.indexOf('mavi')>-1||n.indexOf('lacivert')>-1||n.indexOf('indigo')>-1||n.indexOf('gökyüzü')>-1||n.indexOf('gelgit')>-1) return '#3d6ea5';
      if (n.indexOf('kırmızı')>-1||n.indexOf('mercan')>-1||n.indexOf('red')>-1) return '#c0392b';
      if (n.indexOf('yeşil')>-1||n.indexOf('yosun')>-1||n.indexOf('yeşim')>-1||n.indexOf('adaçayı')>-1||n.indexOf('zeytin')>-1) return '#5c7d5a';
      if (n.indexOf('sarı')>-1) return '#d8c22c';
      if (n.indexOf('mor')>-1||n.indexOf('lavanta')>-1||n.indexOf('orkide')>-1||n.indexOf('kobalt')>-1) return '#7b5ea7';
      if (n.indexOf('pembe')>-1||n.indexOf('rose')>-1) return '#dfa3b5';
      if (n.indexOf('turkuaz')>-1) return '#2a9d8f';
      if (n.indexOf('turuncu')>-1) return '#d9782d';
      if (n.indexOf('altın')>-1||n.indexOf('gold')>-1) return '#c9a86a';
      if (n.indexOf('gümüş')>-1||n.indexOf('silver')>-1) return '#c7c7c9';
      if (n.indexOf('gri')>-1||n.indexOf('grafit')>-1||n.indexOf('antrasit')>-1||n.indexOf('titanyum')>-1) return '#8a8a8e';
      if (n.indexOf('bej')>-1) return '#d8c6a8';
      return '#9a9a9a';
    }

    function variantsForStorage(gb){
      return variants.filter(function(v){ return v.storage_gb === gb; });
    }
    function renderOfferRows(offerList, gb){
      offerRowsContainerEl.innerHTML = offerList.map(function(o){
        var tag = (gb || o.color) ? ' <span class="offer-variant-tag">' + (gb ? formatGb(gb) : '') + (gb && o.color ? ', ' : '') + escHtml(o.color || '') + '</span>' : '';
        return '<div class="offer-row"><div class="offer-row-top"><div class="offer-row-info">' +
          '<span class="offer-seller">' + escHtml(o.seller_name) + tag + '</span>' +
          '<span class="offer-price">' + fmt(o.price) + '</span></div>' +
          '<a class="offer-buy" href="' + safeUrl(o.affiliate_url) + '" target="_blank" rel="nofollow sponsored noopener">Satıcıya Git <span class="ad-tag">Reklam</span></a></div>' +
          '</div>';
      }).join('') || '<p class="muted">Bu seçenek için şu an teklif yok.</p>';
    }
    function renderColorSwatches(gb, selectedColor){
      var withColor = variantsForStorage(gb).filter(function(v){ return v.color; });
      if (!withColor.length) { colorGroupEl.innerHTML = ''; return; }
      colorGroupEl.innerHTML =
        '<div class="variant-picker-label">Renk</div><div class="color-swatches">' +
        withColor.map(function(v){
          var sel = v.color === selectedColor ? ' selected' : '';
          return '<button type="button" class="color-swatch' + sel + '" data-color="' + escHtml(v.color) + '" style="--swatch-color:' + colorHex(v.color) + '" title="' + escHtml(v.color) + '"><span class="swatch-dot"></span></button>';
        }).join('') +
        '</div><div class="color-picker-selected">' + escHtml(selectedColor || '') + '</div>';
      colorGroupEl.querySelectorAll('.color-swatch').forEach(function(btn){
        btn.addEventListener('click', function(){ selectVariant(gb, btn.getAttribute('data-color')); });
      });
    }
    function selectVariant(gb, color){
      var match = variants.filter(function(v){ return v.storage_gb === gb && v.color === color; })[0] || variantsForStorage(gb)[0];
      if (!match) return;
      var best = match.offers[0];
      priceBigEl.textContent = fmt(best.price);
      sellerLineEl.textContent = best.seller_name + ' üzerinden en uygun fiyat · ' + match.offers.length + ' satıcı karşılaştırıldı';
      if (offersHeadingEl) offersHeadingEl.textContent = 'Satıcılar (' + match.offers.length + ')';
      if (specStorageEl) specStorageEl.textContent = (gb >= 1024 && gb % 1024 === 0) ? (gb / 1024) + ' TB' : gb + ' GB';
      renderOfferRows(match.offers, gb);
      if (storagePillsEl) {
        storagePillsEl.querySelectorAll('.variant-pill').forEach(function(p){
          p.classList.toggle('selected', Number(p.getAttribute('data-storage')) === gb);
        });
      }
      renderColorSwatches(gb, match.color);
    }

    if (storagePillsEl) {
      storagePillsEl.querySelectorAll('.variant-pill').forEach(function(btn){
        btn.addEventListener('click', function(){
          var gb = Number(btn.getAttribute('data-storage'));
          var vs = variantsForStorage(gb);
          selectVariant(gb, vs[0].color);
        });
      });
    }
    // İlk render zaten sunucu tarafında en ucuz varyantla yapıldı,
    // sadece o varyanta uygun renk swatch'larını çiziyoruz.
    renderColorSwatches(variants[0].storage_gb, variants[0].color);
  }
})();
</script>
</body>
</html>`;
}

module.exports = { renderProductPage, renderNotFoundPage, slugify };
