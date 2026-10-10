-- ============================================================
-- Makulbul — kendi (first-party, çerezsiz) analitik altyapısı
-- Ekler:
--   • page_views.source  : trafik kaynağı (google, instagram, doğrudan, utm_source...)
--   • page_views.device  : mobil / masaüstü
--   • offer_clicks       : satıcıya giden tıklamalar (affiliate tıklamaları)
-- Kişisel veri tutulmaz (IP, çerez, kullanıcı kimliği yok).
-- İdempotent. KULLANIM: psql "$DATABASE_URL" -f analytics-migration.sql
-- ============================================================
BEGIN;

ALTER TABLE page_views ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS device TEXT;
CREATE INDEX IF NOT EXISTS page_views_source_idx ON page_views (source);

CREATE TABLE IF NOT EXISTS offer_clicks (
  id BIGSERIAL PRIMARY KEY,
  offer_id UUID REFERENCES offers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS offer_clicks_created_at_idx ON offer_clicks (created_at);
CREATE INDEX IF NOT EXISTS offer_clicks_offer_idx ON offer_clicks (offer_id);

COMMIT;
