-- 20260818_ai_summary_cleanup.sql — Madde 1/2
-- Eski yanlış aktör/sektör/teknik metadata'sı ai_summary içine [actors: ...] blokları olarak
-- gömülmüştü. Bu blokları regex ile temizle (aggregate verilerle birlikte yeniden hesaplanacak).
-- Blade kalıbı: "... [actors: X · cves: Y · sectors: Z · ttps: ... · phase: P · severity: S] N words"
BEGIN;

UPDATE documents
SET ai_summary = regexp_replace(
      regexp_replace(
        ai_summary,
        -- [actors: ...] bloğunu kaldır
        '\s*\[actors:.*?\](\s*\d+\s*words)?',
        '',
        'ig'
      ),
      '\s{2,}',
      ' ',
      'g'
    )
WHERE ai_summary LIKE '%[actors:%'
  OR ai_summary LIKE '%[ttps:%';

COMMIT;