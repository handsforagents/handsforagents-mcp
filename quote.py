#!/usr/bin/env python3
"""Ask Hands for Agents for a quote. Standard library only.

    python quote.py
"""
import json
import urllib.request

BASE = "https://handsforagents.com"
V = "2026-07-28"


def rpc(method, params=None, name=None):
    params = dict(params or {})
    params["_meta"] = {"io.modelcontextprotocol/protocolVersion": V}
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": V,
        "Mcp-Method": method,
    }
    if name:
        headers["Mcp-Name"] = name
    req = urllib.request.Request(
        f"{BASE}/mcp",
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read())
    if "error" in body:
        raise RuntimeError(body["error"])
    return body["result"]


# 1. Read the catalogue before asking for anything. The refused categories are
#    in here, and a request that falls in one of them is a wasted round trip.
catalogue = rpc("tools/call", {"name": "list_services", "arguments": {}}, "list_services")["structuredContent"]
print("Refused outright:", ", ".join(c["id"] for c in catalogue["refused_categories"]))
print("Hourly rate:", catalogue["pricing"]["hourly_rate_eur"], "EUR; minimum",
      catalogue["pricing"]["minimum_task_price_eur"], "EUR\n")

# 2. Ask. This is not an order: nothing is charged and nothing is made until a
#    human answers with a fixed price and you accept it by e-mail.
answer = rpc("tools/call", {
    "name": "request_quote",
    "arguments": {
        "task": {
            "description": "Incoming inspection of one machined aluminium part: 15 dimensions "
                           "against the attached drawing, calipers and micrometer.",
            "deliverables": "PDF and CSV measurement report, photos",
            "services": ["measure"],
            "currency": "EUR",
            "input_files": ["https://example.com/part-drawing.pdf"],
        },
        "client": {"email": "ops@example.com", "name": "Example Inc.", "country": "US"},
        "agent": {"name": "procurement-agent"},
    },
}, "request_quote")

if answer["isError"]:
    raise SystemExit("Rejected: " + answer["content"][0]["text"])

q = answer["structuredContent"]
print(f"quote_id        {q['quote_id']}")
print(f"answer due by   {q['response_due_at']}")
print(f"answer goes to  {q['answer_channel']}")
print(f"NDA if needed   {q['nda_url']}")
print("\nKeep the access_token \u2014 it is the only way to read this quote back:")
print(q["access_token"])

# 3. Later.
status = rpc("tools/call", {
    "name": "get_status",
    "arguments": {"id": q["quote_id"], "access_token": q["access_token"]},
}, "get_status")
print("\n" + status["content"][0]["text"].splitlines()[0])
