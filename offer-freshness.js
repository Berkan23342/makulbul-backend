// offer-freshness.js — fiyat tazeliği (bayat fiyat güvencesi).
//
// Fiyatlar elle/yarı elle güncelleniyor (bkz. price-checker/README.md); bir
// teklif günlerce kontrol edilmemişse sitede güncel gibi görünüp yanıltmasın
// diye iki şey yapılır:
//   1) Her teklifin yanında "X gün önce kontrol edildi" gösterilir; 7 gün ve
//      üstü "fiyat eski olabilir" uyarısı alır.
//   2) STALE_EXCLUDE_DAYS (ortam değişkeni, varsayılan 0 = kapalı) > 0 ise
//      bu günden eski teklifler "en uygun fiyat" hesabından ve AI/rehber
//      önerilerinden çıkarılır. Varsayılan KAPALI: canlıdaki verinin
//      tazeliği önce /istatistik panelindeki "Fiyat tazeliği" tablosundan
//      görülmeli, yoksa tüm fiyatlar bir anda kaybolabilir.
const STALE_WARN_DAYS = 7;
const STALE_EXCLUDE_DAYS = Math.max(0, Math.floor(Number(process.env.STALE_EXCLUDE_DAYS) || 0));

// SQL parçası: tam sayıdan üretilir (kullanıcı girdisi değil), enjeksiyon yok.
function freshSql(alias = 'o') {
  return STALE_EXCLUDE_DAYS > 0
    ? `AND ${alias}.last_checked_at >= NOW() - INTERVAL '${STALE_EXCLUDE_DAYS} days'`
    : '';
}

function ageDays(ts, now = Date.now()) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

function isFresh(offer) {
  if (!STALE_EXCLUDE_DAYS) return true;
  const d = ageDays(offer && offer.last_checked_at);
  return d !== null && d < STALE_EXCLUDE_DAYS;
}

function ageText(days) {
  if (days === null) return '';
  if (days === 0) return 'bugün kontrol edildi';
  if (days === 1) return 'dün kontrol edildi';
  return days + ' gün önce kontrol edildi';
}

module.exports = { STALE_WARN_DAYS, STALE_EXCLUDE_DAYS, freshSql, ageDays, isFresh, ageText };
