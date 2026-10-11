// seo-pages.js — "30.000 TL altı en iyi laptop" gibi, ARAMA NİYETİNE yönelik
// rehber sayfaları. İçerik tamamen veritabanındaki GERÇEK ürün/fiyat/stok
// verisinden üretilir (elle yazılmış ürün iddiası yok):
//   • yalnızca şu an STOKTA teklifi olan ürünler listelenir,
//   • sıralama ölçütü sayfada açıkça yazılır (donanım puanı),
//   • yeterli ürün yoksa (ince içerik) sayfa hiç yayınlanmaz.
// Sayfa kataloğu (hangi sayfaların var olduğu) ürün verisine göre her
// çağrıda yeniden hesaplanır; stok değişince sayfalar kendiliğinden
// belirir/kaybolur. Sitemap ve /en-iyi hub'ı aynı kataloğu kullanır.

const { scoreChip } = require('./chip-tiers');
const { computeLaptopPowerScore } = require('./chip-tiers-laptop');
const { PAGE_STYLE, FAVICON_LINK, renderNav, esc, fmtTL, displayModelName, formatGb, slugify } = require('./product-page');

const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const PHONE_BUDGETS = [15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
const LAPTOP_BUDGETS = [30000, 40000, 50000, 60000, 75000, 100000, 150000];
const GAMING_BUDGETS = [60000, 80000, 100000, 125000];
const MIN_PRODUCTS = 4;       // bundan az ürünlü sayfa yayınlanmaz (ince içerik)
const MAX_LISTED = 15;

const tl = n => Number(n).toLocaleString('tr-TR');
const num = v => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
const hasDiscreteGpu = s => /rtx|gtx|radeon rx|arc a|arc b/i.test(String(s.gpu || ''));

// ---------------------------------------------------------------------
// Ürün → sayfa listesine uygun düz kayıt (yalnızca stokta olanlar)
// ---------------------------------------------------------------------
function toEntry(p) {
  const live = (p.offers || []).filter(o => o.in_stock !== false);
  if (!live.length) return null;
  const cheapest = live.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b));
  const specs = p.specs || {};
  const isLaptop = p.category === 'laptop';
  let power, rank;
  if (isLaptop) {
    power = computeLaptopPowerScore(specs);
    rank = power * 0.8 + Math.min((num(specs.ram_gb) || 0) / 32, 1) * 10 + Math.min((num(specs.storage_gb) || 0) / 1024, 1) * 10;
  } else {
    power = scoreChip(specs.chip);
    rank = power * 0.5 + Math.min((num(specs.ram_gb) || 0) / 16, 1) * 20 + Math.min((num(specs.battery_mah) || 0) / 6000, 1) * 20 + (specs.has_nfc ? 10 : 0);
  }
  return {
    id: p.id, name: p.canonical_name, brand: p.brand, category: p.category, specs,
    price: Number(cheapest.price), seller: cheapest.seller_name, sellerCount: new Set(live.map(o => o.seller_name)).size,
    power: Math.round(power), rank,
  };
}

