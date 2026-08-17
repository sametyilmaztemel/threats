-- 20260817_data_quality_dedup.sql — duplicate temizliği
-- (Önce çalıştır: 20260817_data_quality_dedup.sql)
BEGIN;

-- ai_threats duplicate (document_id, ai_category) → en düşük id'yi tut
DELETE FROM ai_threats a USING ai_threats b
  WHERE a.id > b.id AND a.document_id = b.document_id AND a.ai_category = b.ai_category;

-- iocs duplicate (value, type) → en düşük id'yi tut
DELETE FROM iocs a USING iocs b
  WHERE a.id > b.id AND a.value = b.value AND a.type = b.type;

COMMIT;
