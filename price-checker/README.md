# Fiyat ve stok güncelleme

Fiyatlar bayatlamasın diye iki yol var. İkisi de production'a **SQL dosyası** üretir; sen kendi terminalinde çalıştırırsın.

## A) Elle / tarayıcıyla okunan değerler (şu an kullanılan yol)

```bash
# 1) En uzun süredir kontrol edilmeyen teklifleri CSV'ye dök
node price-checker/export-csv.js --seller="Amazon TR" --stale-hours=48 --limit=40 --out=guncelle.csv

# 2) CSV'de her satırın url'sini aç; gerçek fiyatı new_price, stok durumunu new_in_stock (true/false) sütununa yaz.
#    Doldurmadığın satırlar atlanır. Fiyat değişmeyecekse new_price boş kalabilir.

# 3) SQL'e çevir (mevcut fiyattan %35'ten fazla sapanlar yanlış okunmuş olabilir diye ayrılır)
node price-checker/csv-to-sql.js guncelle.csv --out=guncelle.sql

# 4) Production'a uygula (kendi terminalinde)
psql "$DATABASE_URL" -f guncelle.sql
```

`export-csv.js` hangi veritabanını okuyacağını `DATABASE_URL`'den alır. `.env` yereldir; production'ı okumak için komutun başına `DATABASE_URL="..." DB_SSL=true` ekle.

Amazon TR okuma kuralları: fiyat = `#ppd` içindeki ilk üstü çizili olmayan `.a-price`; stokta = sayfada `#add-to-cart-button` var; "Satın Alma Seçeneklerini Gör" = öne çıkan satıcı yok (stoksuz say).

## B) Amazon PA-API (otomatik, anahtar gerekir)

`check-prices.js` Amazon'un resmi API'siyle çalışır. `.env`'e `PAAPI_ACCESS_KEY`, `PAAPI_SECRET_KEY`, `PAAPI_PARTNER_TAG` gerekir (Associates Central). Anahtarlar yoksa yalnızca `--mock` ile mantık denenebilir. Bu araç yereldeki veritabanını günceller.

Hepsiburada ve Trendyol için otomatik kontrol yoktur (bot koruması; atlatılmaz).