// ---------------------------------------------------------------------
// Sayfa kataloğu
// ---------------------------------------------------------------------
function buildCatalog(products) {
  const entries = products.map(toEntry).filter(Boolean);
  const phones = entries.filter(e => e.category !== 'laptop');
  const laptops = entries.filter(e => e.category === 'laptop');
  const pages = [];

  const byRank = (a, b) => b.rank - a.rank || a.price - b.price;
  const byPrice = (a, b) => a.price - b.price;

  function push(def, list, sorter = byRank) {
    pages.push({ ...def, items: list.slice().sort(sorter), count: list.length });
  }

  // Bütçe sayfaları: önceki dilimden en az 2 ürün fazla olmalı (neredeyse aynı sayfaları üretme)
  function budgetPages(list, budgets, kind, noun, slugNoun, extra = {}) {
    let prev = 0;
    for (const b of budgets) {
      const sub = list.filter(e => e.price <= b);
      if (sub.length >= MIN_PRODUCTS && sub.length >= prev + 2) {
        push({
          slug: `${b}-tl-alti-${slugNoun}`, category: kind, kind: 'budget', budget: b,
          h1: `${tl(b)} TL Altı En İyi ${noun}`, short: `${tl(b)} TL altı ${noun.toLowerCase()}`,
          criteria: extra.criteria, nounLower: noun.toLowerCase(), unit: slugNoun, ...extra.def,
        }, sub);
        prev = sub.length;
      }
    }
  }

  budgetPages(phones, PHONE_BUDGETS, 'telefon', 'Telefonlar', 'telefon', { criteria: 'phone' });
  budgetPages(laptops, LAPTOP_BUDGETS, 'laptop', 'Laptoplar', 'laptop', { criteria: 'laptop' });

  // Oyun laptopları (ayrı ekran kartı olanlar)
  const gaming = laptops.filter(e => hasDiscreteGpu(e.specs));
  if (gaming.length >= MIN_PRODUCTS) {
    push({ slug: 'oyun-laptopu', category: 'laptop', kind: 'feature', h1: 'En İyi Oyun Laptopları', short: 'oyun laptopları', criteria: 'laptop', nounLower: 'oyun laptopları', unit: 'oyun laptopu', blurb: 'ayrı ekran kartı (RTX/GTX/Radeon) olan' }, gaming);
    let prev = 0;
    for (const b of GAMING_BUDGETS) {
      const sub = gaming.filter(e => e.price <= b);
      if (sub.length >= MIN_PRODUCTS && sub.length >= prev + 2) {
        push({ slug: `${b}-tl-alti-oyun-laptopu`, category: 'laptop', kind: 'budget', budget: b, h1: `${tl(b)} TL Altı En İyi Oyun Laptopları`, short: `${tl(b)} TL altı oyun laptopları`, criteria: 'laptop', nounLower: 'oyun laptopları', unit: 'oyun laptopu', blurb: 'ayrı ekran kartı (RTX/GTX/Radeon) olan' }, sub);
        prev = sub.length;
      }
    }
  }

  // Özellik sayfaları
  const light = laptops.filter(e => num(e.specs.weight_g) && num(e.specs.weight_g) <= 1500);
  if (light.length >= MIN_PRODUCTS) push({ slug: 'hafif-laptop', category: 'laptop', kind: 'feature', h1: 'En İyi Hafif Laptoplar', short: 'hafif laptoplar', criteria: 'laptop', nounLower: 'hafif laptoplar', unit: 'hafif laptop', blurb: '1,5 kg ve altında olan' }, light);
  const battery = phones.filter(e => num(e.specs.battery_mah) && num(e.specs.battery_mah) >= 5000);
  if (battery.length >= MIN_PRODUCTS) push({ slug: 'uzun-pilli-telefon', category: 'telefon', kind: 'feature', h1: 'En İyi Uzun Pilli Telefonlar', short: 'uzun pilli telefonlar', criteria: 'phone', nounLower: 'uzun pilli telefonlar', unit: 'uzun pilli telefon', blurb: 'bataryası 5000 mAh ve üzeri olan' }, battery);

  // Marka sayfaları
  for (const [list, kind, noun, slugNoun] of [[phones, 'telefon', 'Telefon', 'telefon'], [laptops, 'laptop', 'Laptop', 'laptop']]) {
    const brands = [...new Set(list.map(e => e.brand))];
    for (const brand of brands) {
      const sub = list.filter(e => e.brand === brand);
      if (sub.length >= MIN_PRODUCTS) {
        push({ slug: `${slugify(brand)}-${slugNoun}-fiyatlari`, category: kind, kind: 'brand', brand, h1: `${brand} ${noun} Fiyatları ve Modelleri`, short: `${brand} ${noun.toLowerCase()} modelleri`, criteria: kind === 'laptop' ? 'laptop' : 'phone', nounLower: `${brand} ${noun.toLowerCase()} modelleri`, unit: `${brand} ${noun.toLowerCase()}`, blurb: `${brand} marka` }, sub, byPrice);
      }
    }
  }
  return pages;
}

