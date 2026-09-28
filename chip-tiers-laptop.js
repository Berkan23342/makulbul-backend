// chip-tiers-laptop.js — Laptop CPU + GPU modellerine göre donanım gücü
// puanı. TAMAMEN ÜCRETSİZ — herhangi bir API çağrısı yapmaz.
//
// chip-tiers.js (telefon) ile AYNI felsefe (bilinen gerçek modeller için
// araştırılmış, göreceli puanlar; 0-100'e normalize) ama farklı KRİTER:
// telefonda "tek çekirdek/günlük akıcılık" seçilmişti, burada laptop
// CPU'su için ÇOK ÇEKİRDEKLİ (multi-core, Cinebench R23 tarzı) performans
// esas alınıyor — laptop kullanıcılarının "güçlü" dediğinde genelde
// kastettiği video render/derleme/çoklu görev senaryosu bu metrikle daha
// iyi örtüşüyor (günlük akıcılık farkı laptoplarda telefonlardaki kadar
// hissedilir değil, hepsi zaten yeterince hızlı).
//
// GPU AYRICA puanlanıyor çünkü laptop'ta (telefonun aksine) ayrı, çok
// güçlü bir ekran kartı olabilir — "oyun için güçlü laptop" sorgusunda
// CPU'dan çok GPU belirleyici. computeLaptopPowerScore() ikisini birlikte
// (GPU biraz daha ağırlıklı) harmanlıyor.
//
// NOT: Aynı GPU adının farklı TGP/watt sürümleri (ör. "RTX 5060 8GB
// (100W)" vs "(115W)") ve farklı VRAM/GDDR etiketleri BİLEREK aynı
// tier'a düşürülüyor — gerçek fark birkaç puanlık ince ayar, kaba
// sıralamayı değiştirmiyor. Yeni bir çip/GPU eklendiğinde buraya bir
// satır eklemek yeterli.

