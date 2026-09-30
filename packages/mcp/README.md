<img src="https://github.com/tripolskypetr/backtest-kit/raw/refs/heads/master/assets/consciousness.svg" height="45px" align="right">

# 🤖 @tradeforge/mcp

> Model Context Protocol server for [tradeforge](https://www.npmjs.com/package/tradeforge). Lets an LLM agent (Claude, or any MCP client) watch your live trading portfolio and open, average or close positions — through **five guarded tools**, while the trading engine keeps every level, limit and validation on its side.

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tripolskypetr/backtest-kit)
[![npm](https://img.shields.io/npm/v/@tradeforge/mcp.svg?style=flat-square)](https://npmjs.org/package/@tradeforge/mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)]()

📚 **[Docs](https://backtest-kit.github.io/documents/article_07_ai_news_trading_signals.html)** · 🌟 **[Reference implementation](https://github.com/tripolskypetr/backtest-kit/tree/master/example)** · 🐙 **[GitHub](https://github.com/tripolskypetr/backtest-kit)**

```bash
npm install @tradeforge/mcp tradeforge @modelcontextprotocol/sdk
```

**In the trading process** — register an MCP schema and expose the HTTP bridge:

```typescript
import { addMCPSchema } from 'tradeforge';
import { serve } from '@tradeforge/mcp';

addMCPSchema({
  mcpName: 'my-mcp',
  strategyName: 'my-strategy', // the strategy whose live instances the agent sees
});

serve(); // HTTP bridge on 127.0.0.1:60051 (CC_MCP_HOST / CC_MCP_PORT)
```

**In the MCP client** (e.g. `.mcp.json` for Claude Code) — run the stdio server:

```json
{
  "mcpServers": {
    "trading-signals": {
      "command": "npx",
      "args": ["@tradeforge/mcp"],
      "env": { "CC_MCP_HOST": "127.0.0.1", "CC_MCP_PORT": "60051" }
    }
  }
}
```

The agent gets `get_status`, `open_position` and `close_position`. Your strategy code does not change.

---

## Why

**The agent decides *when and which way* — the engine decides *everything else*.** An LLM given raw exchange API keys is a liability: one hallucinated parameter and it buys the wrong size at the wrong price with no stop. Here the agent's whole vocabulary is five tools, and the open command carries only `symbol`, `position` and a human-readable `description`. Take profit, stop-loss and entry cost are computed by tradeforge (fixed 50% moonbag TP; hard stop snapped to a 2.5% grid strictly below `CC_MAX_STOPLOSS_DISTANCE_PERCENT`; cost from the MCP schema). Every command passes the same validation chain — MCP → strategy → risk profiles → actions — as any other signal source, and an open against a symbol that already holds a position is rejected by the engine, not by prompt engineering.

**Text-first status built for LLM consumption.** `get_status` returns one message per traded symbol with the current price, invested balance, the queued entry order, the active position with unrealized PnL and the queued close order. Empty slots are stated explicitly ("Entry queue: empty") so the model never has to guess whether a field was omitted or just missing — the difference between an agent that reasons and one that hallucinates. A custom `getMessages` in the schema can replace or extend the default renderer, including base64 chart images, which map 1:1 onto MCP image content blocks.

**Two processes, one contract.** The stdio MCP server lives in the agent's world and holds no trading state; it forwards every call over HTTP to the trading process. Handlers always answer `200` — transport success is not operation success — with the outcome in an envelope: `error` is an empty string on success and the engine's exact message (`MCP Error: symbol BTCUSDT is not enabled for trading`) on failure, which the tool relays to the agent as an `isError` result it can read and react to.

- 🛠️ **Five guarded tools** — `get_status`, `open_position`, `close_position`, `average_position`, `notify_user`; nothing else is exposed, and `--tools` narrows even that.
- 🧷 **Engine-owned levels** — moonbag TP/SL and entry cost are computed server-side; the agent cannot override them.
- 💬 **Human-readable portfolio** — per-symbol text messages with explicit empty slots; images supported.
- 🔌 **Process isolation** — stdio server ↔ HTTP bridge ↔ trading engine; stdout carries only JSON-RPC.
- ✅ **At-most-once semantics** — commands reuse tradeforge's `commitCreateSignal` / `commitClosePending` machinery.
- 🧪 **Testable** — `IMCPCallbacks` (`onStatus`, `onPositionOpen`, `onPositionClose`) fire after each accepted effect with the raw data it was built from.

---

## Configuration

<details>
<summary>Explicit parameters & environment variables</summary>

```typescript
import { setConfig } from '@tradeforge/mcp';
setConfig({
  CC_MCP_HOST: '127.0.0.1',
  CC_MCP_PORT: 60051,
  CC_MCP_NAME: 'my-mcp',
});
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_MCP_HOST` | `127.0.0.1` | Host the HTTP bridge listens on (trading process) and connects to (stdio process) |
| `CC_MCP_PORT` | `60051` | Port of the HTTP bridge |
| `CC_MCP_NAME` | _(empty)_ | MCP schema to use when several are registered; empty = the first registered schema |

Values passed to `setConfig()` always take precedence over env vars.

</details>

<details>
<summary>Command-line arguments (stdio server or sse)</summary>

When the package runs as the **stdio MCP server** (`npx @tradeforge/mcp`, the `tradeforge-mcp` command, or `node build/index.mjs`), the bridge address can be passed as CLI arguments instead of env vars:

```bash
npx -y @tradeforge/mcp@latest --host 127.0.0.1 --port 60051
```

```json
{
  "mcpServers": {
    "trading-signals": {
      "command": "npx",
      "args": ["@tradeforge/mcp@latest", "--host", "127.0.0.1", "--port", "60051"]
    }
  }
}
```

or

```bash
npx -y @tradeforge/mcp@latest --sse 8081
```

```bash
claude mcp add --transport sse trading-signals http://localhost:8081/sse
```

| Argument | Overrides | Description |
|----------|-----------|-------------|
| `--host` | `CC_MCP_HOST` | Host of the HTTP bridge to connect to |
| `--port` | `CC_MCP_PORT` | Port of the HTTP bridge; a non-numeric value is ignored |
| `--tools` | — | Comma-separated tool names to expose; omitted means all five |
| `--sse [PORT]` | — | Serve the MCP protocol over SSE instead of stdio; defaults to port `8080` |

Resolution order for host and port: **CLI arguments → `setConfig()` → env vars → defaults** (`127.0.0.1:60051`).

CLI arguments apply **only in binary mode** — an entrypoint guard (`helpers/getEntry.ts`) makes sure that when the package is imported as a library, the host process's `argv` never leaks into the configuration.

</details>

<details>
<summary>Narrowing the tool surface with <code>--tools</code></summary>

By default the stdio server registers all five tools. `--tools` takes a comma-separated list of tool names and registers **only** those — the rest never appear in the agent's tool list at all, so no prompt engineering is needed to keep the agent away from them:

```bash
# Read-only agent: it can watch the portfolio but not touch it
npx @tradeforge/mcp --tools get_status

# Observe and exit, but never open or average
npx @tradeforge/mcp --tools get_status,close_position,notify_user
```

```json
{
  "mcpServers": {
    "trading-signals": {
      "command": "npx",
      "args": ["@tradeforge/mcp", "--tools", "get_status,close_position"]
    }
  }
}
```

Valid names are exactly the tool names the agent sees: `get_status`, `open_position`, `close_position`, `average_position`, `notify_user`. An unknown name **fails the startup** with the list of unknown and available names — a typo silently dropping a tool would only surface later as odd agent behaviour.

This is transport-level narrowing, independent of the engine's `permissions` field in the MCP schema. The two compose: `--tools` decides what the agent is offered, `permissions` decides what the engine accepts. Restricting a tool here is convenient for running several agents against one trading process with different mandates; enforcing the boundary for real belongs in the schema, which the agent cannot bypass.

</details>

<details>
<summary>Serving over the network with <code>--sse</code></summary>

By default the server speaks **stdio**: the agent spawns the process and talks to it over stdin/stdout. `--sse` swaps that for **SSE over HTTP**, so a client can attach across the network instead of owning the process:

```bash
# Default port 8080
npx @tradeforge/mcp --sse

# Explicit port
npx @tradeforge/mcp --sse 9000
```

Two endpoints are exposed:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/sse` | GET | Opens the long-lived event stream; responds with the `sessionId` to post to |
| `/messages?sessionId=…` | POST | Delivers one client→server JSON-RPC message |

SSE is a two-channel transport: the `GET` stream stays open for the whole session and carries every server→client message, while the client `POST`s its own messages to the second endpoint. The `sessionId` handed out on connect correlates the two, so **several clients can attach at once** — each gets its own session and closing one does not disturb the others.

Point a connector that bridges an external MCP endpoint to a local HTTP one at `http://localhost:8080/sse`. The startup line is written to **stderr**, never stdout, so the same binary can be piped either way without corrupting a JSON-RPC stream.

`--sse` composes with everything else — `--tools` still narrows the surface, `--host` / `--port` still point at the trading bridge (those describe where the *engine* lives, which is unrelated to how the *agent* connects):

```bash
npx @tradeforge/mcp --tools get_status --sse 9000
```

**The optional value is positional**, so a path immediately after the flag is read as the port:

```bash
npx @tradeforge/mcp --sse ./strategy.ts   # ✗ fails: "./strategy.ts" is not a port
npx @tradeforge/mcp ./strategy.ts --sse   # ✓ path first, then the flag
```

A non-port value **fails the startup** rather than being ignored — silently treating it as "no port given" would swallow the strategy path and start with nothing loaded.

</details>

---

## API reference

| Export | Description |
|--------|-------------|
| `serve(callback?)` | Start the HTTP bridge in the trading process (singleshot; safe to call twice). |
| `getRouter()` | The underlying request handler — mount it into your own HTTP server instead of `serve()`. |
| `setConfig(config)` | Override host/port/name at runtime. |
| `getConfig()` | The current merged configuration (env + any `setConfig` overrides). |
| `setLogger(logger)` | Replace the internal no-op logger with your own implementation. |
| `lib` | The IoC container (`mcpCommandService`, `mcpPublicService`, `mcpPrivateService`) for advanced wiring and tests. |

Running the package binary (`npx @tradeforge/mcp`, the installed `tradeforge-mcp` command, or `node build/index.mjs`) starts the **stdio MCP server** — that side needs no imports, only `CC_MCP_HOST`/`CC_MCP_PORT` pointing at the trading process.

---

## The 5 tools

| Tool | Arguments | What the agent gets |
|------|-----------|---------------------|
| **get_status** | — | One message per traded symbol: current price, invested balance, queued entry order, active position with unrealized PnL (% and USD), queued close order. |
| **open_position** | `symbol`, `position` (`long` \| `short`), `description` | Opens at market price with engine-computed TP/SL/cost. Fails if the symbol is not live-enabled or already has an active position. |
| **close_position** | `symbol`, `description` | Queues a market close of the active position. Fails if there is nothing to close. |
| **average_position** | `symbol` | Adds a DCA entry at market price with the configured entry cost. Fails if there is no active position. |
| **notify_user** | `symbol`, `description` | Attaches a description to the active position, surfaced back in `get_status`. Fails if there is no active position. |

Every command is queued and executes on a live tick, so its effect shows up in `get_status` after roughly 5 minutes — the tool descriptions tell the agent not to resubmit meanwhile. The `description` arguments render as markdown, so detailed multi-line write-ups are encouraged over one-liners.

Use `--tools` (see Configuration) to expose only a subset of them.

Every failure reaches the agent as an `isError` tool result carrying the engine's exact error message — the agent is expected to call `get_status` first and react to rejections, not retry blindly.

---

## How it works

<details>
<summary>Two-process architecture</summary>

```
agent (Claude / any MCP client)
  └─ stdio JSON-RPC ─ tradeforge-mcp          (this package, binary)
       tools/*.tool.ts
       └─ MCPCommandService ── HTTP POST ──► serve()   (this package, imported)
                                              routes/mcp.ts
                                              └─ MCPPublicService ─► MCP.* (tradeforge)
                                                                      └─ Live.commitCreateSignal / commitClosePending
```

The stdio process never touches trading state — it only speaks HTTP. The trading process registers schemas, runs `Live`, and answers on `/api/v1/mcp/*`. Both roles ship in one package: importing it gives you `serve()`, executing it starts the stdio server (an entrypoint guard makes the side-effect import a no-op in library mode).

</details>

<details>
<summary>Always-200 envelope</summary>

HTTP handlers never signal operation failure through status codes. Every response is `200` with:

```json
{ "data": …, "status": "ok",    "error": "",                          "requestId": "…", "serviceName": "…" }
{            "status": "error", "error": "MCP Error: no active position for BTCUSDT" }
```

`MCPCommandService` throws when `error` is non-empty; the tool catches and returns the message to the agent as `isError`. Transport-level failures (engine down, wrong port) surface the same way via `fetchApi`'s exception.

</details>

<details>
<summary>Endpoints</summary>

| Endpoint | Method | Body `data` | Maps to |
|----------|--------|-------------|---------|
| `/api/v1/mcp/get_status` | POST | — | `MCP.getStatus(mcpName)` |
| `/api/v1/mcp/commit_position_open` | POST | `{ symbol, position, note }` | `MCP.commitPositionOpen(dto)` |
| `/api/v1/mcp/commit_position_close` | POST | `{ symbol, note }` | `MCP.commitPositionClose(dto)` |
| `/api/v1/mcp/commit_average_buy` | POST | `{ symbol }` | `MCP.commitAverageBuy(dto)` |
| `/api/v1/mcp/commit_signal_notify` | POST | `{ symbol, note }` | `MCP.commitSignalNotify(dto)` |
| `/api/v1/health/health_check` | GET | — | uptime / memory / CPU snapshot |

Request envelope: `{ clientId, serviceName, userId, requestId, data }`. The `mcpName` is resolved server-side: `CC_MCP_NAME` if set, otherwise the first registered schema — the agent never needs to know it.

</details>

---

## Architecture

<details>
<summary>Layers & files</summary>

**Public surface** — `functions/serve.function.ts` (`serve`/`getRouter`), `functions/setup.function.ts` (`setLogger`), `config/params.ts` (`setConfig`/`getConfig`), `index.ts` re-exports + `lib` container.

**Stdio server** — `main/entry.ts` (McpServer + StdioServerTransport, entrypoint-guarded via `helpers/getEntry.ts`, `--tools` selection via `helpers/getArgs.ts`), `tools/get_status.tool.ts`, `tools/open_position.tool.ts`, `tools/close_position.tool.ts`, `tools/average_position.tool.ts`, `tools/notify_user.tool.ts` (zod-validated arguments, `isError` mapping).

**HTTP bridge** — `config/router.ts` (micro + router + CORS, `/api/v1/mcp/*` mount), `routes/mcp.ts` (five POST handlers, always-200 envelope), `routes/health.ts`.

**Service layer** (`lib/services/`):
- `command/MCPCommandService.ts` — HTTP client used by the tools (`fetchApi` against `CC_MCP_HOST:CC_MCP_PORT`).
- `public/MCPPublicService.ts` — server-side entry: resolves `mcpName` (`CC_MCP_NAME` or first schema), validates arguments, delegates down.
- `private/MCPPrivateService.ts` — thin logging proxy over the tradeforge `MCP` singleton.
- `base/LoggerService.ts` — no-op by default (keeps stdio stdout clean); swap via `setLogger`.

**DI & config** — `lib/core/{di,provide,types}.ts`, `lib/index.ts` (container bootstrap), `utils/omit.ts` (log payload trimming).

</details>

## 🤝 Contribute

Fork / PR on [GitHub](https://github.com/tripolskypetr/backtest-kit).

## 📜 License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
