#!/usr/bin/env bash
# Everything Hands for Agents does, from a shell. No SDK, no account.
set -euo pipefail
BASE="${BASE:-https://handsforagents.com}"
V="2026-07-28"

rpc() {  # rpc <method> <json-params> [tool-name]
  local method="$1" params="$2" name="${3:-}"
  local hdr=(-H "Content-Type: application/json"
             -H "Accept: application/json, text/event-stream"
             -H "MCP-Protocol-Version: $V"
             -H "Mcp-Method: $method")
  [[ -n "$name" ]] && hdr+=(-H "Mcp-Name: $name")
  curl -sS "$BASE/mcp" "${hdr[@]}" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",
      \"params\":$(jq -c '. + {_meta:{"io.modelcontextprotocol/protocolVersion":"'"$V"'"}}' <<<"$params")}"
}

echo "### what the server is"
rpc server/discover '{}' | jq '.result | {supportedVersions, instructions}'

echo "### the tools"
rpc tools/list '{}' | jq -r '.result.tools[] | "\(.name)\t\(.title)"'

echo "### the price of the thing you want"
rpc tools/call '{"name":"list_services","arguments":{}}' list_services \
  | jq -r '.result.structuredContent.pricing.examples[] | "\(.total_eur) EUR\t\(.turnaround)\t\(.task[0:60])"'

echo "### ask a human for a quote"
QUOTE=$(rpc tools/call '{"name":"request_quote","arguments":{
    "task":{"description":"3D-print 2 pcs of bracket.stl in black PETG, check the 3 hole distances with calipers.",
            "deliverables":"2 parts, photos, measured hole distances",
            "services":["make","ship"],"currency":"EUR"},
    "client":{"email":"ops@example.com","name":"Example Inc.","country":"US"},
    "agent":{"name":"example-agent"}}}' request_quote)
echo "$QUOTE" | jq '.result.structuredContent | {quote_id, response_due_at, nda_url}'

ID=$(jq -r '.result.structuredContent.quote_id'     <<<"$QUOTE")
TOK=$(jq -r '.result.structuredContent.access_token' <<<"$QUOTE")

echo "### check on it later"
rpc tools/call "{\"name\":\"get_status\",\"arguments\":{\"id\":\"$ID\",\"access_token\":\"$TOK\"}}" get_status \
  | jq -r '.result.content[0].text' | head -1

echo "### the same three things over plain REST, if you do not speak MCP"
curl -sS "$BASE/v1/services" | jq '{services: [.services[].id], hourly_rate: .pricing.hourly_rate_eur}'
curl -sS "$BASE/v1/quotes/$ID" -H "Authorization: Bearer $TOK" | jq '{quote_id, status}'