// Cinebench R23 çoklu çekirdek puanına YAKLAŞIK, kamu kaynaklı laptop
// inceleme sitelerinden (Notebookcheck vb.) derlenmiş göreceli değerler
// (Eylül 2026 itibarıyla). Anahtar: küçük harfe çevrilmiş, normalize
// edilmiş çip adı.
const CPU_MULTICORE_SCORE = {
  // Intel — U/H (verimlilik/orta) serisi
  'intel core 5 120u': 9000,
  'intel core 5 210h': 9500,
  'intel core i5-1334u': 8500,
  'intel core i7-1355u': 9000,
  'intel core ultra 5 125u': 9500,
  'intel core ultra 5 235u': 9500,
  'intel core ultra 7 165u': 10500,
  'intel core ultra 5 226v': 10000, // Lunar Lake — az çekirdek, yüksek verimlilik
  'intel core ultra 7 256v': 11000,
  'intel core ultra 7 258v': 11500,
  'intel core ultra 5 236v': 10500,
  'intel core i7-1165g7': 5500, // eski nesil (Tiger Lake)

  // Intel — H/HX (performans) serisi
  'intel core 7 240h': 13000,
  'intel core 7 250h': 13500,
  'intel core ultra 5 125h': 12500,
  'intel core ultra 5 225h': 13000,
  'intel core ultra 7': 15500, // marka/model belirtilmemiş genel "Ultra 7"
  'intel core ultra 7 155h': 15500,
  'intel core ultra 7 255h': 16500,
  'intel core ultra 9 185h': 17500,
  'intel core ultra 9 285h': 18500,
  'intel core i5-12450h': 11000,
  'intel core i5-13420h': 11500,
  'intel core i7-13620h': 14500,

  // Intel — HX (masaüstü sınıfı, gaming/workstation)
  'intel core i5-13450hx': 17000,
  'intel core i5-14500hx': 19000,
  'intel core i7-12650hx': 18000,
  'intel core i7-13650hx': 20000,
  'intel core i7-14650hx': 21000,
  'intel core i7-14700hx': 26000,
  'intel core ultra 7 255hx': 21000,
  'intel core ultra 9 275hx': 28000, // Intel'in en güçlü mobil çipi
  'intel core i9-14900hx': 31000, // Katalogdaki en güçlü Intel HX

  // AMD — U/HS (verimlilik/orta) serisi
  'amd ryzen 5 7520u': 7000,
  'amd ryzen 7 5825u': 9000,
  'amd ryzen 5 7535hs': 11000,
  'amd ryzen 5 8645hs': 12500,
  'amd ryzen 7 7435hs': 12000,
  'amd ryzen 7 7735hs': 13000,
  'amd ryzen ai 5 340': 10000,

  // AMD — Ryzen AI (H serisi, NPU'lu yeni nesil)
  'amd ryzen 7 170': 15000,
  'amd ryzen 7-170': 15000,
  'amd ryzen 7 250': 15500,
  'amd ryzen 7 260': 16000,
  'amd ryzen 7 ai 350': 15500,
  'amd ryzen ai 7 350': 15500,
  'amd ryzen ai 7 445': 16500,
  'amd ryzen ai 9 365': 19000,
  'amd ryzen ai 9 465': 20500,

  // AMD — HX (masaüstü sınıfı)
  'amd ryzen 7 8840hx': 19000,
  'amd ryzen 9 8940hx': 24000, // Katalogdaki en güçlü AMD HX

  // Apple Silicon (Cinebench R23'e YAKLAŞIK denk göreceli değer —
  // farklı mimari, gerçek "iş bitirme" hissi bu sırayla uyumlu)
  'apple m2': 9500,
  'apple m4': 14500,
  'apple m5': 16000,
  'apple m5 pro': 23000,
  'apple m5 pro (15 çekirdek cpu)': 23000,
  'apple m5 pro (18 çekirdek cpu)': 25000,

  // Qualcomm Snapdragon X (Windows on ARM — x86 emülasyon farkı gerçek
  // günlük performansı biraz düşürse de ham çoklu çekirdek gücü güçlü)
  'qualcomm snapdragon x elite': 13500,
  'qualcomm snapdragon x elite (12 çekirdek)': 13500,
  'qualcomm snapdragon x2 elite (18 çekirdek)': 19000,
};

// GPU'lar için 0-100 aralığında ELDEN göreceli puan (RTX 5080 tavan).
// Entegre grafikler (hiçbiri gerçek oyun/render gücü sunmadığı için)
// hepsi düşük bir bantta, dedicated NVIDIA GPU'lar çok daha yukarıda.
const GPU_SCORE = {
  // Entegre — Intel
  'intel uhd graphics (entegre)': 5,
  'intel uhd graphics (paylaşımlı)': 5,
  'intel graphics (entegre)': 6,
  'intel iris xe graphics (entegre)': 10,
  'intel arc graphics (entegre)': 15,
  'intel arc 140t graphics (entegre)': 18,

  // Entegre — AMD Radeon
  'amd radeon entegre': 9,
  'amd radeon 610m entegre': 8,
  'amd radeon 840m entegre': 11,
  'amd radeon 860m entegre': 14,

  // Entegre — Apple (kendi mimarisi içinde göreceli olarak güçlü)
  'apple m2 entegre gpu': 20,
  'apple m4 entegre gpu (10 çekirdek)': 28,
  'apple m5 entegre gpu (10 çekirdek)': 32,
  'apple m5 pro entegre gpu (16 çekirdek)': 42,
  'apple m5 pro entegre gpu (20 çekirdek)': 46,

  // Entegre — Qualcomm
  'qualcomm adreno (entegre)': 10,

  // Dedicated — NVIDIA GeForce RTX (mobil)
  'nvidia geforce rtx 3050': 35,
  'nvidia geforce rtx 4050': 45,
  'nvidia geforce rtx 5050': 52,
  'nvidia geforce rtx 5060': 62,
  'nvidia geforce rtx 5070': 75,
  'nvidia geforce rtx 5070 ti': 88,
  'nvidia geforce rtx 5080': 100,
};

