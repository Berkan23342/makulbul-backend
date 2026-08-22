// chip-tiers.js — Çip (işlemci) modellerine göre donanım gücü puanı.
// TAMAMEN ÜCRETSİZ — herhangi bir API çağrısı yapmaz.
//
// KRİTER: SINGLE-CORE (tek çekirdek) performans — günlük kullanımda
// uygulama açma hızı, arayüz akıcılığı ve çoğu gerçek dünya senaryosunu
// en iyi yansıtan metrik budur (multi-core ise ağır çoklu görev/render
// gibi daha nadir senaryolarda öne çıkar). Bu tercih kullanıcıyla
// birlikte bilinçli olarak yapıldı.
//
// Puanlar Geekbench 6 single-core sonuçlarına (Notebookcheck, Temmuz
// 2026) dayanır. Bu metrikte Apple'ın çipleri genelde önde ya da başa
// baştır — Snapdragon 8 Elite Gen 5 "single-core performansı Apple A19
// Pro ile başa baş" (Notebookcheck), bazı testlerde A19 Pro açıkça önde.
//
// NÜANS: Multi-core (çoklu görev/ağır oyun) performansında sıralama
// TERSİNE döner — orada Snapdragon/Exynos, Apple'ın önüne geçer. Yani bu
// tablo "günlük hız/akıcılık" tanımına göre optimize edilmiştir, mutlak
// bir gerçek değildir.

const CHIP_TIERS = {
  // Apple — single-core'da genelde lider ya da başa baş
  'a19 pro': 100,
  'a19': 92,
  'a18 pro': 88,
  'a18': 84,
  'a17 pro': 80,

  // Samsung / Qualcomm (Galaxy serisi) — single-core'da Apple'a çok yakın
  // ama net olarak önde değil
  'snapdragon 8 elite gen 5 for galaxy': 98,
  'snapdragon 8 elite gen 5': 97,
  'exynos 2600': 85,
  'snapdragon 8 gen 3': 75,
  'exynos 1480': 38,

  // MediaTek (Xiaomi/Redmi/POCO tarafında yaygın) — single-core'da
  // genelde Apple/Snapdragon'ın belirgin gerisinde
  'dimensity 9400': 80,
  'dimensity 8400 ultra': 55,
  'dimensity 8300 ultra': 50,
  'dimensity 7400-ultra': 42,
  'dimensity 7300': 40,
  'helio g99-ultra': 25,
};

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
  if (key.includes('pro') && key.includes('a1')) return 85;
  if (key.includes('gen 3') || key.includes('gen3')) return 78;

  return 40; // tanınmayan çip için nötr/ortalama puan
}

module.exports = { scoreChip, CHIP_TIERS };
