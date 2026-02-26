#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
REPORT_ID="${1:-${REPORT_ID:-}}"
ACCESS_TOKEN="${2:-${ACCESS_TOKEN:-}}"

if [[ -z "${REPORT_ID}" ]]; then
  echo "Usage: $0 <report_id> [access_token]"
  echo "  or: REPORT_ID=<report_id> ACCESS_TOKEN=<token> $0"
  exit 1
fi

if [[ -z "${ACCESS_TOKEN}" ]]; then
  echo "Error: access token is required."
  echo "Set ACCESS_TOKEN or pass as 2nd argument."
  exit 1
fi

URL="${BASE_URL}/api/reports/${REPORT_ID}/diagnostics"

echo "[INFO] Requesting diagnostics..."
RAW_AND_CODE="$(curl -sS -H "Authorization: Bearer ${ACCESS_TOKEN}" -w '\n%{http_code}' "${URL}")"
RAW="$(echo "${RAW_AND_CODE}" | sed '$d')"
HTTP_CODE="$(echo "${RAW_AND_CODE}" | tail -n 1)"

if [[ "${HTTP_CODE}" != "200" ]]; then
  echo "[ERROR] diagnostics request failed (status=${HTTP_CODE})."
  if [[ "${HTTP_CODE}" == "401" ]]; then
    echo "[HINT] 認証に失敗しています。ACCESS_TOKEN が未設定/期限切れ/形式不正の可能性があります。"
    echo "  - ACCESS_TOKEN は 'Bearer ' を含めず、JWT本体のみを指定してください。"
    echo "  - 例: export ACCESS_TOKEN='eyJhbGciOi...'"
  fi
  echo
  echo "[RAW]"
  echo "${RAW}"
  echo
  echo "[DONE] ${URL}"
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  echo "[INFO] Summary:"
  echo "${RAW}" | jq '{
    report: { id: .report.id, status: .report.status, job_id: .report.job_id },
    inputs: { total: .inputs.total, by_type: .inputs.by_type, missing_url_count: (.inputs.with_missing_url | length) },
    events: (.job_logs | map(.event_type) | unique),
    upload_result: ((.job_logs | map(select(.event_type=="agent_inputs_uploaded")) | .[0].payload_json) // {}),
    agent: {
      job_ok: (.agent.job.ok // false),
      intermediate_ok: (.agent.intermediate.ok // false)
    },
    langsmith: .langsmith
  }'

  INPUTS_TOTAL="$(echo "${RAW}" | jq -r '.inputs.total // 0')"
  JOB_ID="$(echo "${RAW}" | jq -r '.report.job_id // ""')"
  HAS_JOB_CREATED="$(echo "${RAW}" | jq -r 'any(.job_logs[]?; .event_type=="job_created")')"
  HAS_INPUT_SELECTED="$(echo "${RAW}" | jq -r 'any(.job_logs[]?; .event_type=="input_files_selected")')"
  HAS_INPUT_UPLOADED="$(echo "${RAW}" | jq -r 'any(.job_logs[]?; .event_type=="agent_inputs_uploaded")')"
  AGENT_JOB_OK="$(echo "${RAW}" | jq -r '.agent.job.ok // false')"
  AGENT_INTERMEDIATE_OK="$(echo "${RAW}" | jq -r '.agent.intermediate.ok // false')"
else
  echo "[WARN] jq not found. Raw response:"
  echo "${RAW}"
  # Best-effort fallback without jq
  INPUTS_TOTAL=0
  JOB_ID=""
  HAS_JOB_CREATED=false
  HAS_INPUT_SELECTED=false
  HAS_INPUT_UPLOADED=false
  AGENT_JOB_OK=false
  AGENT_INTERMEDIATE_OK=false
fi

pass() { echo "[PASS] $1"; }
fail() { echo "[FAIL] $1"; }

echo
echo "[CHECK]"
if [[ "${INPUTS_TOTAL}" =~ ^[0-9]+$ ]] && (( INPUTS_TOTAL > 0 )); then pass "アップロードデータあり (inputs.total=${INPUTS_TOTAL})"; else fail "アップロードデータなし"; fi
if [[ -n "${JOB_ID}" ]]; then pass "job_id 生成済み (${JOB_ID})"; else fail "job_id 未生成"; fi
if [[ "${HAS_JOB_CREATED}" == "true" ]]; then pass "job_created ログあり"; else fail "job_created ログなし"; fi
if [[ "${HAS_INPUT_SELECTED}" == "true" ]]; then pass "input_files_selected ログあり"; else fail "input_files_selected ログなし"; fi
if [[ "${HAS_INPUT_UPLOADED}" == "true" ]]; then pass "agent_inputs_uploaded ログあり"; else fail "agent_inputs_uploaded ログなし"; fi
if [[ "${AGENT_JOB_OK}" == "true" ]]; then pass "job_id で agent /jobs/{id} 参照可能"; else fail "agent /jobs/{id} 参照不可"; fi
if [[ "${AGENT_INTERMEDIATE_OK}" == "true" ]]; then pass "agent /jobs/{id}/intermediate 参照可能"; else fail "agent /jobs/{id}/intermediate 参照不可"; fi

echo
echo "[DONE] ${URL}"
