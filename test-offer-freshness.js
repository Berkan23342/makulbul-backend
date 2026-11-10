// Framework'süz test: node test-offer-freshness.js
const assert = require('assert');
process.env.STALE_EXCLUDE_DAYS = '5';
const f = require('./offer-freshness');
const day = 86400000, now = Date.now();
const iso = d => new Date(now - d * day).toISOString();
assert.strictEqual(f.STALE_EXCLUDE_DAYS, 5);
assert.strictEqual(f.ageDays(iso(0)), 0);
assert.strictEqual(f.ageDays(iso(3)), 3);
assert.strictEqual(f.ageDays(null), null);
assert.strictEqual(f.ageDays('bozuk'), null);
assert.strictEqual(f.ageDays(new Date(now + day).toISOString()), 0, 'gelecek tarih 0 sayılır');
assert.strictEqual(f.isFresh({ last_checked_at: iso(2) }), true);
assert.strictEqual(f.isFresh({ last_checked_at: iso(5) }), false, 'sınır: 5 gün = taze değil');
assert.strictEqual(f.isFresh({ last_checked_at: null }), false, 'tarihsiz teklif taze sayılmaz');
assert.ok(/INTERVAL '5 days'/.test(f.freshSql('o')));
assert.strictEqual(f.ageText(0), 'bugün kontrol edildi');
assert.strictEqual(f.ageText(1), 'dün kontrol edildi');
assert.strictEqual(f.ageText(9), '9 gün önce kontrol edildi');
assert.strictEqual(f.ageText(null), '');
// kapalı mod: hiçbir şey elenmez
delete require.cache[require.resolve('./offer-freshness')];
process.env.STALE_EXCLUDE_DAYS = '0';
const g = require('./offer-freshness');
assert.strictEqual(g.freshSql(), '');
assert.strictEqual(g.isFresh({ last_checked_at: iso(400) }), true);
assert.strictEqual(g.isFresh({}), true);
// geçersiz değerler kapalı sayılır, SQL'e sızmaz
for (const bad of ['abc', '-3', "5'; DROP TABLE offers;--"]) {
  delete require.cache[require.resolve('./offer-freshness')];
  process.env.STALE_EXCLUDE_DAYS = bad;
  const h = require('./offer-freshness');
  assert.ok(!/DROP/.test(h.freshSql()), 'enjeksiyon yok: ' + bad);
}
console.log('offer-freshness: tüm testler geçti');
