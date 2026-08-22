-- price-alerts-schema.sql — Fiyat düşüş alarmı tablosu.
-- Kullanıcı bir ürün için hedef fiyat belirler; check-price-alerts.js
-- düzenli çalıştırıldığında (cron) hedefe ulaşan alarmları bulup
-- bildirir ve tek seferlik olarak pasifleştirir.

CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  target_price NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts (product_id) WHERE is_active = true;
