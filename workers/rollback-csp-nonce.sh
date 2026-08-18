#!/bin/bash
# rollback-csp-nonce.sh — CSP nonce Worker cutover'dan acil dönüş.
# Kullanım: bash workers/rollback-csp-nonce.sh
# Yaptıkları:
#   1. threats.0rce.com/* Worker route'unu siler (production eski tunnel+CF cache'e döner)
#   2. Sanity: threats.0rce.com/ hâlâ 200 mü
set -e
ZONE="2731405d4976bc772bdf204e21b653bc"
EMAIL="${CF_EMAIL:-sametyilmaztemel@gmail.com}"
KEY="${CF_GLOBAL_KEY:-c962ebd89fcbfb0c9c84a0bc6018d5aca2d31}"

echo "[rollback] threats.0rce.com/* worker route'u aranıyor..."
ROUTE_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones/${ZONE}/workers/routes" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin)['result']; print(next((x['id'] for x in r if x.get('pattern')=='threats.0rce.com/*'), ''))")

if [ -n "$ROUTE_ID" ]; then
  curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/${ZONE}/workers/routes/${ROUTE_ID}" \
    -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" >/dev/null
  echo "[rollback] threats.0rce.com/* worker route SİLİNDİ (${ROUTE_ID})"
else
  echo "[rollback] threats.0rce.com/* worker route yok — zaten tunnel'a dönük"
fi

echo "[rollback] purge..."
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE}/purge_cache" \
  -H "X-Auth-Email: ${EMAIL}" -H "X-Auth-Key: ${KEY}" -H "Content-Type: application/json" \
  -d '{"purge_everything":true}' >/dev/null

echo "[rollback] sanity check..."
sleep 10
curl -s -o /dev/null -w "threats.0rce.com/ -> HTTP %{http_code}\n" --max-time 20 https://threats.0rce.com/
echo "[rollback] tamam — CSP nonce Worker devre dışı, eski tunnel+CF cache durumu geri döndü."
