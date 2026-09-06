#!/usr/bin/env bash
# Chama uma rotina do worker em produção.
#
#   bash .github/chamar.sh "sports?job=live"
#
# O segredo vai no cabeçalho Authorization, nunca na URL: query string aparece
# em log de servidor e de proxy. O bypass da proteção da Vercel, esse, só
# funciona como parâmetro — é como a plataforma o aceita.
#
# Nunca derruba o workflow: uma rotina que falha não deve impedir as outras de
# rodar. O código HTTP fica no log para quem quiser conferir.
set -uo pipefail

rota="$1"
sep='?'
case "$rota" in *\?*) sep='&' ;; esac

url="$APP_URL/api/workers/$rota"
[ -n "${VERCEL_BYPASS:-}" ] && url="$url${sep}x-vercel-protection-bypass=$VERCEL_BYPASS"

echo "→ $rota"
curl -sS --max-time 180 \
  -w '\n  HTTP %{http_code} em %{time_total}s\n' \
  -H "Authorization: Bearer $WORKER_SECRET" \
  "$url" || echo "  falhou, seguindo para a próxima"
