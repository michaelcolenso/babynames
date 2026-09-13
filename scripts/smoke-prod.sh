#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://nobodynamed.com}"

echo "Smoke testing ${BASE_URL}"

# Every probe reads status, Content-Type, and Location from a single GET
# response. `curl -I` is deliberately not used: the /api/* routes implement no
# HEAD handler, so a HEAD probe receives Pages' 404 HTML page and reports the
# wrong status and content type for every API check (which made this script fail
# on its first assertion, so it was not actually guarding the site).
SMOKE_CODE=""
SMOKE_CTYPE=""
SMOKE_LOCATION=""

probe() {
  local headers=/tmp/smoke_headers
  SMOKE_CODE=$(curl -sS -D "$headers" -o /tmp/smoke_body -w "%{http_code}" "${BASE_URL}${1}")
  SMOKE_CTYPE=$(awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' "$headers" | tail -n1 | tr -d '\r')
  SMOKE_LOCATION=$(awk -F': ' 'tolower($1)=="location"{print $2}' "$headers" | tail -n1 | tr -d '\r')
}

expect_type() {
  local path="$1"
  local expected="$2"
  probe "$path"
  [[ "$SMOKE_CODE" == "200" ]] || { echo "FAIL ${path}: expected 200 got ${SMOKE_CODE}"; return 1; }
  [[ "$SMOKE_CTYPE" == "$expected"* ]] || { echo "FAIL ${path}: expected ${expected} got ${SMOKE_CTYPE}"; return 1; }
  echo "PASS ${path} (${SMOKE_CODE}, ${SMOKE_CTYPE})"
}

check_json() {
  expect_type "$1" "application/json"
}

check_xml() {
  probe "/sitemap.xml"
  [[ "$SMOKE_CODE" == "200" ]] || { echo "FAIL /sitemap.xml: expected 200 got ${SMOKE_CODE}"; return 1; }
  case "$SMOKE_CTYPE" in
    application/xml*|text/xml*) ;;
    *) echo "FAIL /sitemap.xml: expected xml content-type got ${SMOKE_CTYPE}"; return 1 ;;
  esac
  echo "PASS /sitemap.xml (${SMOKE_CODE}, ${SMOKE_CTYPE})"
}

# A zone-level intercept has answered this path with a foreign 404 page before
# (see apps/web/functions/metrics/index.ts). Assert the body as well as the
# content type, so a reintroduced intercept fails loudly instead of passing on a
# plausible-looking status code.
check_metrics() {
  expect_type "/metrics" "application/javascript"
  grep -q "no-op" /tmp/smoke_body || { echo "FAIL /metrics: body is not the Pages no-op placeholder (zone-level intercept?)"; return 1; }
  echo "PASS /metrics body"
}

check_html_name_page() {
  probe "/name/emma/"
  if [[ "$SMOKE_CODE" == "301" || "$SMOKE_CODE" == "302" ]]; then
    if [[ "$SMOKE_LOCATION" == "/" ]]; then
      echo "FAIL /name/emma/: redirected to /"
      return 1
    fi
  fi
  echo "PASS /name/emma/ (status ${SMOKE_CODE:-unknown})"
}

check_json "/api/meta"
check_json "/api/search?q=emma"
check_json "/api/name/emma"
check_json "/api/landing/rising"
check_html_name_page
check_xml
check_metrics

echo "All smoke checks passed."