// ---------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------
const GUIDE_STYLE = `
  .wrap{max-width:860px}
  h1{margin:26px 0 12px}
  .lead{color:var(--muted);font-size:15.5px;line-height:1.65;margin:0 0 8px}
  .updated{font-size:12.5px;color:var(--muted);margin:0 0 24px}
  .item{display:flex;gap:16px;align-items:flex-start;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:12px}
  .item.top{border-color:#3a4a1a;background:#12150c}
  .rk{font-family:'IBM Plex Mono',monospace;font-weight:600;font-size:20px;color:var(--deal);min-width:30px;padding-top:2px}
  .it-body{flex:1;min-width:0}
  .it-name{font-family:'Space Grotesk',sans-serif;font-size:17.5px;font-weight:700;color:var(--text);text-decoration:none;display:block;line-height:1.3}
  .it-name:hover{color:var(--signal)}
  .it-specs{font-size:13px;color:var(--muted);margin:5px 0 0;line-height:1.55}
  .it-side{text-align:right;flex-shrink:0}
  .it-price{font-family:'IBM Plex Mono',monospace;font-size:17px;font-weight:600}
  .it-sub{font-size:11.5px;color:var(--muted);margin-top:3px}
  .it-btn{display:inline-block;margin-top:9px;background:var(--signal);color:#fff;font-weight:700;font-size:12.5px;padding:8px 13px;border-radius:9px;text-decoration:none}
  .badge{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:3px 8px;border-radius:6px;margin:0 6px 6px 0;background:var(--signal-soft);color:#b9bdff}
  .badge.g{background:#1d2a0e;color:var(--deal)}
  .note{font-size:13px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin:26px 0;line-height:1.6}
  .related a{display:inline-block;margin:0 8px 8px 0;padding:8px 13px;border:1px solid var(--border);border-radius:999px;font-size:13px;text-decoration:none;color:var(--text);background:var(--surface)}
  .related a:hover{border-color:var(--signal)}
  .hub-group{margin-bottom:30px}
  footer{padding:30px 0;font-size:13px;color:var(--muted);text-align:center;border-top:1px solid var(--border)}
  footer a{color:var(--muted);text-decoration:none;margin:0 8px}
  @media(max-width:560px){.item{flex-wrap:wrap}.it-side{text-align:left;width:100%}}
`;

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'">`;
const VISIT_SCRIPT = `<script>
window.addEventListener('load',function(){setTimeout(function(){
  var payload=JSON.stringify({path:location.pathname,ref:(function(){try{return new URL(document.referrer).hostname}catch(e){return ''}})(),utm:new URLSearchParams(location.search).get('utm_source')||''});
  try{if(navigator.sendBeacon){navigator.sendBeacon('/api/visit',new Blob([payload],{type:'application/json'}))}else{fetch('/api/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true}).catch(function(){})}}catch(e){}
},800)});
</script>`;

function layout({ title, description, canonical, jsonLd, body, frontendUrl }) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${CSP_META}
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Makulbul">
<meta property="og:locale" content="tr_TR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${frontendUrl}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0a0a0e">
${FAVICON_LINK}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
<style>${PAGE_STYLE}${GUIDE_STYLE}</style>
</head>
<body>
${renderNav(frontendUrl)}
<main class="wrap">
${body}
</main>
<footer>
  <a href="${frontendUrl}/index.html">Ana Sayfa</a> ·
  <a href="${frontendUrl}/en-iyi">Rehberler</a> ·
  <a href="${frontendUrl}/hakkimizda">Hakkımızda</a> ·
  <a href="${frontendUrl}/iletisim">İletişim</a> ·
  <a href="${frontendUrl}/gizlilik-politikasi.html">Gizlilik</a>
