-- 20260818_ai_taxonomy_reclassify.sql — Madde 3
-- arXiv cs.AI/cs.LG/cs.CR gibi 'ai_research' kaynaklarından gelen genel araştırma kayıtları
-- 'not_ai_security' kategorisine geçer ve documents.ai_threat=FALSE olur.
-- Sadece gerçek AI güvenlik tehditleri (adversarial-ai, prompt-injection, ai-incident vb.) ai_threat=TRUE kalır.

BEGIN;

-- 1) arXiv kaynaklarından 'research'/'general'/'content-safety' (eğer non-threat) kategorili
--    kayıtları documents.ai_threat=FALSE olarak işaretle
UPDATE documents d
SET ai_threat = FALSE
FROM ai_threats ai
WHERE d.id = ai.document_id
  AND d.source_id IN (SELECT id FROM sources WHERE category = 'ai_research')
  AND ai.ai_category IN ('research', 'general', 'content-safety');

-- 2) Bu dokümanların ai_threats satırlarını 'not_ai_security' olarak yeniden sınıflandır
UPDATE ai_threats ai
SET ai_category = 'not_ai_security',
    classification = 'not_ai_security'
FROM documents d
WHERE ai.document_id = d.id
  AND d.source_id IN (SELECT id FROM sources WHERE category = 'ai_research')
  AND ai.ai_category IN ('research', 'general', 'content-safety');

COMMIT;