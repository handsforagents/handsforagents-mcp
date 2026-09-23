# Hands for Agents — MCP server

**A person in the Czech Republic (EU) makes, assembles, measures, verifies and ships physical things for your agent, and sends the operator an invoice.**

Your agent can call an API for almost anything except the physical world. This is the physical world: FDM 3D printing in-house, CNC / sheet metal / laser / welding through Czech subcontractors, assembly and commissioning of hardware, dimensional inspection, human testing of a device, on-site verification anywhere in the Czech Republic, and receive-repack-ship with customs paperwork. Every task ends with an evidence package — timestamped photos, a measurement report with the instrument and its resolution, a test log, a tracking number, and the name of the person who did the work.

- **MCP endpoint:** `https://mcp.handsforagents.com/mcp` (Streamable HTTP)
- **REST:** `https://api.handsforagents.com/v1/services`
- **Everything machine-readable:** [llms.txt](https://handsforagents.com/llms.txt) · [services.json](https://handsforagents.com/services.json) · [openapi.yaml](https://handsforagents.com/openapi.yaml)

## Install

Point any client that supports remote MCP servers straight at the endpoint:

```json
{
  "mcpServers": {
    "handsforagents": {
      "type": "http",
      "url": "https://mcp.handsforagents.com/mcp"
    }
  }
}
```

For a client that only speaks stdio, this package bridges to the same endpoint and adds nothing of its own:

```json
{
  "mcpServers": {
    "handsforagents": {
      "command": "npx",
      "args": ["-y", "handsforagents-mcp"]
    }
  }
}
```

No API key, no account, no registration. `list_services` and `request_quote` are open; the other tools need the `access_token` that `request_quote` handed you.

## Tools

| Tool | What it does |
| --- | --- |
| `list_services` | The seven services, the refused categories, seven example prices, the payment rules and the key contract terms. Byte for byte the same document as `/services.json`. |
| `request_quote` | Sends a task to a human for screening and a fixed-price quote. Not an order, not binding, nothing charged. Returns `quote_id`, `access_token`, `response_due_at` and `nda_url`. A human answers within 24 hours. |
| `create_task` | Accepts a quote and the terms of service. Returns `task_id` and a Stripe Checkout URL for the first payment: the full price or a card hold (tasks up to 150 EUR), or the deposit (tasks above). |
| `get_status` | Reads a quote or a task back: the quote with its payment schedule or the refusal reason, later the task status, payments, evidence files and tracking numbers, and the Checkout URL for the balance when it is due. |
| `confirm_delivery` | `accepted=true` closes the task; `accepted=false` with a reason opens a dispute, answered by a human within 2 business days. Without either, the task counts as accepted 7 days after delivery. |

The same five operations are available over REST, described in [openapi.yaml](https://handsforagents.com/openapi.yaml).

## Try it without installing anything

```bash
curl -sL https://mcp.handsforagents.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2025-11-25' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Or without MCP at all:

```bash
curl -s https://api.handsforagents.com/v1/services | head -40
```

## What it costs

There is no catalogue. A human quotes every task as one fixed total in EUR or USD, built from **45 EUR/hour** plus materials, subcontractors and carrier cost at cost. Minimum 45 EUR. Seven worked examples are in `list_services` — a printed PETG bracket checked with calipers and shipped tracked to Germany comes to 70 EUR, on-site verification of a business address with ten geotagged photos to 105 EUR.

Payment is by card through Stripe Checkout, in full (or as a card hold for short tasks) up to 150 EUR, deposit plus balance above it, with the balance due after you have seen the evidence package and before the item ships. **No cryptocurrency, no cash, no anonymous payment of any kind** — deliberately, so that every client is identifiable and every task has an invoice.

## What it will not do

A human reads every request before a quote is issued; nothing is accepted automatically. Refused outright: anything needing login credentials or account access, impersonation, surveillance of people, fake reviews and engagement, getting around identity/age/CAPTCHA/KYC verification, referral and coupon fraud, weapons and export-controlled dual-use goods, counterfeits, reshipping goods bought with someone else's card, and anything illegal in the Czech Republic or the EU. Three further categories — confirming a person's identity, signing a document, receiving a parcel addressed to a third party — are accepted only after the operator has been verified.

Also outside the capability: safety-critical parts (medical, food-contact, pressure, lifting) without a separate written engineering agreement, in-person work outside the Czech Republic, and storage beyond 30 days.

## Who you are contracting with

`your engineering s.r.o.`, company ID (IČO) 09738100, Jaurisova 515/4, Michle, 140 00 Praha 4, Czech Republic. Registered 9 December 2020, file C 341512 at the Municipal Court in Prague. Verify it yourself: [justice.cz](https://or.justice.cz/ias/ui/rejstrik-$firma?ico=09738100) · [ARES, as JSON](https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/09738100).

The contract is with the **operator** of the agent — the company or person on whose behalf it acts — because an agent has no legal personality. Czech law, courts in Prague for business clients, consumers keep their home protections.

Everything you send is **confidential by default** from the first `request_quote`, without marking anything and without signing anything, for the task and three years after. A pre-filled one-way [NDA](https://handsforagents.com/nda.html) is there if you need a signed document.

Full terms: [terms](https://handsforagents.com/terms.html) · [task policy](https://handsforagents.com/task-policy.html) · [disputes and refunds](https://handsforagents.com/disputes.html) · [privacy](https://handsforagents.com/privacy.html) · [DPA](https://handsforagents.com/dpa.html)

## Honest status

The service opened in September 2026 and **no tasks have been completed yet**; the statistics on the site say so and will be updated monthly. Liability insurance is being arranged and is not yet in force — the site says that too, rather than implying otherwise. Completed tasks will be published here as anonymised examples with their evidence packages, with the client's consent.

## Security

Found something? `security@handsforagents.com`, or see [security.txt](https://handsforagents.com/.well-known/security.txt).

## Licence

MIT for this bridge package. The service itself is governed by the terms of service linked above.
