-- 20260814_fts_search.sql — Postgres full-text search
-- Uygula: sudo docker exec -i threats-postgres psql -U threats -d threats < db/migrations/20260814_fts_search.sql

-- 1) search_vector kolonu
ALTER TABLE documents ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2) Trigger fonksiyonu (title A, summary/actors/cves/tags B, content C)
CREATE OR REPLACE FUNCTION documents_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.content, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.actors, ' '), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.cves, ' '), '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Trigger
DROP TRIGGER IF EXISTS documents_search_vector_trigger ON documents;
CREATE TRIGGER documents_search_vector_trigger
BEFORE INSERT OR UPDATE OF title, summary, content, actors, cves, tags ON documents
FOR EACH ROW EXECUTE FUNCTION documents_search_vector_update();

-- 4) Mevcut satırları doldur (idempotent)
UPDATE documents SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(summary, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(actors, ' '), '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(cves, ' '), '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'B');

-- 5) GIN index
CREATE INDEX IF NOT EXISTS idx_documents_search_vector ON documents USING GIN (search_vector);
