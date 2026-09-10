---
title: docs/interface/IMCPSchema
group: docs
---

# IMCPSchema

Registration schema of an MCP (Model Context Protocol) instance.

Binds an MCP name to a strategy: status and position commands operate on
every live instance of that strategy.
- mcpName — registry key; duplicate registration is a validation error.
- strategyName — the strategy whose live instances the MCP observes and
  trades. Optional: when omitted, the SINGLE registered strategy is used;
  with two or more strategies registered every MCP call throws until the
  schema names one explicitly — ambiguity is an error, not a guess.
- positionCost — entry cost in USD for commitPositionOpen; defaults to
  GLOBAL_CONFIG.CC_POSITION_ENTRY_COST when omitted.
- multiplier — PNL multiplier (leverage) for commitPositionOpen; defaults to
  GLOBAL_CONFIG.CC_SIGNAL_LEVERAGE_MULTIPLIER when omitted.
- permissions — per-method grants for the agent-facing methods; defaults
  to ALL of them when omitted. Listing permissions explicitly narrows the
  agent to exactly those methods; a call to a method whose permission is
  missing throws with an agent-readable denial. The check runs per call,
  so an overridden schema applies immediately.
- getMessages — renders the portfolio snapshot into agent messages; when
  omitted the default renderer emits one text message per symbol.
- callbacks — all optional; an omitted callback is simply never fired.

## Properties

### mcpName

```ts
mcpName: string
```

Unique MCP (Model Context Protocol) identifier for the schema registry

### strategyName

```ts
strategyName: string
```

Strategy whose live instances this MCP (Model Context Protocol) observes and trades. Optional: defaults to the single registered strategy; ambiguous (2+ registered) requires it

### positionCost

```ts
positionCost: number
```

Entry cost in USD for opened positions. Default: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST

### multiplier

```ts
multiplier: number
```

PNL multiplier (leverage) for opened positions. Default: GLOBAL_CONFIG.CC_SIGNAL_LEVERAGE_MULTIPLIER

### isolated

```ts
isolated: boolean
```

Isolated-margin mode for opened positions (force-close at -100% leveraged PNL). Default: GLOBAL_CONFIG.CC_SIGNAL_ISOLATED_MARGIN

### minuteEstimatedTime

```ts
minuteEstimatedTime: number
```

Estimated time in minutes for a position to reach its TP or SL.

### permissions

```ts
permissions: MCPPermission[]
```

Per-method grants for the agent; each permission name gates the agent-facing MCP (Model Context Protocol) method of the same name. Default: all of them

### getMessages

```ts
getMessages: (context: IMCPContext, when: Date, mcpName: string) => IMCPMessage[] | Promise<IMCPMessage[]>
```

Renders the portfolio snapshot into messages for the MCP (Model Context Protocol) agent (default: text per symbol)

### callbacks

```ts
callbacks: Partial<IMCPCallbacks>
```

Lifecycle callbacks (all optional)