// Bir çip/GPU adını normalize eder: küçük harfe çevirir, parantez içi
// watt/VRAM/GDDR gibi ince ayrıntıları (tier'ı değiştirmeyen) ATIYOR,
// böylece "RTX 5060 8GB (100W)" ile "RTX 5060 8GB GDDR7 (115W)" aynı
// anahtara düşüyor. Tablo eşleşmesi önce TAM normalize edilmiş adla,
// olmazsa en uzun ÖN EK eşleşmesiyle deneniyor (ör. "RTX 5070 Ti 12GB
// GDDR7" -> önce tam hâliyle bulunamaz, "rtx 5070 ti" ön eki bulunur).
function normalize(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\(\s*\d+\s*w\s*\)/g, '')
    .replace(/\(\s*\d+w\+\d+w\s*\)/g, '')
    .replace(/gddr\d+/g, '')
    .replace(/\d+\s?gb\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function lookupScore(table, rawName, fallbackFn) {
  const norm = normalize(rawName);
  if (table[norm] != null) return table[norm];
  // En uzun anahtar-ön eki eşleşmesi (ör. "rtx 5070 ti" hem "rtx 5070"
  // hem "rtx 5070 ti" anahtarlarıyla eşleşebilir — TI'lı olan daha
  // spesifik/uzun olduğu için o kazanmalı).
  let best = null, bestLen = 0;
  for (const key in table) {
    if (norm.startsWith(key) && key.length > bestLen) {
      best = table[key];
      bestLen = key.length;
    }
  }
  if (best != null) return best;
  return fallbackFn ? fallbackFn(norm) : 0;
}

// Tabloda hiç olmayan (yeni/nadir) bir çip için kaba bir tahmin —
// modeldeki rakamlardan ("i7", "ryzen 5", "ultra 9" gibi) genel bir
// segment çıkarır. Gerçek ölçüme göre çok daha kaba ama boş dönmekten
// (0 puan, o ürünü haksız yere en dipte gösterir) iyidir.
function fallbackCpuScore(norm) {
  if (/core ultra 9|ryzen 9|i9/.test(norm)) return 20000;
  if (/core ultra 7|ryzen 7|i7/.test(norm)) return 15000;
  if (/core ultra 5|ryzen 5|i5/.test(norm)) return 11000;
  if (/ryzen 3|i3/.test(norm)) return 7000;
  return 10000;
}
function fallbackGpuScore(norm) {
  if (/rtx|geforce/.test(norm)) return 50; // bilinmeyen bir RTX, orta segment varsay
  return 10; // muhtemelen entegre bir grafik
}

function scoreCpu(cpuName) {
  return lookupScore(CPU_MULTICORE_SCORE, cpuName, fallbackCpuScore);
}
function scoreGpu(gpuName) {
  return lookupScore(GPU_SCORE, gpuName, fallbackGpuScore);
}

// Tek bir adayın birleşik donanım gücü puanı — CPU ham puanı çok daha
// büyük bir ölçekte olduğu için (binler) önce kendi içinde ~0-100'e
// sıkıştırılıyor (30000 CPU puanını tavan kabul ediyoruz, katalogdaki
// en güçlünün biraz üzerinde), sonra GPU ile ağırlıklı ortalanıyor.
// GPU biraz daha ağırlıklı: "güçlü laptop" sorgusunda çoğu kullanıcı
// (bilhassa oyun bağlamında) ekran kartını CPU'dan daha belirleyici
// buluyor.
function computeLaptopPowerScore(specs) {
  const cpuNorm = Math.min(scoreCpu(specs.cpu), 30000) / 300; // 0-100
  const gpuNorm = scoreGpu(specs.gpu); // zaten 0-100
  return cpuNorm * 0.45 + gpuNorm * 0.55;
}

module.exports = { scoreCpu, scoreGpu, computeLaptopPowerScore };
