// ai-rank-laptop.js — "En güçlü laptop" sorgusu için donanım gücü
// sıralaması yapar. ai-rank.js (telefon) ile BİREBİR AYNI desen:
//
// VARSAYILAN (ÜCRETSİZ) YÖNTEM: chip-tiers-laptop.js'deki bilinen
// CPU+GPU puanları birlikte değerlendirilir. Hiçbir API çağrısı yapmaz.
//
// OPSİYONEL: ANTHROPIC_API_KEY tanımlıysa Claude'a sorup daha nüanslı
// bir değerlendirme (ör. "oyun için" bağlamında GPU'yu öne çıkarma)
// alınabilir. Anahtar yoksa veya çağrı başarısız olursa ücretsiz
// yönteme döner.

const { computeLaptopPowerScore } = require('./chip-tiers-laptop');

async function rankLaptopsByPower(candidates) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return freeRank(candidates);
  }

  const simplified = candidates.map(c => ({
    id: c.id,
    name: c.canonical_name,
    cpu: c.specs.cpu,
    gpu: c.specs.gpu,
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
            'Aşağıdaki laptop listesini, işlemci (CPU) VE ekran kartı (GPU) ' +
            'nesli/gücünü birlikte değerlendirerek genel donanım gücüne göre ' +
            'en güçlüden en zayıfa doğru sırala. Bilgi birikimine göre ' +
            'değerlendir (örn. daha yeni Intel Core Ultra HX/AMD Ryzen HX ' +
            'nesilleri ve daha üst NVIDIA RTX serileri genelde daha güçlüdür), ' +
            'sadece RAM sayısına bakma. ' +
            'SADECE şu JSON formatında yanıt ver, başka hiçbir açıklama ekleme:\n' +
            '{"ranking": ["id1","id2",...], "reasoning": "en güçlü laptopun neden ' +
            'en güçlü olduğuna dair kısa, tek cümlelik Türkçe açıklama"}\n\n' +
            'Laptoplar:\n' + JSON.stringify(simplified, null, 2),
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
    console.error('AI sıralama başarısız oldu, ücretsiz CPU+GPU yöntemine dönülüyor:', err.message);
    return freeRank(candidates);
  }
}

// Ücretsiz, yerel yöntem: computeLaptopPowerScore()'a göre sıralar.
function freeRank(candidates) {
  const scored = candidates.map(c => ({ ...c, _score: computeLaptopPowerScore(c.specs) }));
  scored.sort((a, b) => b._score - a._score);

  const top = scored[0];
  const reasoning = top
    ? `${top.specs.cpu} işlemcisi ve ${top.specs.gpu} ekran kartı ile bu segmentteki en güçlü donanıma sahip`
    : null;

  return { ranking: scored.map(c => c.id), reasoning, usedAI: false };
}

module.exports = { rankLaptopsByPower };
