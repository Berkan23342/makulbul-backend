-- =====================================================================
--  iPhone 13 / 14 / 15 / 16 AİLELERİ — Temmuz 2026
--  Taban + Plus + Pro + Pro Max, her nesil için (16 yeni ürün)
--
--  KAYNAK NOTU: Teknik özellikler (çip, ekran, ağırlık, IP derecesi,
--  kamera) Apple'ın resmi/iyi bilinen spesifikasyonlarına dayanır —
--  yüksek güvenilirlik. Fiyatlar için bazıları güncel/taze kaynaklardan
--  doğrulandı (# GERÇEK olarak işaretli), bazıları amortisman eğrisine
--  göre makul güncel piyasa TAHMİNİ (# TAHMİNİ olarak işaretli) —
--  gerçek üretimde bunlar canlı scraper ile güncellenmeli.
--
--  ÖNEMLİ GERÇEK: Apple, iPhone 17 ailesi çıkışından sonra 16 Pro/Pro Max
--  modellerini kendi resmi mağazasından KALDIRDI. Bu yüzden 13/14/15
--  ailelerinin TAMAMI ve 16 Pro/Pro Max/Plus artık SADECE pazaryerlerinde
--  satılıyor, Apple Türkiye resmi satıcı olarak eklenmedi (gerçekçilik).
-- =====================================================================

-- ---------------------------------------------------------------------
-- iPhone 13 AİLESİ (2021) — A15 Bionic, IP68, USB-C YOK (Lightning)
-- ---------------------------------------------------------------------

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 13', 'Apple iPhone 13 128GB',
  '{"ram_gb":4,"storage_gb":128,"screen_inch":6.1,"battery_mah":3227,"chip":"A15 Bionic",
    "main_camera_mp":12,"ultra_wide_mp":12,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":60,"release_year":2021,
    "weight_g":174,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Alüminyum + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-13-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 13 mini', 'Apple iPhone 13 mini 128GB',
  '{"ram_gb":4,"storage_gb":128,"screen_inch":5.4,"battery_mah":2406,"chip":"A15 Bionic",
    "main_camera_mp":12,"ultra_wide_mp":12,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":60,"release_year":2021,
    "weight_g":140,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Alüminyum + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-13-mini-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 13 Pro', 'Apple iPhone 13 Pro 128GB',
  '{"ram_gb":6,"storage_gb":128,"screen_inch":6.1,"battery_mah":3095,"chip":"A15 Bionic",
    "main_camera_mp":12,"ultra_wide_mp":12,"telephoto_mp":12,"optical_zoom_x":3,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":120,"release_year":2021,
    "weight_g":204,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Paslanmaz Çelik + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-13-pro-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 13 Pro Max', 'Apple iPhone 13 Pro Max 128GB',
  '{"ram_gb":6,"storage_gb":128,"screen_inch":6.7,"battery_mah":4352,"chip":"A15 Bionic",
    "main_camera_mp":12,"ultra_wide_mp":12,"telephoto_mp":12,"optical_zoom_x":3,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":120,"release_year":2021,
    "weight_g":238,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Paslanmaz Çelik + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-13-pro-max-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

-- ---------------------------------------------------------------------
-- iPhone 14 AİLESİ (2022)
-- ---------------------------------------------------------------------

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 14', 'Apple iPhone 14 128GB',
  '{"ram_gb":6,"storage_gb":128,"screen_inch":6.1,"battery_mah":3279,"chip":"A15 Bionic",
    "main_camera_mp":12,"ultra_wide_mp":12,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":60,"release_year":2022,
    "weight_g":172,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Alüminyum + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-14-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 14 Plus', 'Apple iPhone 14 Plus 128GB',
  '{"ram_gb":6,"storage_gb":128,"screen_inch":6.7,"battery_mah":4325,"chip":"A15 Bionic",
    "main_camera_mp":12,"ultra_wide_mp":12,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":60,"release_year":2022,
    "weight_g":203,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Alüminyum + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-14-plus-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 14 Pro', 'Apple iPhone 14 Pro 128GB',
  '{"ram_gb":6,"storage_gb":128,"screen_inch":6.1,"battery_mah":3200,"chip":"A16 Bionic",
    "main_camera_mp":48,"ultra_wide_mp":12,"telephoto_mp":12,"optical_zoom_x":3,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":120,"release_year":2022,
    "weight_g":206,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Paslanmaz Çelik + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-14-pro-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 14 Pro Max', 'Apple iPhone 14 Pro Max 128GB',
  '{"ram_gb":6,"storage_gb":128,"screen_inch":6.7,"battery_mah":4323,"chip":"A16 Bionic",
    "main_camera_mp":48,"ultra_wide_mp":12,"telephoto_mp":12,"optical_zoom_x":3,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":120,"release_year":2022,
    "weight_g":240,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Paslanmaz Çelik + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-14-pro-max-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

-- ---------------------------------------------------------------------
-- iPhone 15 AİLESİ (2023) — USB-C ile gelen ilk nesil
-- ---------------------------------------------------------------------

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 15', 'Apple iPhone 15 128GB',
  '{"ram_gb":6,"storage_gb":128,"screen_inch":6.1,"battery_mah":3349,"chip":"A16 Bionic",
    "main_camera_mp":48,"ultra_wide_mp":12,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":60,"release_year":2023,
    "weight_g":171,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Alüminyum + Renkli Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-15-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 15 Plus', 'Apple iPhone 15 Plus 128GB',
  '{"ram_gb":6,"storage_gb":128,"screen_inch":6.7,"battery_mah":4383,"chip":"A16 Bionic",
    "main_camera_mp":48,"ultra_wide_mp":12,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":60,"release_year":2023,
    "weight_g":201,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Alüminyum + Renkli Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-15-plus-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 15 Pro', 'Apple iPhone 15 Pro 128GB',
  '{"ram_gb":8,"storage_gb":128,"screen_inch":6.1,"battery_mah":3274,"chip":"A17 Pro",
    "main_camera_mp":48,"ultra_wide_mp":12,"telephoto_mp":12,"optical_zoom_x":3,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":120,"release_year":2023,
    "weight_g":187,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Titanyum + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-15-pro-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 15 Pro Max', 'Apple iPhone 15 Pro Max 256GB',
  '{"ram_gb":8,"storage_gb":256,"screen_inch":6.7,"battery_mah":4441,"chip":"A17 Pro",
    "main_camera_mp":48,"ultra_wide_mp":12,"telephoto_mp":12,"optical_zoom_x":5,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":120,"release_year":2023,
    "weight_g":221,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":15,
    "build_material":"Titanyum + Cam","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-15-pro-max-256gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

-- ---------------------------------------------------------------------
-- iPhone 16 AİLESİ (2024) — 16 ve 16e Apple TR'de hâlâ resmi satılıyor,
-- Plus/Pro/Pro Max Apple mağazasından kaldırıldı (sadece pazaryeri)
-- ---------------------------------------------------------------------

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 16', 'Apple iPhone 16 128GB',
  '{"ram_gb":8,"storage_gb":128,"screen_inch":6.1,"battery_mah":3561,"chip":"A18",
    "main_camera_mp":48,"ultra_wide_mp":12,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":60,"release_year":2024,
    "weight_g":170,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":25,
    "build_material":"Alüminyum + Seramik Kalkan","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-16-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 16 Plus', 'Apple iPhone 16 Plus 128GB',
  '{"ram_gb":8,"storage_gb":128,"screen_inch":6.7,"battery_mah":4674,"chip":"A18",
    "main_camera_mp":48,"ultra_wide_mp":12,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":60,"release_year":2024,
    "weight_g":199,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":25,
    "build_material":"Alüminyum + Seramik Kalkan","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-16-plus-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 16 Pro', 'Apple iPhone 16 Pro 128GB',
  '{"ram_gb":8,"storage_gb":128,"screen_inch":6.3,"battery_mah":3582,"chip":"A18 Pro",
    "main_camera_mp":48,"ultra_wide_mp":48,"telephoto_mp":12,"optical_zoom_x":5,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":120,"release_year":2024,
    "weight_g":199,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":25,
    "build_material":"Titanyum + Seramik Kalkan","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-16-pro-128gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

INSERT INTO products (category_id, brand_id, model, canonical_name, specs, normalized_key)
SELECT c.id, b.id, 'iPhone 16 Pro Max', 'Apple iPhone 16 Pro Max 256GB',
  '{"ram_gb":8,"storage_gb":256,"screen_inch":6.9,"battery_mah":4685,"chip":"A18 Pro",
    "main_camera_mp":48,"ultra_wide_mp":48,"telephoto_mp":12,"optical_zoom_x":5,"front_camera_mp":12,
    "has_5g":true,"has_nfc":true,"refresh_rate_hz":120,"release_year":2024,
    "weight_g":227,"ip_rating":"IP68","wired_charging_watts":20,"wireless_charging_watts":25,
    "build_material":"Titanyum + Seramik Kalkan","has_stereo_speakers":true}'::jsonb,
  'apple-iphone-16-pro-max-256gb'
FROM categories c, brands b WHERE c.slug='telefon' AND b.name='Apple';

-- =====================================================================
-- TEKLİFLER (OFFERS) — hepsi pazaryeri, Apple TR resmi satıcı olarak
-- eklenmedi (13/14/15/16 Plus/Pro/Pro Max artık Apple'da satılmıyor)
-- =====================================================================

-- iPhone 13 — # TAHMİNİ (amortisman bazlı güncel piyasa aralığı)
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 13 128 GB (Yenilenmiş/2.El Değil, Apple Türkiye Garantili)', 'https://www.trendyol.com', 'https://www.trendyol.com', 31999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-13-128gb' AND s.name='Trendyol';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 13 128GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 32799, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-13-128gb' AND s.name='Hepsiburada';

-- iPhone 13 mini — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 13 mini 128 GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 27999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-13-mini-128gb' AND s.name='Trendyol';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 13 mini 128GB', 'https://www.n11.com', 'https://www.n11.com', 28799, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-13-mini-128gb' AND s.name='N11';

-- iPhone 13 Pro — # TAHMİNİ (aralık: 29.000-38.400 TL, üst sınır kullanıldı)
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 13 Pro 128 GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 38999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-13-pro-128gb' AND s.name='Hepsiburada';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 13 Pro 128GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 39499, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-13-pro-128gb' AND s.name='Trendyol';

-- iPhone 13 Pro Max — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 13 Pro Max 128 GB', 'https://www.vatanbilgisayar.com', 'https://www.vatanbilgisayar.com', 44999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-13-pro-max-128gb' AND s.name='Vatan Bilgisayar';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 13 Pro Max 128GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 45799, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-13-pro-max-128gb' AND s.name='Hepsiburada';

-- iPhone 14 — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 14 128 GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 37999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-14-128gb' AND s.name='Trendyol';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 14 128GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 38799, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-14-128gb' AND s.name='Hepsiburada';

-- iPhone 14 Plus — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 14 Plus 128 GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 42999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-14-plus-128gb' AND s.name='Hepsiburada';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 14 Plus 128GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 43799, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-14-plus-128gb' AND s.name='Trendyol';

-- iPhone 14 Pro — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 14 Pro 128 GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 54999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-14-pro-128gb' AND s.name='Trendyol';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 14 Pro 128GB', 'https://www.mediamarkt.com.tr', 'https://www.mediamarkt.com.tr', 56499, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-14-pro-128gb' AND s.name='MediaMarkt';

-- iPhone 14 Pro Max — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 14 Pro Max 128 GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 59999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-14-pro-max-128gb' AND s.name='Hepsiburada';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 14 Pro Max 128GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 61499, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-14-pro-max-128gb' AND s.name='Trendyol';

-- iPhone 15 — # GERÇEK (Akakçe, güncel/taze veri)
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 15 128 GB Siyah', 'https://www.trendyol.com', 'https://www.trendyol.com', 46999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-15-128gb' AND s.name='Trendyol';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 15 128 GB Siyah (Apple Türkiye Garantili)', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 47099, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-15-128gb' AND s.name='Hepsiburada';

-- iPhone 15 Plus — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 15 Plus 128 GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 52999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-15-plus-128gb' AND s.name='Hepsiburada';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 15 Plus 128GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 53799, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-15-plus-128gb' AND s.name='Trendyol';

-- iPhone 15 Pro — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 15 Pro 128 GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 64999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-15-pro-128gb' AND s.name='Trendyol';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 15 Pro 128GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 66499, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-15-pro-128gb' AND s.name='Hepsiburada';

-- iPhone 15 Pro Max — # GERÇEK (karekod.org, yakın tarihli)
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 15 Pro Max 256 GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 91999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-15-pro-max-256gb' AND s.name='Hepsiburada';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 15 Pro Max 256GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 93499, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-15-pro-max-256gb' AND s.name='Trendyol';

-- iPhone 16 — # TAHMİNİ (16 Plus fiyatına göre orantılandı)
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 16 128 GB Siyah', 'https://www.trendyol.com', 'https://www.trendyol.com', 59999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-16-128gb' AND s.name='Trendyol';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 16 128 GB (Apple Türkiye Garantili)', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 60999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-16-128gb' AND s.name='Hepsiburada';

-- iPhone 16 Plus — # GERÇEK (Akakçe, güncel/taze veri)
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 16 Plus 128 GB Cep Telefonu Siyah', 'https://www.trendyol.com', 'https://www.trendyol.com', 68999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-16-plus-128gb' AND s.name='Trendyol';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 16 Plus 128GB Siyah (Apple Türkiye Garantili)', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 69999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-16-plus-128gb' AND s.name='Hepsiburada';

-- iPhone 16 Pro — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 16 Pro 128 GB', 'https://www.hepsiburada.com', 'https://www.hepsiburada.com', 78999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-16-pro-128gb' AND s.name='Hepsiburada';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 16 Pro 128GB', 'https://www.trendyol.com', 'https://www.trendyol.com', 80499, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-16-pro-128gb' AND s.name='Trendyol';

-- iPhone 16 Pro Max — # TAHMİNİ
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'Apple iPhone 16 Pro Max 256 GB', 'https://www.vatanbilgisayar.com', 'https://www.vatanbilgisayar.com', 94999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-16-pro-max-256gb' AND s.name='Vatan Bilgisayar';
INSERT INTO offers (product_id, seller_id, raw_title, product_url, affiliate_url, price, currency)
SELECT p.id, s.id, 'iPhone 16 Pro Max 256GB', 'https://www.mediamarkt.com.tr', 'https://www.mediamarkt.com.tr', 96999, 'TRY'
FROM products p, sellers s WHERE p.normalized_key='apple-iphone-16-pro-max-256gb' AND s.name='MediaMarkt';
