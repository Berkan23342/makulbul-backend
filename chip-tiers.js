// chip-tiers.js — Çip (işlemci) modellerine göre donanım gücü puanı.
// TAMAMEN ÜCRETSİZ — herhangi bir API çağrısı yapmaz.
//
// KRİTER: SINGLE-CORE (tek çekirdek) performans — günlük kullanımda
// uygulama açma hızı, arayüz akıcılığı ve çoğu gerçek dünya senaryosunu
// en iyi yansıtan metrik budur (multi-core ise ağır çoklu görev/render
// gibi daha nadir senaryolarda öne çıkar). Bu tercih kullanıcıyla
// birlikte bilinçli olarak yapıldı.
//
// NÜANS: Multi-core (çoklu görev/ağır oyun) performansında sıralama
// TERSİNE dönebilir — orada Snapdragon/Exynos bazı senaryolarda Apple'ın
// önüne geçer. Yani bu tablo "günlük hız/akıcılık" tanımına göre optimize
// edilmiştir, mutlak bir gerçek değildir.

// KATALOGDAKİ HER ÇİP İÇİN GERÇEK, ÖLÇÜLMÜŞ Geekbench 6 single-core puanı
// (GSMArena / Notebookcheck / Tom's Hardware / WCCFTech / nanoreview,
// Eylül 2026 itibarıyla derlendi). ESKİDEN bu tablo elle tahmin edilmiş
// 0-100 aralığında sayılardı ("A19 Pro'ya 100 verelim, A18 Pro'ya 88..."
// gibi) — artık gerçek ölçülmüş ham puanlar burada duruyor, 0-100
// normalizasyonu aşağıda otomatik ve tutarlı bir formülle yapılıyor. Bu
// sayede yeni bir çip eklendiğinde sadece gerçek Geekbench puanını
// girmek yeterli, elle "nereye denk gelir" tahmini yapmaya gerek yok.
const GEEKBENCH6_SINGLE_CORE = {
  // Apple
  'a15 bionic': 2473,
  'a16 bionic': 2631,
  'a17 pro': 2890,
  'a18': 3325,
  'a18 pro': 3500,
  'a19': 3608,
  'a19 pro': 3895,

  // Samsung / Qualcomm (Galaxy serisi)
  'snapdragon 8 elite gen 5 for galaxy': 3670,
  'snapdragon 8 elite gen 5': 3670,
  'snapdragon 8 elite for galaxy': 3150, // Gen 5'in bir önceki nesli (Z Fold7/Galaxy S25 ailesi)
  'snapdragon 8 elite': 3230, // "for Galaxy" binmesi olmayan standart sürüm (POCO F7 Ultra vb.)
  'exynos 2600': 3105,
  'exynos 2500': 2360, // Z Flip7
  'exynos 2400': 2067, // Galaxy S25 FE / Z Flip7 FE
  'exynos 1580': 1360, // Galaxy A56
  'snapdragon 6 gen 3': 1001, // Galaxy A36 / Redmi Note 15 5G (giriş-orta segment)

  // MediaTek (Xiaomi/Redmi/POCO tarafında yaygın)
  'dimensity 9400+': 2874, // Xiaomi 15T Pro
  'dimensity 9400': 2550, // "+" eki olmayan taban sürüm, biraz daha düşük
  'dimensity 8400 ultra': 1579, // Xiaomi 15T
  'dimensity 7400-ultra': 1042, // Redmi Note 15 Pro 5G

  // Snapdragon (Xiaomi/POCO orta-üst segment)
  'snapdragon 8s gen 4': 2041, // POCO F7
  'snapdragon 8 gen 3': 2260, // OnePlus 13R'de kullanılan bir önceki nesil amiral çip

  // Google (Pixel serisi) — Tensor, AI/ML hızlandırmaya odaklı tasarlandığı
  // için ham CPU (Geekbench single-core) puanı, aynı segmentteki Snapdragon/
  // Apple çiplerinin gerisinde kalır; bu tabloda da bilinçli olarak öyle
  // yansıyor.
  'tensor g5': 2150, // Pixel 10 / Pixel 10 Pro
};

// Katalogda ŞU AN hiçbir ürün kullanmıyor ama fallback eşleştirmesi
// (scoreChip'in alt kısmı) ileride karşılaşılabilecek başka çipler için
// bunlara da bakabilsin diye tutuluyor — GERÇEK ölçüm değil, kabaca
// bilinen nesil/segment karşılaştırmasına dayalı tahmini değerlerdir.
const ESTIMATED_LEGACY = {
  'exynos 1480': 1300,
  'dimensity 8300 ultra': 1500,
  'dimensity 7300': 1000,
  'helio g99-ultra': 650,
};

// Ham Geekbench puanını 0-100 aralığına indirger. Sınırlar (1000-4000)
// katalogdaki en zayıf (Dimensity 7400-Ultra, ~1042) ve en güçlü (A19
// Pro, 3895) gerçek puanları kapsayacak, biraz payla seçildi — yeni,
// daha güçlü bir çip eklendiğinde üst sınırı güncellemek yeterli.
const MIN_RAW = 1000;
const MAX_RAW = 4000;
function normalizeToTier(raw) {
  return Math.max(0, Math.min(100, Math.round(((raw - MIN_RAW) / (MAX_RAW - MIN_RAW)) * 100)));
}

const CHIP_TIERS = Object.fromEntries(
  Object.entries({ ...ESTIMATED_LEGACY, ...GEEKBENCH6_SINGLE_CORE })
    .map(([chip, raw]) => [chip, normalizeToTier(raw)])
);

// Bilinen tam eşleşme yoksa, isimdeki anahtar kelimelere göre kaba bir
// tahmin yapar (yeni/bilinmeyen çipler için güvenli bir varsayılan).
function scoreChip(chipName) {
  if (!chipName) return 40;
  const key = chipName.toLowerCase().trim();

  if (CHIP_TIERS[key] != null) return CHIP_TIERS[key];

  for (const [known, score] of Object.entries(CHIP_TIERS)) {
    if (key.includes(known)) return score;
  }

  if (key.includes('elite')) return 95;
  if (key.includes('ultra') && key.includes('dimensity')) return 70;
  // Tabloda henüz olmayan bilinmeyen bir Apple "Axx" nesli (örn.
  // ileride çıkacak bir A20/A21).
  if (/\ba\d{2}\b/.test(key)) return key.includes('pro') ? 90 : 82;
  if (key.includes('gen 3') || key.includes('gen3')) return 78;

  return 40; // tanınmayan çip için nötr/ortalama puan
}

module.exports = { scoreChip, CHIP_TIERS, GEEKBENCH6_SINGLE_CORE };
