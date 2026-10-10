// price-checker/csv-to-sql.js — export-csv.js'in doldurulmuş çıktısını
// production için güvenli bir SQL dosyasına çevirir.
//
// Kullanım:
//   node price-checker/csv-to-sql.js guncelle.csv --out=guncelle.sql
//   node price-checker/csv-to-sql.js guncelle.csv --out=guncelle.sql --allow-big   (büyük fiyat sıçramalarına izin ver)
//
// KORUMA (geçmişte yaşanan hatalardan): mevcut fiyattan %35'ten fazla sapan
// bir yeni fiyat, yanlış okunmuş olabilir (ör. MSI Katana 138.999 diye
// girilmişti, gerçeği 94.999'du). Bu satırlar SQL'e KONMAZ, listelenir; doğruysa
// --allow-big ile yeniden çalıştır.
// Doldurulmayan satırlar (new_price ve new_in_stock ikisi de boş) atlanır.

const fs = require('fs');
const { parseCsv } = require('./csv');
const { buildSyncSql } = require('./sql-writer');

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error('Kullanım: node price-checker/csv-to-sql.js <dosya.csv> [--out=dosya.sql] [--seller="Amazon TR"] [--allow-big]'); process.exit(1); }
const opt = Object.fromEntries(rest.map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const MAX_JUMP = 0.35;

// "94.999", "94.999,00", "94999,5", "94999.5", "94.999 TL" → sayı
function parsePrice(raw) {
  let t = String(raw).replace(/\s|TL|₺/gi, '');
  if (t.includes('.') && t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  return Number(t);
}

const rows = parseCsv(fs.readFileSync(file, 'utf8'));
const ok = [], skipped = [], big = [], bad = [];
for (const r of rows) {
  const hasPrice = r.new_price !== '', hasStock = r.new_in_stock !== '';
  if (!hasPrice && !hasStock) { skipped.push(r); continue; }
  let price = null;
  if (hasPrice) {
    price = parsePrice(r.new_price);
    if (!Number.isFinite(price) || price <= 0) { bad.push([r, 'geçersiz fiyat: ' + r.new_price]); continue; }
  }
  let stock;
  if (hasStock) {
    const v = r.new_in_stock.toLowerCase();
    if (!['true', 'false', 'evet', 'hayir', 'hayır'].includes(v)) { bad.push([r, 'geçersiz stok değeri: ' + r.new_in_stock]); continue; }
    stock = v === 'true' || v === 'evet';
  } else {
    stock = String(r.mevcut_stok).toLowerCase() === 'true';  // belirtilmediyse mevcut durum korunur
  }
  const cur = Number(r.mevcut_fiyat);
  if (price != null && cur > 0 && Math.abs(price - cur) / cur > MAX_JUMP && !opt['allow-big']) { big.push([r, cur, price]); continue; }
  ok.push({ nk: r.normalized_key, sg: Number(r.storage_gb), col: r.color || '', price, stock });
}

console.log(`Okunan satır: ${rows.length} | SQL'e girecek: ${ok.length} | doldurulmamış (atlandı): ${skipped.length}`);
for (const [r, why] of bad) console.log(`  ✘ ${r.ad} (${r.storage_gb}GB ${r.color || '-'}): ${why}`);
if (big.length) {
  console.log(`\n⚠ %${MAX_JUMP * 100}'ten büyük fiyat sıçraması — SQL'e KONMADI (yanlış okunmuş olabilir, sayfadan tekrar kontrol et):`);
  for (const [r, cur, p] of big) console.log(`  ${r.ad} (${r.storage_gb}GB ${r.color || '-'}): ${cur} → ${p}  (${((p - cur) / cur * 100).toFixed(0)}%)`);
  console.log('  Doğruysa: --allow-big ile yeniden çalıştır.');
}
if (!ok.length) { console.log('\nSQL üretilecek satır yok.'); process.exit(bad.length || big.length ? 2 : 0); }
const out = opt.out || file.replace(/\.csv$/i, '') + '.sql';
fs.writeFileSync(out, buildSyncSql(ok, { seller: opt.seller || 'Amazon TR' }));
console.log(`\n✔ ${out} yazıldı. Production'a uygulamak için (kendi terminalinde):\n  psql "$DATABASE_URL" -f ${out}`);