</footer>
${VISIT_SCRIPT}
</body>
</html>`;
}

function specLine(e) {
  const s = e.specs; const bits = [];
  if (e.category === 'laptop') {
    if (s.cpu) bits.push(s.cpu);
    if (s.gpu) bits.push(s.gpu);
    if (num(s.ram_gb)) bits.push(`${s.ram_gb} GB RAM`);
    if (num(s.storage_gb)) bits.push(`${formatGb(s.storage_gb)} SSD`);
    if (num(s.screen_inch)) bits.push(`${s.screen_inch}" ekran`);
    if (num(s.weight_g)) bits.push(`${(s.weight_g / 1000).toFixed(2).replace('.', ',')} kg`);
  } else {
    if (s.chip) bits.push(s.chip);
    if (num(s.ram_gb)) bits.push(`${s.ram_gb} GB RAM`);
    if (num(s.storage_gb)) bits.push(formatGb(s.storage_gb));
    if (num(s.screen_inch)) bits.push(`${s.screen_inch}" ekran`);
    if (num(s.battery_mah)) bits.push(`${tl(s.battery_mah)} mAh`);
    if (num(s.main_camera_mp)) bits.push(`${s.main_camera_mp} MP kamera`);
    if (s.has_nfc) bits.push('NFC');
  }
  return bits.join(' · ');
}

function renderGuidePage(page, { pages, frontendUrl, now = new Date(), lastChecked }) {
  const url = `${frontendUrl}/en-iyi/${page.slug}`;
  const monthYear = `${MONTHS_TR[now.getMonth()]} ${now.getFullYear()}`;
  const listed = page.items.slice(0, MAX_LISTED);
  const cheapest = page.items.reduce((a, b) => (a.price <= b.price ? a : b));
  const strongest = page.items.reduce((a, b) => (a.rank >= b.rank ? a : b));
  const isLaptop = page.category === 'laptop';
  const nounSingular = isLaptop ? 'laptop' : 'telefon';
  const scope = page.kind === 'budget'
    ? `fiyatı ${tl(page.budget)} TL'nin altında olan${page.blurb ? ' ' + page.blurb : ''}`
    : (page.blurb || '');
  const title = `${page.h1} (${monthYear}) | Makulbul`;
  const description = `Şu an stokta olan ${page.count} ${page.unit || nounSingular} karşılaştırıldı. En uygun fiyat ${tl(cheapest.price)} TL'den başlıyor. ${page.kind === 'brand' ? 'En uygun fiyattan başlayarak sıralı liste' : 'Donanım performansına göre sıralı liste'}, güncel fiyatlar ve satıcılar.`;

  const isBrand = page.kind === 'brand';
  const criteriaText = isBrand
    ? 'Bu listede modeller <strong>en uygun fiyattan başlayarak</strong> sıralanır. Fiyat, stokta olan en ucuz satıcı teklifidir.'
    : isLaptop
    ? 'Sıralama, işlemci ve ekran kartı performansı (ağırlıklı olarak) ile RAM ve depolama miktarından hesaplanan bir <strong>donanım puanına</strong> göre yapılır. Puan bilinen performans verilerine dayanan göreceli bir değerdir; kesin bir test sonucu değildir.'
    : 'Sıralama, işlemci performansı, RAM, batarya kapasitesi ve NFC desteğinden hesaplanan bir <strong>donanım puanına</strong> göre yapılır. Puan göreceli bir değerdir; kamera kalitesi gibi öznel unsurları içermez.';

  const items = listed.map((e, i) => `
  <div class="item${i === 0 ? ' top' : ''}">
    <div class="rk">${i + 1}</div>
    <div class="it-body">
      ${i === 0 && page.kind !== 'brand' ? '<span class="badge g">Öne çıkan</span>' : ''}${e.id === cheapest.id ? '<span class="badge">En uygun fiyat</span>' : ''}
      <a class="it-name" href="${frontendUrl}/urun/${e.id}/${slugify(e.name)}">${esc(displayModelName(e.name))}</a>
      <p class="it-specs">${esc(specLine(e))}</p>
    </div>
    <div class="it-side">
      <div class="it-price">${fmtTL(e.price)}</div>
      <div class="it-sub">${esc(e.seller)} · ${e.sellerCount} satıcı</div>
      <a class="it-btn" href="${frontendUrl}/urun/${e.id}/${slugify(e.name)}">Fiyatları gör</a>
    </div>
  </div>`).join('');

  const related = pages.filter(p => p.slug !== page.slug && p.category === page.category && (p.kind !== 'brand' || page.kind === 'brand')).slice(0, 8);
  const lastCheckedText = lastChecked ? `${lastChecked.getDate()} ${MONTHS_TR[lastChecked.getMonth()]} ${lastChecked.getFullYear()}` : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Makulbul', item: frontendUrl + '/' },
        { '@type': 'ListItem', position: 2, name: 'Rehberler', item: frontendUrl + '/en-iyi' },
        { '@type': 'ListItem', position: 3, name: page.h1, item: url }] },
      { '@type': 'ItemList', name: page.h1, numberOfItems: listed.length,
        itemListElement: listed.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: displayModelName(e.name), url: `${frontendUrl}/urun/${e.id}/${slugify(e.name)}` })) },
    ],
  };

  const body = `
  <a class="back-link" href="${frontendUrl}/en-iyi">← Tüm rehberler</a>
  <h1>${esc(page.h1)}</h1>
  <p class="lead">${isBrand
    ? `Şu an stokta olan ${page.count} ${esc(page.unit)} modelini en uygun fiyattan başlayarak listeledik. En uygun fiyat <strong>${esc(displayModelName(cheapest.name))}</strong> ile ${fmtTL(cheapest.price)}.`
    : `Şu an stokta olan ${page.count} ${esc(page.unit || nounSingular)} arasından${scope ? ' <strong>' + esc(scope) + '</strong>' : ''} modelleri donanım performansına göre sıraladık. ${page.count > 1 ? `En uygun fiyat <strong>${esc(displayModelName(cheapest.name))}</strong> ile ${fmtTL(cheapest.price)}; en yüksek donanım puanı <strong>${esc(displayModelName(strongest.name))}</strong> modelinde (${fmtTL(strongest.price)}).` : ''}`}</p>
  <p class="updated">${monthYear} itibarıyla${lastCheckedText ? ` · son fiyat kontrolü: ${lastCheckedText}` : ''} · ilk ${listed.length} model gösteriliyor</p>
  ${items}
  <div class="note"><strong>Nasıl sıraladık?</strong> ${criteriaText} Fiyatlar satıcı sitelerinden derlenir ve anlık değildir; satın almadan önce satıcının sayfasında teyit edin. Makulbul ürünleri satmaz; bazı bağlantılar iştirak (affiliate) bağlantısı olabilir ve sıralamayı etkilemez.</div>
  ${related.length ? `<section class="related"><h2>Diğer rehberler</h2>${related.map(p => `<a href="${frontendUrl}/en-iyi/${p.slug}">${esc(p.short ? p.short.charAt(0).toLocaleUpperCase('tr-TR') + p.short.slice(1) : p.h1)}</a>`).join('')}</section>` : ''}
  <p class="muted"><a href="${frontendUrl}/index.html${isLaptop ? '?cat=laptop' : ''}#catalog" style="color:var(--signal)">Yapay zeka ile kendi ihtiyacına göre ara →</a></p>`;

  return layout({ title, description, canonical: url, jsonLd, body, frontendUrl });
}

