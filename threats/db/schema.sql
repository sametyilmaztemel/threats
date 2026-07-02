-- =====================================================
-- THREATS.0RCE.COM — Database Schema
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Sources (kaynakların listesi)
CREATE TABLE sources (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  url TEXT,
  api_endpoint TEXT,
  requires_key BOOLEAN DEFAULT FALSE,
  enabled BOOLEAN DEFAULT TRUE,
  tier SMALLINT DEFAULT 2,
  language TEXT DEFAULT 'en',
  category TEXT,
  last_fetched_at TIMESTAMPTZ,
  last_status TEXT,
  last_items_count INT DEFAULT 0,
  fetch_interval_min INT DEFAULT 60,
  total_items INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents (ana tablo)
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  source_id INT REFERENCES sources(id) ON DELETE SET NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  content TEXT,
  summary TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  severity SMALLINT,
  confidence NUMERIC(3,2),
  category TEXT[],
  tags TEXT[],
  cves TEXT[],
  actors TEXT[],
  sectors TEXT[],
  techniques TEXT[],
  ioc_count INT DEFAULT 0,
  ai_threat BOOLEAN DEFAULT FALSE,
  language TEXT DEFAULT 'en',
  hash TEXT,
  -- Phase 1 V2 metadata (Tasks 1.3 — additive)
  tlp TEXT DEFAULT 'GREEN' CHECK (tlp IN ('WHITE','GREEN','AMBER','RED')),
  confidence SMALLINT DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  kill_chain_phase TEXT CHECK (kill_chain_phase IN ('recon','weaponize','deliver','exploit','install','c2','actions')),
  word_count INT DEFAULT 0,
  ai_summary TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_published ON documents(published_at DESC NULLS LAST);
CREATE INDEX idx_documents_severity ON documents(severity DESC NULLS LAST);
CREATE INDEX idx_documents_ai ON documents(ai_threat) WHERE ai_threat = TRUE;
CREATE INDEX idx_documents_actors ON documents USING GIN(actors);
CREATE INDEX idx_documents_cves ON documents USING GIN(cves);
CREATE INDEX idx_documents_techniques ON documents USING GIN(techniques);
CREATE INDEX idx_documents_categories ON documents USING GIN(category);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);
CREATE INDEX idx_documents_title_trgm ON documents USING GIN(title gin_trgm_ops);

-- IOCs
CREATE TABLE iocs (
  id BIGSERIAL PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT NOT NULL,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  source_id INT REFERENCES sources(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2),
  tags TEXT[],
  ai_related BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(value, type, document_id)
);

CREATE INDEX idx_iocs_value ON iocs(value);
CREATE INDEX idx_iocs_type ON iocs(type);
CREATE INDEX idx_iocs_ai ON iocs(ai_related) WHERE ai_related = TRUE;
CREATE INDEX idx_iocs_document ON iocs(document_id);

