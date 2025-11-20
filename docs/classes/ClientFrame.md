---
title: docs/api-reference/class/ClientFrame
group: docs
---

# ClientFrame

Implements `IFrame`

Client implementation for backtest timeframe generation.

Features:
- Generates timestamp arrays for backtest iteration
- Singleshot caching prevents redundant generation
- Configurable interval spacing (1m to 3d)
- Callback support for validation and logging

Used by BacktestLogicPrivateService to iterate through historical periods.

## Constructor

```ts
constructor(params: IFrameParams);
```

## Properties

### params

```ts
params: IFrameParams
```

### getTimeframe

```ts
getTimeframe: ((symbol: string) => Promise<Date[]>) & ISingleshotClearable
```

Generates timeframe array for backtest period.
Results are cached via singleshot pattern.
