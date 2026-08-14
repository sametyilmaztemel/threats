-- =====================================================
-- Migration 001: extract CVE references from documents.cves[]
-- text[] array  →  document_cves junction table
-- Phase 1, V2 plan — Task 1.2
-- =====================================================
-- Idempotent: ON CONFLICT DO NOTHING ensures re-running is safe.

INSERT INTO document_cves (document_id, cve_id)
SELECT id, unnest(cves)
FROM documents
WHERE cves IS NOT NULL AND array_length(cves, 1) > 0
ON CONFLICT DO NOTHING;
