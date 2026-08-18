-- 20260818_ai_taxonomy_osv_reclassify.sql — Madde 6 (destructive-clean, idempotent)
BEGIN;

-- 1) OSV.dev kaynaklı TÜM ai_threat kayıtlarını FALSE yap
UPDATE documents SET ai_threat = FALSE WHERE source_id = 6 AND ai_threat = TRUE;

-- 2) Bu dokümanların TÜM ai_threats kayıtlarını sil (tekil envanter için yeniden ekleyeceğiz)
DELETE FROM ai_threats ai USING documents d WHERE ai.document_id = d.id AND d.source_id = 6;

-- 3) Te'kil not_ai_security envanteri ekle (ai_threat=FALSE dokümanlar için)
INSERT INTO ai_threats (document_id, ai_category, classification, confidence)
SELECT d.id, 'not_ai_security', 'not_ai_security', 9
FROM documents d
WHERE d.source_id = 6 AND d.ai_threat = FALSE
  AND NOT EXISTS (SELECT 1 FROM ai_threats a WHERE a.document_id = d.id AND a.ai_category = 'not_ai_security')
ON CONFLICT (document_id, ai_category) DO NOTHING;

COMMIT;