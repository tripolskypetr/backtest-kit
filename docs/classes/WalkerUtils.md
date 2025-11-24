---
title: docs/api-reference/class/WalkerUtils
group: docs
---

# WalkerUtils

Utility class for walker operations.

Provides simplified access to walkerGlobalService.run() with logging.
Automatically pulls exchangeName and frameName from walker schema.
Exported as singleton instance for convenient usage.

## Constructor

```ts
constructor();
```

## Properties

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
