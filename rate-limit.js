// rate-limit.js — Bağımlılıksız, hafıza içi (in-memory) basit bir oran
// sınırlayıcı. Bu proje tek process olarak çalıştığı için Redis gibi
// paylaşımlı bir depoya ihtiyaç yok; sunucu yeniden başlarsa sayaçlar
// sıfırlanır, bu kabul edilebilir bir kısıt.
//
// Neden gerekli: /api/price-alerts, e-posta doğrulaması eklendikten
// sonra bile sınırsız sayıda istekle çağrılabiliyordu — biri aynı
// (kendine ait olmayan) e-posta adresine art arda "alarmı onayla"
// maili göndertip taciz edebilir, ya da servisimizin e-posta gönderim
// itibarını (deliverability) zedeleyebilirdi.

function createRateLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map(); // key -> [timestamp, timestamp, ...]

  // Bellek zamanla şişmesin diye süresi geçmiş kayıtları periyodik temizle
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter(t => t > cutoff);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }, windowMs);
  cleanup.unref?.();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) || []).filter(t => t > cutoff);

    if (timestamps.length >= max) {
      return res.status(429).json({ error: message || 'Çok fazla istek gönderdin, biraz sonra tekrar dene.' });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

module.exports = { createRateLimiter };
