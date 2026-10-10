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
    // "g" bayrağı olmadan sadece İLK eşleşme temizleniyordu — telefon
    // adlarında ("iPhone 13 128GB") tek bir GB/TB token'ı olduğu için
    // bu hiç fark etmiyordu, ama laptop adları HER ZAMAN "16GB/512GB"
    // gibi İKİ token içeriyor (RAM+depolama) — "g" olmadan sadece ilki
    // ("16GB") siliniyor, "/512GB" başlıkta çirkin bir kalıntı olarak
    // kalıyordu.
    .replace(/\s*\b\d+\s?(GB|TB)\b/gi, '')
    // Laptop adlarındaki "16GB/512GB" kalıbında "/" SADECE bu iki
    // token'ı ayırmak için var — ikisi de yukarıda silinince geriye
    // anlamsız, tek başına kalan bir "/" kalıyordu (ör. "AL15-71P/").
    .replace(/\//g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function fmtTL(n) {
  return Number(n).toLocaleString('tr-TR') + ' TL';
}

// KRİTİK: public/index.html'deki (client-side kart/varyant render'ı)
// AYNI kural — stokta olan teklifleri önceliklendir, hiçbiri stokta
// değilse yine de bir şey göstermek (dürüstçe "stokta yok" etiketiyle)
// boş bırakmaktan iyi olduğu için tüm tekliflere geri düş. Bu sayfa
// (SSR /urun/:id, SEO için sonradan eklendi) bu deseni HİÇ uygulamıyordu
// — en ucuz teklif tesadüfen stokta değilse bile "en uygun fiyat" diye
// üstte gösteriliyor, Satıcıya Git linki de o tükenmiş teklife gidiyor,
// hatta Google'a gönderilen JSON-LD "InStock" diye sabit yazıyordu.
function inStockFirst(offers) {
  const inStock = offers.filter(o => o.in_stock !== false);
  return inStock.length ? inStock : offers;
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

// Laptop kategorisinin attribute_schema'sı (bkz. add-laptop-category.js)
// telefonlarla neredeyse hiç örtüşmüyor (CPU/GPU/OS var, kamera/pil mAh/
// NFC yok) — bu yüzden ayrı bir tablo, category alanına göre seçiliyor
// (bkz. renderProductPage).
const LAPTOP_SPEC_LABELS = [
  ['cpu', 'İşlemci', v => v],
  ['cpu_cores', 'İşlemci Çekirdek Sayısı', v => v],
  ['ram_gb', 'RAM', v => `${v} GB`],
  ['storage_gb', 'Depolama', v => (v >= 1024 && v % 1024 === 0) ? `${v / 1024} TB` : `${v} GB`],
  ['storage_type', 'Depolama Türü', v => v],
  ['gpu', 'Ekran Kartı', v => v],
  ['screen_inch', 'Ekran Boyutu', v => `${v}"`],
  ['screen_resolution', 'Ekran Çözünürlüğü', v => v],
  ['refresh_rate_hz', 'Ekran Yenileme Hızı', v => `${v}Hz`],
  ['has_touchscreen', 'Dokunmatik Ekran', v => (v ? 'Var' : 'Yok')],
  ['battery_wh', 'Batarya Kapasitesi', v => `${v} Wh`],
  ['weight_g', 'Ağırlık', v => (v >= 1000 ? `${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg` : `${v} g`)],
  ['has_backlit_keyboard', 'Aydınlatmalı Klavye', v => (v ? 'Var' : 'Yok')],
  ['has_fingerprint', 'Parmak İzi Okuyucu', v => (v ? 'Var' : 'Yok')],
  ['webcam_mp', 'Webcam', v => `${v} MP`],
  ['ports', 'Bağlantı Noktaları', v => Array.isArray(v) ? v.join(', ') : v],
  ['os', 'İşletim Sistemi', v => v],
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
  .offer-row-out{opacity:.55}
  .stock-badge{font-size:9.5px;font-weight:700;color:#ff6b6b;text-transform:uppercase;letter-spacing:.03em}
  section{margin-bottom:36px}
  section h2{font-size:18px;margin:0 0 16px}
  table.spec-table{width:100%;border-collapse:collapse;font-size:13.5px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
  table.spec-table th,table.spec-table td{text-align:left;padding:11px 16px;border-bottom:1px solid var(--border)}
  table.spec-table tr:last-child th,table.spec-table tr:last-child td{border-bottom:none}
  table.spec-table th{color:var(--muted);font-weight:500;width:46%}
  table.spec-table td{font-family:'IBM Plex Mono',monospace}
  .price-history-chart{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px 16px 10px}
  .price-history-chart svg{width:100%;height:auto;display:block;overflow:visible}
  .ph-line{fill:none;stroke:var(--signal);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
  .ph-area{fill:var(--signal-soft);opacity:.6}
  .ph-axis-label{font-size:10.5px;fill:var(--muted);font-family:'IBM Plex Mono',monospace}
  .ph-grid{stroke:var(--border);stroke-width:1}
  .ph-point{fill:var(--bg);stroke:var(--signal);stroke-width:2}
  .ph-summary{display:flex;gap:22px;margin-top:14px;flex-wrap:wrap}
  .ph-summary-item{font-size:12px;color:var(--muted)}
  .ph-summary-item b{display:block;font-size:15px;color:var(--text);font-family:'IBM Plex Mono',monospace;font-weight:600;margin-top:2px}
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

// Laptop için basit ekran+taban siluet — telefon ikonuyla karıştırılmasın.
const THUMB_SVG_LAPTOP = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <rect class="thumb-body" x="12" y="10" width="40" height="28" rx="2.5"/>
  <rect class="thumb-screen" x="15" y="13" width="34" height="22" rx="1"/>
  <path class="thumb-detail" d="M6 46h52l4 6H2z"/>
</svg>`;

// index.html ile aynı favicon — /urun/:id sayfalarında hiç yoktu.
// Google, arama sonuçlarındaki site simgesi için data: URI değil gerçek
// bir dosya URL'si istiyor (bkz. public/favicon.svg, public/favicon.ico).
const FAVICON_LINK = `<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`;

function renderNav(frontendUrl) {
  return `<header class="nav"><div class="wrap">
    <a href="${frontendUrl}/index.html" class="logo"><span class="dot"></span>Makulbul</a>
  </div></header>`;
}

function renderNotFoundPage(frontendUrl, opts = {}) {
  const title = opts.title || 'Ürün bulunamadı';
  const message = opts.message || 'Bu ürün kaldırılmış olabilir.';
  return `<!doctype html>
<html lang="tr"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'">
<title>${title} — Makulbul</title>
<meta name="robots" content="noindex">
${FAVICON_LINK}
<style>${PAGE_STYLE}</style>
</head><body>
${renderNav(frontendUrl)}
<div class="wrap not-found">
  <h1>${title}</h1>
  <p class="muted">${message}</p>
  <a class="back-link" href="${frontendUrl}/index.html#catalog">← Tüm modellere dön</a>
</div>
</body></html>`;
}

function renderProductPage(product, { backendUrl, frontendUrl, minPrice30d }) {
  const isLaptop = product.category === 'laptop';
  const activeSpecLabels = isLaptop ? LAPTOP_SPEC_LABELS : SPEC_LABELS;
  const specs = product.specs || {};
  const offers = [...(product.offers || [])].sort((a, b) => a.price - b.price);
  // inStockFirst: en ucuz teklif TESADÜFEN stokta değilse, hero fiyat/
  // Satıcıya Git linki/JSON-LD onun yerine bir sonraki GERÇEKTEN stoktaki
  // teklife düşsün (bkz. yukarıdaki fonksiyonun tam açıklaması).
  const best = inStockFirst(offers).sort((a, b) => a.price - b.price)[0];
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
  // Varyantlar da AYNI şekilde stok-öncelikli sıralanıyor — aksi halde
  // "en ucuz varyant" tesadüfen tükenmiş bir teklife sahip olabilir ve
  // sayfa ilk açılışta o varyantı (ve onun tükenmiş fiyatını) seçili
  // gösterirdi.
  const variants = [...variantGroups.values()]
    .map(v => ({ ...v, offers: v.offers.sort((a, b) => a.price - b.price) }))
    .sort((a, b) => inStockFirst(a.offers)[0].price - inStockFirst(b.offers)[0].price);
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
  const specRows = activeSpecLabels
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
    // public/index.html'deki (client-side teklif satırı render'ı) AYNI
    // "Stokta yok" etiketi — bu sayfa in_stock'u ÇEKİYORDU ama hiç
    // GÖSTERMİYORDU, kullanıcı tükenmiş bir teklifi normal bir teklifle
    // ayırt edemiyordu.
    const outOfStock = o.in_stock === false;
    return `
    <div class="offer-row${outOfStock ? ' offer-row-out' : ''}">
      <div class="offer-row-top">
        <div class="offer-row-info">
          <span class="offer-seller">${esc(o.seller_name)}${tag}${outOfStock ? ' <span class="stock-badge">Stokta yok</span>' : ''}</span>
          <span class="offer-price">${fmtTL(o.price)}</span>
        </div>
        <a class="offer-buy" href="${esc(backendUrl)}/satici-git/${esc(o.id)}" target="_blank" rel="nofollow sponsored noopener">Satıcıya Git <span class="ad-tag">Reklam</span></a>
      </div>
    </div>`;
  }
  // İlk yüklemede sadece VARSAYILAN (en ucuz) varyantın teklifleri
  // gösteriliyor — kalan varyantlar seçici ile client-side filtreleniyor
  // (tüm teklif verisi zaten sayfaya gömülü, yeni bir istek gerekmiyor).
  const initialOfferList = hasVariantPicker ? defaultVariant.offers : offers;
  const offerRows = initialOfferList.map(offerRowHTML).join('');

  // Google, "Product" yapılandırılmış verisi için "offers", "review" veya
  // "aggregateRating" alanlarından en az birini ZORUNLU tutuyor (Search
  // Console: "Ürün snippet'leri" > "'offers', 'review' veya
  // 'aggregateRating' belirtilmelidir"). Elimizde review/rating verisi
  // yok; teklifi (satıcısı) olmayan bir ürün için de verecek bir fiyat
  // yok. Bu yüzden SADECE en az bir teklif varsa Product JSON-LD
  // yayınlıyoruz — teklifsiz ürünlerde hiç yapılandırılmış veri çıkmıyor
  // (bu sayfaların Google Alışveriş'e sunacağı bir şey zaten yok).
  const jsonLd = best ? {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.canonical_name,
    brand: { '@type': 'Brand', name: product.brand },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'TRY',
      lowPrice: Number(best.price),
      highPrice: Number(offers[offers.length - 1].price),
      offerCount: offers.length,
      // KRİTİK: sabit 'InStock' YERİNE best'in GERÇEK durumu — best artık
      // inStockFirst() ile seçildiği için normalde her zaman gerçekten
      // stokta, ama HİÇBİR teklif stokta değilse (inStockFirst tüm
      // tekliflere geri düştüğünde) Google'a da dürüstçe OutOfStock
      // bildirilmeli — aksi halde Google Alışveriş'e "stokta" diye
      // aslında satılamayan bir ürün gönderilmiş olurdu.
      availability: best.in_stock === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
    },
  } : null;

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Hostinger'ın CDN/proxy katmanı server.js'in gönderdiği
     Content-Security-Policy HEADER'ını eziyor (sadece
     upgrade-insecure-requests kalıyor) — HTML gövdesinin bir parçası
     olan bu META etiketi ise ezilmiyor, o yüzden CSP burada AYRICA
     tanımlanıyor (index.html'deki meta tag'iyle aynı). -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'">
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
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
<style>${PAGE_STYLE}</style>
</head>
<body>
${renderNav(frontendUrl)}
<main class="wrap">
  <a class="back-link" href="${frontendUrl}/index.html${isLaptop ? '?cat=laptop' : ''}#catalog">← Tüm ${isLaptop ? 'laptoplara' : 'modellere'} dön</a>

  <div class="product-hero">
    <div class="hero-thumb">${isLaptop ? THUMB_SVG_LAPTOP : THUMB_SVG}</div>
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
    <div id="price-history">
      <p class="muted">Fiyat geçmişi yükleniyor…</p>
    </div>
  </section>
</main>

<script>
(function(){
  var API_BASE = ${JSON.stringify(backendUrl)};
  var PRODUCT_ID = ${JSON.stringify(product.id)};

  // Fiyat geçmişi grafiği — /api/products/:id/price-history ENDPOINT'İ
  // ZATEN VARDI ve doğru veri döndürüyordu, ama bu sayfa onu hiç
  // çağırmıyordu; "Fiyat geçmişi" bölümü sabit "Yakında" yazan bir
  // yer tutucuydu. Bağımlılık eklememek için (bkz. dosya başındaki
  // "şablon motoru yok" felsefesi) küçük, elle yazılmış bir SVG çizgi
  // grafiği — harici bir kütüphane gerekmiyor.
  (function loadPriceHistory(){
    var container = document.getElementById('price-history');
    if (!container) return;
    fetch(API_BASE + '/api/products/' + encodeURIComponent(PRODUCT_ID) + '/price-history?days=90')
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(rows){
        if (!Array.isArray(rows) || rows.length < 2) {
          container.innerHTML = '<p class="muted">Bu ürün için henüz yeterli fiyat geçmişi birikmedi.</p>';
          return;
        }
        var points = rows.map(function(r){ return { date: new Date(r.date), price: Number(r.price) }; });
        var prices = points.map(function(p){ return p.price; });
        var minPrice = Math.min.apply(null, prices);
        var maxPrice = Math.max.apply(null, prices);
        // Fiyat tamamen sabitse (tek bir değer) grafik düz bir çizgi olur —
        // bölme sıfıra düşmesin diye küçük bir yapay aralık veriyoruz.
        var priceRange = (maxPrice - minPrice) || Math.max(1, maxPrice * 0.05);
        var padTop = minPrice === maxPrice ? priceRange : priceRange * 0.12;
        var yMin = minPrice - padTop, yMax = maxPrice + padTop;

        var W = 640, H = 180, padL = 8, padR = 8, padT = 14, padB = 26;
        var plotW = W - padL - padR, plotH = H - padT - padB;
        var xAt = function(i){ return padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW); };
        var yAt = function(p){ return padT + plotH - ((p - yMin) / (yMax - yMin)) * plotH; };

        var linePts = points.map(function(p, i){ return xAt(i).toFixed(1) + ',' + yAt(p.price).toFixed(1); }).join(' ');
        var areaPts = linePts + ' ' + xAt(points.length - 1).toFixed(1) + ',' + (padT + plotH) + ' ' + xAt(0).toFixed(1) + ',' + (padT + plotH);

        var fmtDate = function(d){ return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }); };
        var fmtPrice = function(n){ return Number(n).toLocaleString('tr-TR') + ' TL'; };

        // Sadece ucuz/pahalı uç noktalara (min/max fiyata sahip günlere)
        // bir nokta işaretçisi koyuyoruz — her güne koymak (90 gün olabilir)
        // grafiği görsel olarak boğardı.
        var minIdx = prices.indexOf(minPrice), maxIdx = prices.indexOf(maxPrice);
        var markerIdx = [0, points.length - 1, minIdx, maxIdx].filter(function(v, i, arr){ return arr.indexOf(v) === i; });
        var markers = markerIdx.map(function(i){
          return '<circle class="ph-point" cx="' + xAt(i).toFixed(1) + '" cy="' + yAt(points[i].price).toFixed(1) + '" r="3.2"></circle>';
        }).join('');

        var svg = '' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Son ' + points.length + ' günün fiyat geçmişi grafiği">' +
          '<line class="ph-grid" x1="' + padL + '" y1="' + padT + '" x2="' + (W - padR) + '" y2="' + padT + '"></line>' +
          '<line class="ph-grid" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (W - padR) + '" y2="' + (padT + plotH) + '"></line>' +
          '<polygon class="ph-area" points="' + areaPts + '"></polygon>' +
          '<polyline class="ph-line" points="' + linePts + '"></polyline>' +
          markers +
          '<text class="ph-axis-label" x="' + padL + '" y="' + (H - 6) + '">' + fmtDate(points[0].date) + '</text>' +
          '<text class="ph-axis-label" x="' + (W - padR) + '" y="' + (H - 6) + '" text-anchor="end">' + fmtDate(points[points.length - 1].date) + '</text>' +
          '</svg>';

        var latest = points[points.length - 1].price;
        var summary = '' +
          '<div class="ph-summary">' +
          '<div class="ph-summary-item">Bu dönemin en düşüğü<b>' + fmtPrice(minPrice) + '</b></div>' +
          '<div class="ph-summary-item">Bu dönemin en yükseği<b>' + fmtPrice(maxPrice) + '</b></div>' +
          '<div class="ph-summary-item">Güncel<b>' + fmtPrice(latest) + '</b></div>' +
          '</div>';

        container.innerHTML = '<div class="price-history-chart">' + svg + summary + '</div>';
      })
      .catch(function(){
        container.innerHTML = '<p class="muted">Fiyat geçmişi şu an yüklenemedi.</p>';
      });
  })();

  // Birinci taraf, kimliksiz sayfa görüntüleme sayacı — index.html'deki
  // aynı notla aynı sebepten (bkz. orada): sayfa yüklenir yüklenmez,
  // gecikmesiz ve adında "track" geçen bir istek canlıda 503 ile
  // engelleniyordu. window.load + kısa gecikme + sendBeacon bunu çözüyor.
  window.addEventListener('load', function(){
    setTimeout(function(){
      var payload = JSON.stringify({ path: location.pathname });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(API_BASE + '/api/visit', new Blob([payload], { type: 'application/json' }));
        } else {
          fetch(API_BASE + '/api/visit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: payload, keepalive: true }).catch(function(){});
        }
      } catch (e) {}
    }, 800);
  });

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
        var outOfStock = o.in_stock === false;
        return '<div class="offer-row' + (outOfStock ? ' offer-row-out' : '') + '"><div class="offer-row-top"><div class="offer-row-info">' +
          '<span class="offer-seller">' + escHtml(o.seller_name) + tag + (outOfStock ? ' <span class="stock-badge">Stokta yok</span>' : '') + '</span>' +
          '<span class="offer-price">' + fmt(o.price) + '</span></div>' +
          '<a class="offer-buy" href="' + API_BASE + '/satici-git/' + encodeURIComponent(o.id) + '" target="_blank" rel="nofollow sponsored noopener">Satıcıya Git <span class="ad-tag">Reklam</span></a></div>' +
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
    // Sunucu tarafındaki inStockFirst() ile AYNI mantık (bkz. product-page.js
    // başındaki tam açıklama) — varyant değiştirildiğinde de en ucuz
    // teklif tesadüfen stokta değilse ona düşülmesin.
    function inStockFirst(offerList){
      var inStock = offerList.filter(function(o){ return o.in_stock !== false; });
      return inStock.length ? inStock : offerList;
    }
    function selectVariant(gb, color){
      var match = variants.filter(function(v){ return v.storage_gb === gb && v.color === color; })[0] || variantsForStorage(gb)[0];
      if (!match) return;
      var best = inStockFirst(match.offers).slice().sort(function(a, b){ return a.price - b.price; })[0];
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
