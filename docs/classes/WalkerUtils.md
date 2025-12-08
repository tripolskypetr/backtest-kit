---
title: docs/api-reference/class/WalkerUtils
group: docs
---

# WalkerUtils

Utility class for walker operations.

Provides simplified access to walkerCommandService.run() with logging.
Automatically pulls exchangeName and frameName from walker schema.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

### _getInstance

```ts
_getInstance: any
```

Memoized function to get or create WalkerInstance for a symbol-walker pair.
Each symbol-walker combination gets its own isolated instance.

### run

```ts
run: (symbol: string, context: { walkerName: string; }) => AsyncGenerator<WalkerContract, any, any>
```

Runs walker comparison for a symbol with context propagation.

### background

```ts
background: (symbol: string, context: { walkerName: string; }) => () => void
```

Runs walker comparison in background without yielding results.

Consumes all walker progress updates internally without exposing them.
Useful for running walker comparison for side effects only (callbacks, logging).

### stop

```ts
stop: (symbol: string, walkerName: string) => Promise<void>
```

Stops all strategies in the walker from generating new signals.

Iterates through all strategies defined in walker schema and:
1. Sends stop signal via walkerStopSubject (interrupts current running strategy)
2. Sets internal stop flag for each strategy (prevents new signals)

Current active signals (if any) will complete normally.
Walker will stop at the next safe point.

Supports multiple walkers running on the same symbol simultaneously.
Stop signal is filtered by walkerName to prevent interference.

### getData

```ts
getData: (symbol: string, walkerName: string) => Promise<IWalkerResults>
```

Gets walker results data from all strategy comparisons.

### getReport

```ts
getReport: (symbol: string, walkerName: string) => Promise<string>
```

Generates markdown report with all strategy comparisons for a walker.

### dump

```ts
dump: (symbol: string, walkerName: string, path?: string) => Promise<void>
```

Saves walker report to disk.

### list

```ts
list: () => Promise<{ symbol: string; walkerName: string; status: "pending" | "fulfilled" | "rejected" | "ready"; }[]>
```

Lists all active walker instances with their current status.
