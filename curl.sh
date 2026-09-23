#!/usr/bin/env bash
# Everything Hands for Agents does, from a shell. No SDK, no account.
set -euo pipefail
MCP="${MCP:-https://mcp.handsforagents.com/mcp}"
API="${API:-https://api.handsforagents.com/v1}"
V="2025-11-25"

rpc() {  # rpc <method> <json-params>
  local method="$1" params="$2"
  curl -sSL "$MCP" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "MCP-Protocol-Version: $V" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
}

echo "### the tools"
rpc tools/list '{}' | jq -r '.result.tools[] | .name'

echo "### the price of the thing you want"
rpc tools/call '{"name":"list_services","arguments":{}}' \
  | jq -r '.result.structuredContent.pricing.examples[] | "\(.total_eur) EUR\t\(.turnaround)\t\(.task[0:60])"'

echo "### ask a human for a quote"
QUOTE=$(rpc tools/call '{"name":"request_quote","arguments":{
    "task":{"description":"3D-print 2 pcs of bracket.stl in black PETG, check the 3 hole distances with calipers.",
            "deliverables":"2 parts, photos, measured hole distances",
            "services":["make","ship"],"currency":"EUR"},
    "client":{"email":"ops@example.com","name":"Example Inc.","country":"US"},
    "agent":{"name":"example-agent"}}}')
echo "$QUOTE" | jq '.result.structuredContent | {quote_id, status, response_due_at, nda_url}'

ID=$(jq -r '.result.structuredContent.quote_id'     <<<"$QUOTE")
TOK=$(jq -r '.result.structuredContent.access_token' <<<"$QUOTE")

echo "### check on it later"
rpc tools/call "{\"name\":\"get_status\",\"arguments\":{\"id\":\"$ID\",\"access_token\":\"$TOK\"}}" \
  | jq '.result.structuredContent | {quote_id, status}'

echo "### the same over plain REST, if you do not speak MCP"
curl -sS "$API/services" | jq '{services: [.services[].id], hourly_rate: .pricing.hourly_rate_eur}'
curl -sS "$API/quotes/$ID" -H "Authorization: Bearer $TOK" | jq '{quote_id, status}'
