#!/usr/bin/env node
/**
 * handsforagents-mcp — stdio bridge to the Hands for Agents MCP server.
 *
 * The real server is remote (https://mcp.handsforagents.com/mcp, Streamable HTTP).
 * This package exists for clients that only speak stdio, and so that the server
 * is findable on npm. It adds nothing of its own: every tools/list and
 * tools/call is forwarded to the remote endpoint unchanged.
 *
 * If your client supports remote MCP servers, point it straight at
 * https://mcp.handsforagents.com/mcp and skip this package.
 *
 * Usage:
 *   npx handsforagents-mcp
 *   HANDSFORAGENTS_URL=https://staging.example.com/mcp npx handsforagents-mcp
 *
 * No dependencies. Node 18+ (for global fetch).
 */

import process from "node:process";

const REMOTE = process.env.HANDSFORAGENTS_URL || "https://mcp.handsforagents.com/mcp";
const MODERN = "2026-07-28";
const LEGACY_FALLBACK = "2025-06-18";
// Version sent to the remote server; it must be one the server supports.
const REMOTE_PROTOCOL = "2025-11-25";
const PKG_VERSION = "0.2.1";
const TIMEOUT_MS = Number(process.env.HANDSFORAGENTS_TIMEOUT_MS || 30000);

const SERVER_INFO = { name: "handsforagents", title: "Hands for Agents", version: PKG_VERSION };

const INSTRUCTIONS =
  "Human-operated physical-world service for AI agents, run by a registered Czech (EU) company. " +
  "A person designs, makes, assembles, measures, tests, verifies on site, receives and ships physical " +
  "things, and documents the work with evidence. Call list_services first: it carries the refused " +
  "categories, the prices and the contract terms. Flow: request_quote (returns quote_id and access_token; " +
  "a human answers within 24 hours) -> get_status until quoted or refused -> create_task -> pay the " +
  "Stripe Checkout URL -> get_status -> confirm_delivery. Keep the access_token: it is the only key to " +
  "the quote and the task. Payment is by card in EUR or USD; no cryptocurrency. " +
  "The contract is with the operator of the agent, not the agent.";

// --------------------------------------------------------------------------
// stdio framing: newline-delimited JSON, as the MCP stdio transport defines
// --------------------------------------------------------------------------

function write(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function result(id, value) {
  write({ jsonrpc: "2.0", id, result: value });
}

function failure(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  write({ jsonrpc: "2.0", id, error });
}

/** Log to stderr only. Anything on stdout that is not JSON-RPC breaks the client. */
function note(...args) {
  if (process.env.HANDSFORAGENTS_DEBUG) console.error("[handsforagents-mcp]", ...args);
}

// --------------------------------------------------------------------------
// Remote call
// --------------------------------------------------------------------------

async function callRemote(method, params, name) {
  const body = {
    jsonrpc: "2.0",
    id: Math.floor(Math.random() * 1e9),
    method,
    params: {
      ...params,
      _meta: {
        ...(params._meta || {}),
        "io.modelcontextprotocol/protocolVersion": REMOTE_PROTOCOL,
        "io.modelcontextprotocol/clientInfo": { name: "handsforagents-mcp", version: PKG_VERSION },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "User-Agent": `handsforagents-mcp/${PKG_VERSION} (+https://handsforagents.com)`,
    "MCP-Protocol-Version": REMOTE_PROTOCOL,
    "Mcp-Method": method,
  };
  if (name !== undefined) {
    // The spec's Base64 sentinel, for a name that is not plain ASCII.
    headers["Mcp-Name"] = /^[\x21-\x7e]+$/.test(name)
      ? name
      : `=?base64?${Buffer.from(name, "utf8").toString("base64")}?=`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(REMOTE, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${REMOTE} returned ${response.status} and a body that is not JSON: ${text.slice(0, 200)}`);
    }
    if (parsed.error) {
      const e = new Error(parsed.error.message || "Remote error");
      e.rpc = parsed.error;
      throw e;
    }
    return parsed.result;
  } finally {
    clearTimeout(timer);
  }
}

// --------------------------------------------------------------------------
// Request handling
// --------------------------------------------------------------------------

async function handle(message) {
  const { id, method, params = {} } = message;

  // Notifications get no reply.
  if (id === undefined || id === null) {
    note("notification", method);
    return;
  }

  try {
    switch (method) {
      // Legacy era: a stdio client that opens with initialize.
      case "initialize": {
        const wanted = typeof params.protocolVersion === "string" ? params.protocolVersion : null;
        const known = [MODERN, "2025-11-25", "2025-06-18", "2025-03-26"];
        result(id, {
          protocolVersion: wanted && known.includes(wanted) ? wanted : LEGACY_FALLBACK,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
        return;
      }

      // Modern era: the stdio backward-compatibility probe.
      case "server/discover": {
        const remote = await callRemote("server/discover", {});
        result(id, remote);
        return;
      }

      case "ping":
        result(id, {});
        return;

      case "tools/list": {
        const remote = await callRemote("tools/list", params);
        // Hand the client only what its own era understands.
        result(id, { tools: remote.tools || [] });
        return;
      }

      case "tools/call": {
        const remote = await callRemote("tools/call", params, params.name);
        const out = { content: remote.content || [], isError: Boolean(remote.isError) };
        if (remote.structuredContent !== undefined) out.structuredContent = remote.structuredContent;
        result(id, out);
        return;
      }

      case "resources/list":
        result(id, { resources: [] });
        return;

      case "prompts/list":
        result(id, { prompts: [] });
        return;

      default:
        failure(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (err.rpc) {
      failure(id, err.rpc.code ?? -32603, err.rpc.message, err.rpc.data);
      return;
    }
    const reason =
      err.name === "AbortError"
        ? `No answer from ${REMOTE} within ${TIMEOUT_MS} ms.`
        : `Cannot reach ${REMOTE}: ${err.message}`;
    // A tool call fails as a tool error so the model can react; everything else
    // is a protocol error.
    if (method === "tools/call") {
      result(id, { content: [{ type: "text", text: reason }], isError: true });
    } else {
      failure(id, -32603, reason);
    }
  }
}

// --------------------------------------------------------------------------
// Read stdin line by line
// --------------------------------------------------------------------------

let buffer = "";
let inFlight = 0;
let stdinEnded = false;

function maybeExit() {
  if (stdinEnded && inFlight === 0) process.exit(0);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      failure(null, -32700, "Parse error: the line is not valid JSON.");
      continue;
    }
    if (Array.isArray(message)) {
      failure(null, -32600, "Batches are not supported. Send one JSON-RPC message per line.");
      continue;
    }
    inFlight++;
    handle(message)
      .catch((err) => note("unhandled", err))
      .finally(() => {
        inFlight--;
        maybeExit();
      });
  }
});

// Do not exit while a forwarded request is still in the air: a client that
// closes stdin immediately after writing would otherwise lose the answers.
process.stdin.on("end", () => {
  stdinEnded = true;
  maybeExit();
});
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

note("bridging stdio to", REMOTE);
