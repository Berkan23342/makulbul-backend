// ai-query-fallback.js — AI arama motorunun kural tabanlı (regex/anahtar
// kelime) ayrıştırıcısı bir sorguda HİÇBİR kriter bulamadığında devreye
// giren, Claude tabanlı YEDEK yol.
//
// NEDEN: kural tabanlı sistem (numeric-field-filters.js, price-filter.js,
// text-normalize.js — bu oturumda çok sağlamlaştırıldı) yine de "hiç
// düşünülmemiş" bir ifade biçimiyle (yazıyla sayı: "otuz bin civarı",
// yazım hatası, çok nüanslı bir istek) karşılaşınca sessizce jenerik "en
// ucuz" sonucuna düşebilir. Her yeni ifade biçimi için ayrı regex yazmak
// yerine, SADECE regex'in hiçbir şey bulamadığı (yani zaten kaybedecek
// bir şeyi olmayan) durumlarda soruyu doğrudan Claude'a sorup aynı
// yapılandırılmış filtre şemasını (numericThresholds/maxPrice/minPrice/
// brand/softFilters) çıkarıyoruz — pipeline'ın geri kalanı (SQL, sıralama,
// sebep metinleri) HİÇ değişmiyor, sadece bu girdi değişkenleri zenginleşiyor.
//
// MALİYET/GECİKME DİSİPLİNİ: bu fonksiyon SADECE regex hiçbir kriter
// bulamadığında çağrılıyor (bkz. server.js'teki çağrı noktaları) — yani
// gerçek trafiğin büyük kısmı (regex'in zaten doğru anladığı sorgular)
// bu API çağrısına HİÇ uğramıyor, maliyet ve gecikme sadece "gerçekten
// anlaşılamayan" azınlık sorgularda oluşuyor.
//
// ai-rank.js/ai-rank-laptop.js ile AYNI "opsiyonel yükseltme" deseni:
// ANTHROPIC_API_KEY tanımlı değilse ya da çağrı başarısız olursa null
// döner — çağıran taraf (server.js) bu durumda ESKİ (jenerik) davranışı
// aynen sürdürür, hiçbir şey kırılmaz.

const MODEL = 'claude-haiku-4-5-20251001'; // basit çıkarım işi — Sonnet/Opus gereksiz pahalı+yavaş kalırdı

// Şemayı, alan tablolarından (numeric-field-filters.js) OTOMATİK üretir —
// yeni bir sayısal alan eklendiğinde burada elle güncelleme gerekmez.
function buildFieldSchema(numericFields, labels) {
  return numericFields
    .map(f => `  - ${f.key} (${labels[f.key] || f.key})`)
    .join('\n');
}

// filters objesindeki hangi boolean anahtarların "yumuşak tercih" (soft
// preference) olarak Claude'a sorulabileceğini, server.js'teki filters
// tanımından ayrı tutmak yerine ÇAĞIRAN TARAF belirliyor (softFilterKeys
// parametresi) — bu modül server.js'in iç yapısına bağımlı olmasın diye.
async function parseQueryWithAI(query, { category, numericFields, labels, softFilterKeys, brandNames }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // anahtar yoksa: sessizce devre dışı, çağıran eski davranışa devam eder

  const fieldSchema = buildFieldSchema(numericFields, labels);
  const categoryLabel = category === 'laptop' ? 'laptop' : 'telefon';

  const prompt = `Bir ${categoryLabel} fiyat karşılaştırma sitesinin arama kutusuna yazılan şu Türkçe ` +
    `sorguyu analiz et: "${query}"\n\n` +
    `Bu sorgu, basit bir kural tabanlı ayrıştırıcı tarafından ANLAŞILAMADI (hiçbir kriter bulunamadı) — ` +
    `senin görevin, muhtemelen alışılmadık bir ifade biçimi (yazıyla sayı, yazım hatası, dolaylı anlatım) ` +
    `yüzünden kaçırılan gerçek niyeti çıkarmak.\n\n` +
    `Kullanılabilir sayısal alanlar:\n${fieldSchema}\n\n` +
    `Kullanılabilir yumuşak tercihler (boolean): ${softFilterKeys.join(', ')}\n` +
    `Kullanılabilir markalar: ${brandNames.join(', ')}\n\n` +
    `SADECE şu JSON şemasında yanıt ver, başka HİÇBİR açıklama ekleme:\n` +
    `{\n` +
    `  "numericThresholds": { "<alan_adı>": {"min": number|null, "max": number|null}, ... },\n` +
    `  "maxPrice": number|null,\n` +
    `  "minPrice": number|null,\n` +
    `  "brand": "<yukarıdaki listeden birebir bir marka adı>"|null,\n` +
    `  "softFilters": ["<yukarıdaki listeden 0+ tercih>"]\n` +
    `}\n\n` +
    `Sorguda GERÇEKTEN karşılığı olmayan hiçbir alanı UYDURMA — emin olmadığın her şey null/boş kalsın.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API hatası (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Gevşek doğrulama — beklenmeyen bir şekil gelirse (model talimatı
    // tam uymadıysa) sessizce null dönüp eski davranışa düşülsün, hatalı/
    // yarım bir filtre uygulanmasın.
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      numericThresholds: (parsed.numericThresholds && typeof parsed.numericThresholds === 'object') ? parsed.numericThresholds : {},
      maxPrice: typeof parsed.maxPrice === 'number' ? parsed.maxPrice : null,
      minPrice: typeof parsed.minPrice === 'number' ? parsed.minPrice : null,
      brand: typeof parsed.brand === 'string' && brandNames.includes(parsed.brand) ? parsed.brand : null,
      softFilters: Array.isArray(parsed.softFilters) ? parsed.softFilters.filter(k => softFilterKeys.includes(k)) : [],
    };
  } catch (err) {
    console.error('AI sorgu yedek yolu başarısız oldu, jenerik sonuca dönülüyor:', err.message);
    return null;
  }
}

module.exports = { parseQueryWithAI };