-- Threat actors
CREATE TABLE actors (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  aliases TEXT[],
  origin_country TEXT,
  type TEXT,
  first_seen DATE,
  description TEXT,
  ttps TEXT[],
  targets TEXT[],
  document_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_actors_name ON actors(name);
CREATE INDEX idx_actors_type ON actors(type);
CREATE INDEX idx_actors_targets ON actors USING GIN(targets);

-- MITRE techniques
CREATE TABLE techniques (
  id BIGSERIAL PRIMARY KEY,
  attack_id TEXT UNIQUE,
  name TEXT,
  tactic TEXT,
  description TEXT,
  detection TEXT,
  mitigation TEXT,
  examples JSONB,
  is_atlas BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_techniques_attack_id ON techniques(attack_id);
CREATE INDEX idx_techniques_tactic ON techniques(tactic);

-- AI threats
CREATE TABLE ai_threats (
  id BIGSERIAL PRIMARY KEY,
  document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  ai_category TEXT,
  target_system TEXT,
  technique TEXT,
  severity SMALLINT,
  discovered_at TIMESTAMPTZ,
  cve TEXT,
  mitre_atlas_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_threats_category ON ai_threats(ai_category);
CREATE INDEX idx_ai_threats_target ON ai_threats(target_system);

-- Graph edges (actor → sector → technique relationships)
CREATE TABLE graph_edges (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_value TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_value TEXT NOT NULL,
  relation TEXT NOT NULL,
  document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,
  confidence NUMERIC(3,2),
  ai_related BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_value, target_type, target_value, relation)
);

CREATE INDEX idx_graph_source ON graph_edges(source_type, source_value);
CREATE INDEX idx_graph_target ON graph_edges(target_type, target_value);
CREATE INDEX idx_graph_relation ON graph_edges(relation);
CREATE INDEX idx_graph_ai ON graph_edges(ai_related) WHERE ai_related = TRUE;

-- =====================================================
-- Junction tables (Phase 1, V2 plan — Tasks 1.1)
-- =====================================================

-- Document ↔ Threat Actor junction
CREATE TABLE IF NOT EXISTS document_actors (
  document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  actor_id INT REFERENCES actors(id) ON DELETE CASCADE,
  confidence SMALLINT DEFAULT 50,
  PRIMARY KEY (document_id, actor_id)
);

-- Document ↔ MITRE ATT&CK / ATLAS technique junction
CREATE TABLE IF NOT EXISTS document_techniques (
  document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  technique_id BIGINT REFERENCES techniques(id) ON DELETE CASCADE,
  is_atlas BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (document_id, technique_id)
);

-- Document ↔ CVE junction (CVE stored as text, e.g. CVE-2026-12345)
CREATE TABLE IF NOT EXISTS document_cves (
  document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  cve_id TEXT NOT NULL,
  cvss_v3 NUMERIC(4,1),
  epss NUMERIC(5,4),
  in_kev BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (document_id, cve_id)
);

-- Document ↔ IOC junction
CREATE TABLE IF NOT EXISTS document_iocs (
  document_id BIGINT REFERENCES documents(id) ON DELETE CASCADE,
  ioc_id BIGINT REFERENCES iocs(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, ioc_id)
);

CREATE INDEX IF NOT EXISTS idx_document_actors_actor ON document_actors(actor_id);
CREATE INDEX IF NOT EXISTS idx_document_techniques_tech ON document_techniques(technique_id);
CREATE INDEX IF NOT EXISTS idx_document_cves_cve ON document_cves(cve_id);
CREATE INDEX IF NOT EXISTS idx_document_iocs_ioc ON document_iocs(ioc_id);

-- CVE enrichment cache (NVD/EPSS/KEV data fetched per CVE)
CREATE TABLE IF NOT EXISTS cve_enrichment (
  cve_id TEXT PRIMARY KEY,
  cvss_v3 NUMERIC(4,1),
  epss NUMERIC(5,4),
  in_kev BOOLEAN DEFAULT FALSE,
  vendor TEXT,
  product TEXT,
  description TEXT,
  published_date DATE,
  last_enriched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Statistics view
CREATE VIEW stats_summary AS
SELECT
  (SELECT COUNT(*) FROM documents) AS total_documents,
  (SELECT COUNT(*) FROM documents WHERE published_at > NOW() - INTERVAL '24 hours') AS docs_24h,
  (SELECT COUNT(*) FROM documents WHERE published_at > NOW() - INTERVAL '7 days') AS docs_7d,
  (SELECT COUNT(*) FROM documents WHERE severity >= 8) AS critical_docs,
  (SELECT COUNT(*) FROM documents WHERE severity >= 5 AND severity < 8) AS high_docs,
  (SELECT COUNT(*) FROM documents WHERE ai_threat = TRUE) AS ai_threats,
  (SELECT COUNT(*) FROM iocs) AS total_iocs,
  (SELECT COUNT(*) FROM actors) AS total_actors,
  (SELECT COUNT(*) FROM sources WHERE enabled = TRUE) AS active_sources,
  (SELECT MAX(fetched_at) FROM documents) AS last_fetch;

-- Severity timeline view (günlük dağılım)
CREATE MATERIALIZED VIEW daily_severity AS
SELECT
  DATE_TRUNC('day', published_at) AS day,
  COUNT(*) FILTER (WHERE severity >= 8) AS critical,
  COUNT(*) FILTER (WHERE severity >= 5 AND severity < 8) AS high,
  COUNT(*) FILTER (WHERE severity >= 3 AND severity < 5) AS medium,
  COUNT(*) FILTER (WHERE severity < 3) AS low,
  COUNT(*) AS total
FROM documents
WHERE published_at > NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', published_at)
ORDER BY day DESC;

CREATE UNIQUE INDEX idx_daily_severity_day ON daily_severity(day);