function renderHubPage(pages, { frontendUrl }) {
  const groups = [
    ['telefon', 'Telefon rehberleri'], ['laptop', 'Laptop rehberleri'],
  ];
  const body = `
  <h1>Alışveriş Rehberleri</h1>
  <p class="lead">Bütçene, kullanım amacına veya markaya göre hazırlanmış, güncel stok ve fiyat verisinden otomatik oluşan listeler. Her listede sıralama ölçütü açıkça yazılıdır.</p>
  ${groups.map(([cat, label]) => {
    const list = pages.filter(p => p.category === cat);
    return list.length ? `<section class="hub-group related"><h2>${label}</h2>${list.map(p => `<a href="${frontendUrl}/en-iyi/${p.slug}">${esc(p.h1)} <span style="color:var(--muted)">(${p.count})</span></a>`).join('')}</section>` : '';
  }).join('')}`;
  return layout({
    title: 'Alışveriş Rehberleri: Bütçeye Göre En İyi Telefon ve Laptoplar | Makulbul',
    description: 'Bütçene göre en iyi telefon ve laptop rehberleri. Stokta olan ürünler donanım performansına göre sıralanır, fiyatlar satıcılar arasında karşılaştırılır.',
    canonical: `${frontendUrl}/en-iyi`, jsonLd: null, body, frontendUrl,
  });
}

module.exports = { buildCatalog, renderGuidePage, renderHubPage };
