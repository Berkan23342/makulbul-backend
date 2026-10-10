// price-checker/sql-writer.js — fiyat/stok değişikliklerinden, production
// (Neon) veritabanında kullanıcının KENDİ terminalinde çalıştıracağı güvenli
// bir SQL dosyası üretir. Yerel ve production veritabanlarında UUID'ler
// farklı olduğu için eşleştirme products.normalized_key + offers.storage_gb
// + COALESCE(color,'') ile yapılır. İdempotent: tekrar çalıştırılırsa 0 satır
// değişir. Fiyatı değişen her teklif için price_history kaydı eklenir.

const sqlStr = s => "'" + String(s ?? '').replace(/'/g, "''") + "'";

/**
 * @param {Array<{nk:string, sg:number, col:string, price:number|null, stock:boolean}>} rows
 * @param {{seller?:string, title?:string}} opts
 */
function buildSyncSql(rows, { seller = 'Amazon TR', title = 'fiyat & stok senkronizasyonu' } = {}) {
  if (!rows.length) throw new Error('SQL üretmek için en az bir satır gerekli');
  const values = rows.map(r =>
    `    (${sqlStr(r.nk)}, ${Number(r.sg)}, ${sqlStr(r.col)}, ${r.price == null ? 'NULL' : Number(r.price)}::numeric, ${r.stock ? 'true' : 'false'})`
  ).join(',\n');
  const priced = rows.filter(r => r.price != null).length;
  const oos = rows.filter(r => !r.stock).length;
  return `-- ============================================================
-- Makulbul — ${seller} ${title}
-- Üretildi: ${new Date().toISOString()}
-- ${rows.length} teklif işlenir (${priced} fiyat bilgisi, ${oos} stoksuz).
--   • price NULL ise fiyat KORUNUR, yalnızca stok durumu güncellenir.
--   • Eşleştirme: normalized_key + depolama + renk. İdempotent.
-- KULLANIM: psql "$DATABASE_URL" -f <bu-dosya>.sql
-- ============================================================

BEGIN;

WITH u(nk, sg, col, new_price, new_stock) AS (
  VALUES
${values}
),
target AS (
  SELECT o.id, o.price AS old_price, o.in_stock AS old_stock, u.new_price, u.new_stock
  FROM u
  JOIN products p ON p.normalized_key = u.nk
  JOIN sellers s ON s.name = ${sqlStr(seller)}
  JOIN offers o ON o.product_id = p.id AND o.seller_id = s.id
               AND o.storage_gb = u.sg AND COALESCE(o.color, '') = u.col
),
chg AS (
  UPDATE offers o
  SET price = COALESCE(t.new_price, o.price),
      in_stock = t.new_stock,
      last_checked_at = now()
  FROM target t
  WHERE o.id = t.id
    AND ( (t.new_price IS NOT NULL AND o.price IS DISTINCT FROM t.new_price)
          OR o.in_stock IS DISTINCT FROM t.new_stock )
  RETURNING o.id, o.price AS price_now, t.old_price
)
INSERT INTO price_history (offer_id, price)
SELECT id, price_now FROM chg WHERE price_now IS DISTINCT FROM old_price;

COMMIT;
`;
}

module.exports = { buildSyncSql };
