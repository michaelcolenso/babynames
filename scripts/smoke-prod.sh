#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://nobodynamed.com}"

echo "Smoke testing ${BASE_URL}"

check_json() {
  local path="$1"
  local code ctype
  code=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" "${BASE_URL}${path}")
  ctype=$(curl -sSI "${BASE_URL}${path}" | awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' | tr -d '\r')
  [[ "$code" == "200" ]] || { echo "FAIL ${path}: expected 200 got ${code}"; return 1; }
  [[ "$ctype" == application/json* ]] || { echo "FAIL ${path}: expected application/json got ${ctype}"; return 1; }
  echo "PASS ${path} (${code}, ${ctype})"
}

check_html_name_page() {
  local headers code location
  headers=$(curl -sSI "${BASE_URL}/name/emma/")
  code=$(awk 'tolower($1) ~ /^http\/1\.[01]$/ {print $2}' <<<"$headers" | tail -n1)
  location=$(awk -F': ' 'tolower($1)=="location"{print $2}' <<<"$headers" | tr -d '\r')
  if [[ "$code" == "301" || "$code" == "302" ]]; then
    if [[ "$location" == "/" ]]; then
      echo "FAIL /name/emma/: redirected to /"
      return 1
    fi
  fi
  echo "PASS /name/emma/ (status ${code:-unknown})"
}

check_xml() {
  local path="/sitemap.xml" code ctype
  code=$(curl -sS -o /tmp/smoke_body -w "%{http_code}" "${BASE_URL}${path}")
  ctype=$(curl -sSI "${BASE_URL}${path}" | awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' | tr -d '\r')
  [[ "$code" == "200" ]] || { echo "FAIL ${path}: expected 200 got ${code}"; return 1; }
  [[ "$ctype" == application/xml* || "$ctype" == text/xml* ]] || { echo "FAIL ${path}: expected xml content-type got ${ctype}"; return 1; }
  echo "PASS ${path} (${code}, ${ctype})"
}

check_json "/api/meta"
check_json "/api/search?q=emma"
check_json "/api/name/emma"
check_json "/api/landing/rising"
check_html_name_page
check_xml

echo "All smoke checks passed."
