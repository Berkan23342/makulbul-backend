// ai-rank.js — "En güçlü model" sorgusu için donanım gücü sıralaması yapar.
//
// VARSAYILAN (ÜCRETSİZ) YÖNTEM: chip-tiers.js'deki bilinen çip puanları +
// RAM birlikte değerlendirilir. Hiçbir API çağrısı yapmaz, tamamen yerel
// ve anlıktır.
//
// OPSİYONEL: ANTHROPIC_API_KEY tanımlıysa, bunun yerine Claude'a sorup
// daha nüanslı bir değerlendirme alınabilir (ücretli, çok küçük maliyetli).
// Anahtar yoksa veya API çağrısı başarısız olursa ücretsiz yönteme döner.

const { scoreChip } = require('./chip-tiers');

async function rankByPower(candidates) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return freeRank(candidates);
  }

  const simplified = candidates.map(c => ({
    id: c.id,
    name: c.canonical_name,
    chip: c.specs.chip,
    ram_gb: c.specs.ram_gb,
  }));

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content:
            'Aşağıdaki telefon listesini, çip (işlemci) nesli ve RAM miktarını ' +
            'birlikte değerlendirerek donanım gücüne göre en güçlüden en zayıfa ' +
            'doğru sırala. Çip neslini bilgi birikimine göre değerlendir (örn. ' +
            'daha yeni Snapdragon/Apple/Exynos/Dimensity nesilleri genelde daha ' +
            'güçlüdür), sadece RAM sayısına bakma. ' +
            'SADECE şu JSON formatında yanıt ver, başka hiçbir açıklama ekleme:\n' +
            '{"ranking": ["id1","id2",...], "reasoning": "en güçlü telefonun neden ' +
            'en güçlü olduğuna dair kısa, tek cümlelik Türkçe açıklama"}\n\n' +
            'Telefonlar:\n' + JSON.stringify(simplified, null, 2),
        }],
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

    if (!Array.isArray(parsed.ranking) || parsed.ranking.length === 0) {
      throw new Error('AI yanıtı beklenen formatta değil');
    }

    return { ranking: parsed.ranking, reasoning: parsed.reasoning || null, usedAI: true };
  } catch (err) {
    console.error('AI sıralama başarısız oldu, ücretsiz çip+RAM yöntemine dönülüyor:', err.message);
    return freeRank(candidates);
  }
}

// Ücretsiz, yerel yöntem: çip puanı (ağırlıklı) + RAM + (eşitlik bozucu
// olarak) batarya kapasitesi birlikte skorlanır.
function freeRank(candidates) {
  const scored = candidates.map(c => {
    const chipScore = scoreChip(c.specs.chip);
    const ramScore = c.specs.ram_gb || 0;
    const batteryTiebreak = (c.specs.battery_mah || 0) / 1000;
    // Çip puanı 0-100 aralığında ve baskın faktör; RAM ince ayar olarak
    // ekleniyor; batarya ise aynı çip+RAM'e sahip modeller arasında
    // (örn. iPhone 17 Pro vs Pro Max) mantıklı bir eşitlik bozucu —
    // daha büyük gövde/batarya genelde daha üst segmenti işaret eder.
    const totalScore = chipScore * 10 + ramScore + batteryTiebreak;
    return { ...c, _score: totalScore, _chipScore: chipScore };
  });

  scored.sort((a, b) => b._score - a._score);

  const top = scored[0];
  const reasoning = top
    ? `${top.specs.chip} çipi ve ${top.specs.ram_gb}GB RAM ile bu segmentteki en güçlü donanıma sahip`
    : null;

  return { ranking: scored.map(c => c.id), reasoning, usedAI: false };
}

module.exports = { rankByPower };
