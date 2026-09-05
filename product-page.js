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

const SPEC_LABELS = [
  ['ram_gb', 'RAM', v => `${v} GB`],
  ['storage_gb', 'Depolama', v => `${v} GB`],
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
  .offer-installments{font-size:11.5px;color:var(--muted);font-family:'IBM Plex Mono',monospace;margin-top:9px}
  .offer-buy{
    display:inline-flex;align-items:center;gap:7px;background:var(--signal);color:#fff;font-weight:700;
    font-size:13px;padding:9px 14px;border-radius:9px;text-decoration:none;white-space:nowrap;
  }
  .ad-tag{font-size:9px;font-weight:600;opacity:.85;text-transform:uppercase;letter-spacing:.03em}
  #history-chart{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px}
  .history-meta{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:8px}
  .history-change{font-weight:700;font-family:'IBM Plex Mono',monospace}
  .chart-wrap{position:relative}
  .history-svg{width:100%;height:110px;display:block;cursor:crosshair}
  .hover-line{stroke:var(--border);stroke-width:1;opacity:0;transition:opacity .1s}
  .hover-line.show{opacity:1}
  .hover-dot{fill:var(--signal);stroke:var(--bg);stroke-width:2;opacity:0;transition:opacity .1s}
  .hover-dot.show{opacity:1}
  .chart-tooltip{
    position:absolute;pointer-events:none;opacity:0;transition:opacity .1s;
    background:var(--surface-2);border:1px solid var(--border);border-radius:8px;
    padding:7px 10px;white-space:nowrap;transform:translate(-50%,-125%);z-index:5;
    box-shadow:0 10px 24px -8px rgba(0,0,0,.6);
  }
  .chart-tooltip.show{opacity:1}
  .chart-tooltip .tt-date{display:block;font-size:10.5px;color:var(--muted);margin-bottom:2px}
  .chart-tooltip .tt-price{display:block;font-size:13px;font-weight:700;font-family:'IBM Plex Mono',monospace}
  .history-range{display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:9px;font-family:'IBM Plex Mono',monospace}
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
    <a href="${frontendUrl}/index.html" class="logo"><span class="dot"></span>Cepfiyat</a>
  </div></header>`;
}

function renderNotFoundPage(frontendUrl) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="UTF-8">
<title>Ürün bulunamadı — Cepfiyat</title>
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

// Fiyat alarmı onay linkine tıklanınca gösterilen basit sonuç sayfası.
function renderVerifyPage({ success, message, frontendUrl, pageTitle, heading, cancelUrl }) {
  const titleText = pageTitle || (success ? 'Alarm onaylandı' : 'Onay başarısız');
  const headingText = heading || (success ? '✓ Fiyat alarmın onaylandı' : 'Onay bağlantısı geçersiz');
  return `<!doctype html>
<html lang="tr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titleText)} — Cepfiyat</title>
<meta name="robots" content="noindex">
${FAVICON_LINK}
<style>${PAGE_STYLE}</style>
</head><body>
${renderNav(frontendUrl)}
<div class="wrap not-found">
  <h1>${esc(headingText)}</h1>
  <p class="muted">${esc(message)}</p>
  ${cancelUrl ? `<p class="muted" style="margin-top:16px">Fikrini değiştirirsen: <a href="${esc(cancelUrl)}">bu alarmı iptal et</a></p>` : ''}
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
  const title = `${product.canonical_name} Fiyatları ve Özellikleri — Cepfiyat`;
  const description = best
    ? `${product.canonical_name} fiyatlarını karşılaştır: ${offers.length} satıcı arasında en uygun fiyat ${fmtTL(best.price)}. Teknik özellikler, fiyat geçmişi ve satıcı karşılaştırması Cepfiyat'ta.`
    : `${product.canonical_name} teknik özellikleri ve fiyat karşılaştırması Cepfiyat'ta.`;

  const isLowestIn30d = best && minPrice30d != null && Number(best.price) <= Number(minPrice30d) + 0.5;

  const specRows = SPEC_LABELS
    .filter(([key]) => specs[key] !== undefined && specs[key] !== null)
    .map(([key, label, fmtFn]) => `<tr><th>${esc(label)}</th><td>${esc(fmtFn(specs[key]))}</td></tr>`)
    .join('');

  const offerRows = offers.map(o => `
    <div class="offer-row">
      <div class="offer-row-top">
        <div class="offer-row-info">
          <span class="offer-seller">${esc(o.seller_name)}</span>
          <span class="offer-price">${fmtTL(o.price)}</span>
        </div>
        <a class="offer-buy" href="${safeHref(o.affiliate_url)}" target="_blank" rel="nofollow sponsored noopener">Satıcıya Git <span class="ad-tag">Reklam</span></a>
      </div>
      ${o.installments ? `<div class="offer-installments">${o.installments.map(i => `${i.months} x ${fmtTL(i.monthlyAmount)}`).join(' · ')}</div>` : ''}
    </div>`).join('');

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
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="product">
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
      <h1>${esc(product.canonical_name)}</h1>
      ${best ? `
        <div class="price-big">${fmtTL(best.price)}</div>
        <div class="seller-line">${esc(best.seller_name)} üzerinden en uygun fiyat · ${offers.length} satıcı karşılaştırıldı</div>
        ${isLowestIn30d ? `<div class="lowest-badge"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v9"/><path d="M4.5 8 8 11.5 11.5 8"/></svg><span>Son 30 günün en düşük fiyatı</span></div>` : ''}
      ` : `<p class="muted">Şu an satışta değil.</p>`}
    </div>
  </div>

  <section>
    <h2>Teknik özellikler</h2>
    <table class="spec-table">${specRows}</table>
  </section>

  <section>
    <h2>Satıcılar (${offers.length})</h2>
    ${offerRows || '<p class="muted">Şu an aktif teklif bulunmuyor.</p>'}
  </section>

  <section>
    <h2>Fiyat geçmişi</h2>
    <div id="history-chart"><p class="muted">Yükleniyor...</p></div>
  </section>
</main>

<script>
(function(){
  var API_BASE = ${JSON.stringify(backendUrl)};
  var fmt = function(n){ return Number(n).toLocaleString('tr-TR') + ' TL'; };
  var fmtDate = function(d){ return new Date(d).toLocaleDateString('tr-TR', {day:'numeric', month:'short', year:'numeric'}); };

  // Birinci taraf, kimliksiz sayfa görüntüleme sayacı
  fetch(API_BASE + '/api/track', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ path: location.pathname }),
  }).catch(function(){});

  fetch(API_BASE + '/api/products/${product.id}/price-history?days=90')
    .then(function(r){ return r.json(); })
    .then(function(points){
      var container = document.getElementById('history-chart');
      var chart = buildChart(points);
      container.innerHTML = chart.html;
      if(chart.coords) attachChartInteraction(container, chart, points);
    })
    .catch(function(){
      document.getElementById('history-chart').innerHTML = '<p class="muted">Fiyat geçmişi yüklenemedi.</p>';
    });

  function buildChart(points){
    if(!points || points.length < 2){
      return { html: '<p class="muted">Henüz yeterli fiyat geçmişi yok.</p>' };
    }
    var prices = points.map(function(pt){ return Number(pt.price); });
    var min = Math.min.apply(null, prices);
    var max = Math.max.apply(null, prices);
    var range = (max - min) || 1;
    var w = 700, h = 110, pad = 6;
    var stepX = (w - pad*2) / (points.length - 1);
    var coords = prices.map(function(price, i){
      return [pad + i*stepX, pad + (h - pad*2) * (1 - (price - min)/range)];
    });
    var linePath = coords.map(function(c, i){ return (i===0?'M':'L') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ');
    var areaPath = linePath + ' L ' + coords[coords.length-1][0].toFixed(1) + ' ' + (h-pad) + ' L ' + coords[0][0].toFixed(1) + ' ' + (h-pad) + ' Z';
    var first = prices[0], last = prices[prices.length-1];
    var changePct = ((last - first) / first) * 100;
    var changeLabel = (changePct >= 0 ? '+' : '') + changePct.toFixed(1) + '%';
    var changeColor = changePct > 0.05 ? '#ff6b6b' : (changePct < -0.05 ? 'var(--deal)' : 'var(--muted)');
    var lastC = coords[coords.length-1];
    var startLabel = new Date(points[0].date).toLocaleDateString('tr-TR', {day:'numeric', month:'short'});
    var endLabel = new Date(points[points.length-1].date).toLocaleDateString('tr-TR', {day:'numeric', month:'short'});

    var html = '' +
      '<div class="history-meta"><span>' + startLabel + ' — ' + endLabel + ' arası en iyi fiyat · noktaların üzerine gel</span>' +
      '<span class="history-change" style="color:' + changeColor + '">' + changeLabel + '</span></div>' +
      '<div class="chart-wrap">' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" class="history-svg" preserveAspectRatio="none">' +
      '<line class="hover-line" x1="0" y1="' + pad + '" x2="0" y2="' + (h-pad) + '"></line>' +
      '<path d="' + areaPath + '" fill="var(--signal-soft)" stroke="none"></path>' +
      '<path d="' + linePath + '" fill="none" stroke="var(--signal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>' +
      '<circle cx="' + lastC[0].toFixed(1) + '" cy="' + lastC[1].toFixed(1) + '" r="3.5" fill="var(--deal)"></circle>' +
      '<circle class="hover-dot" r="4"></circle>' +
      '</svg>' +
      '<div class="chart-tooltip"><span class="tt-date"></span><span class="tt-price"></span></div>' +
      '</div>' +
      '<div class="history-range"><span>En düşük: ' + fmt(min) + '</span><span>En yüksek: ' + fmt(max) + '</span></div>';

    return { html: html, coords: coords, w: w, h: h };
  }

  // Fare/parmak konumuna en yakın veri noktasını bulup üzerinde tarih +
  // fiyatı gösteren bir tooltip ve dikey kılavuz çizgi çizer.
  function attachChartInteraction(container, chart, points){
    var svg = container.querySelector('.history-svg');
    var wrap = container.querySelector('.chart-wrap');
    var tooltip = container.querySelector('.chart-tooltip');
    var hoverDot = container.querySelector('.hover-dot');
    var hoverLine = container.querySelector('.hover-line');
    var dateEl = tooltip.querySelector('.tt-date');
    var priceEl = tooltip.querySelector('.tt-price');
    var coords = chart.coords;

    function update(clientX){
      var rect = svg.getBoundingClientRect();
      var relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      var vbX = (relX / rect.width) * chart.w;
      var nearest = 0, minDist = Infinity;
      for(var i=0;i<coords.length;i++){
        var d = Math.abs(coords[i][0] - vbX);
        if(d < minDist){ minDist = d; nearest = i; }
      }
      var x = coords[nearest][0], y = coords[nearest][1];
      hoverDot.setAttribute('cx', x); hoverDot.setAttribute('cy', y);
      hoverLine.setAttribute('x1', x); hoverLine.setAttribute('x2', x);
      hoverDot.classList.add('show'); hoverLine.classList.add('show');

      var wrapRect = wrap.getBoundingClientRect();
      var pxX = rect.left + (x / chart.w) * rect.width - wrapRect.left;
      var pxY = rect.top + (y / chart.h) * rect.height - wrapRect.top;
      tooltip.style.left = pxX + 'px';
      tooltip.style.top = pxY + 'px';
      dateEl.textContent = fmtDate(points[nearest].date);
      priceEl.textContent = fmt(points[nearest].price);
      tooltip.classList.add('show');
    }
    function hide(){
      hoverDot.classList.remove('show'); hoverLine.classList.remove('show'); tooltip.classList.remove('show');
    }

    svg.addEventListener('mousemove', function(e){ update(e.clientX); });
    svg.addEventListener('mouseleave', hide);
    svg.addEventListener('touchstart', function(e){ update(e.touches[0].clientX); }, {passive:true});
    svg.addEventListener('touchmove', function(e){ update(e.touches[0].clientX); e.preventDefault(); }, {passive:false});
    svg.addEventListener('touchend', hide);
  }
})();
</script>
</body>
</html>`;
}

module.exports = { renderProductPage, renderNotFoundPage, renderVerifyPage, slugify };
