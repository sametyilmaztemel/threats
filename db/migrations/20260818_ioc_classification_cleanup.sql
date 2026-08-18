-- 20260818_ioc_classification_cleanup.sql — Madde 5
-- Public infrastructure domainleri IOC olarak 'mentioned' (not malicious) işaretle
-- Private/loopback/unspecified IP'leri listeden çıkar
-- Document-IOC ilişkilerini yeniden temizle

BEGIN;

-- 1) Public infrastructure domainler → 'mentioned'
UPDATE iocs SET classification='mentioned', confidence=9
WHERE type='domain' AND (
    value ~* '^(github|microsoft|google|cloudflare|amazonaws|azure|localhost|aws|gstatic|w3\.org|mozilla|gnu|googleapis)\.(com|org|net|io|dev)$'
    OR value IN ('github.com','microsoft.com','google.com','cloudflare.com','amazonaws.com','azure.com',
                 'googleapis.com','gstatic.com','w3.org','mozilla.org','gnu.org','localhost','localhost.localdomain',
                 'tld-list.com','iana.org')
);

-- 2) Loopback/unspecified/reserved IP'leri çıkar (document_iocs ve iocs'tan)
DELETE FROM document_iocs WHERE ioc_id IN (SELECT id FROM iocs WHERE value IN ('0.0.0.0','127.0.0.1','255.255.255.255','::1','::') OR value ~ '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)');
DELETE FROM iocs WHERE value IN ('0.0.0.0','127.0.0.1','255.255.255.255','::1','::') OR value ~ '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)';

-- 3) Source/original URL domainlerini document_iocs'tan kaldır
-- (document.url içindeki domain'leri IOC olarak göstermiyoruz)
DELETE FROM document_iocs di
USING documents d, iocs i
WHERE di.document_id = d.id
  AND di.ioc_id = i.id
  AND i.type IN ('domain','malicious_url')
  AND d.url IS NOT NULL
  AND d.url ILIKE '%' || i.value || '%';

COMMIT;