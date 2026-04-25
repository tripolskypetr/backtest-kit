---
title: docs/interface/ISessionInstance
group: docs
---

# ISessionInstance

Interface for session instance implementations.
Defines the contract for local, persist, and dummy backends.

Intended use: per-(symbol, strategy, exchange, frame) mutable session data
shared across strategy callbacks within a single run — e.g. caching LLM
inference results, intermediate indicator state, or cross-candle accumulators.

Example shape:
```ts
{ lastLlmSignal: "buy" &vert; "sell" | null; confirmedAt: number }
```

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize the session instance.

### setData

```ts
setData: <Value extends object = object>(value: Value) => Promise<void>
```

Write a new session value.

### getData

```ts
getData: <Value extends object = object>() => Promise<Value>
```

Read the current session value.

### dispose

```ts
dispose: () => Promise<void>
```

Releases any resources held by this instance.
