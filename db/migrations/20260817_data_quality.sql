-- 20260817_data_quality.sql — schema-level fixes for data-quality issues
-- Idempotent; safe to re-run.

BEGIN;

-- 1) Confidence/match_reason/classification columns for richer auditability
ALTER TABLE document_actors ADD COLUMN IF NOT EXISTS match_reason TEXT;
ALTER TABLE document_actors ADD COLUMN IF NOT EXISTS matched_text TEXT;
ALTER TABLE document_actors ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT 'regex_text';

ALTER TABLE document_techniques ADD COLUMN IF NOT EXISTS match_reason TEXT;
ALTER TABLE document_techniques ADD COLUMN IF NOT EXISTS matched_text TEXT;

ALTER TABLE document_cves ADD COLUMN IF NOT EXISTS match_reason TEXT;
ALTER TABLE document_cves ADD COLUMN IF NOT EXISTS matched_text TEXT;

ALTER TABLE iocs ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'observed';
ALTER TABLE iocs ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT 'regex_text';
ALTER TABLE iocs ADD COLUMN IF NOT EXISTS source_document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE ai_threats ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'adversarial_ai';
ALTER TABLE ai_threats ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT 'keyword_match';
ALTER TABLE ai_threats ADD COLUMN IF NOT EXISTS confidence SMALLINT DEFAULT 50;

-- 2) Canonical CVSS: invalid values → NULL
UPDATE cve_enrichment SET cvss_v3 = NULL
  WHERE cvss_v3 IS NOT NULL AND (cvss_v3 < 0 OR cvss_v3 > 10);

UPDATE documents SET severity = NULL WHERE severity IS NOT NULL AND (severity < 0 OR severity > 10);

-- 3) Remove duplicate junction rows BEFORE adding the unique constraint
-- (keep the lowest id row in each duplicate group)
DELETE FROM ai_threats a USING ai_threats b
  WHERE a.id > b.id AND a.document_id = b.document_id AND a.ai_category = b.ai_category;

DELETE FROM iocs a USING iocs b
  WHERE a.id > b.id AND a.value = b.value AND a.type = b.type;

-- 4) Composite uniqueness (idempotent guards)
DO $$ BEGIN
  BEGIN
    ALTER TABLE document_actors ADD CONSTRAINT uq_doc_actor_pair UNIQUE (document_id, actor_id);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE document_techniques ADD CONSTRAINT uq_doc_tech_pair UNIQUE (document_id, technique_id);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE document_cves ADD CONSTRAINT uq_doc_cve_pair UNIQUE (document_id, cve_id);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE ai_threats ADD CONSTRAINT uq_ai_threat_doc UNIQUE (document_id, ai_category);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE iocs ADD CONSTRAINT uq_ioc_value_type UNIQUE (value, type);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL;
  END;
END $$;

-- 5) Severity enum constraint for documents.severity
DO $$ BEGIN
  BEGIN
    ALTER TABLE documents ADD CONSTRAINT chk_documents_severity
      CHECK (severity IS NULL OR (severity >= 0 AND severity <= 10));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE cve_enrichment ADD CONSTRAINT chk_cve_cvss
      CHECK (cvss_v3 IS NULL OR (cvss_v3 >= 0 AND cvss_v3 <= 10));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TABLE documents ADD CONSTRAINT chk_documents_quality
      CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100));
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 6) Indexes for the new lookup patterns (facets, AI threats, IOC classification)
CREATE INDEX IF NOT EXISTS idx_documents_ai_threat_only
  ON documents (fetched_at DESC) WHERE ai_threat = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_threats_category_only
  ON ai_threats (ai_category);
CREATE INDEX IF NOT EXISTS idx_iocs_classification ON iocs (classification);
CREATE INDEX IF NOT EXISTS idx_doc_actors_actor_reason
  ON document_actors (actor_id, match_reason);

COMMIT;
