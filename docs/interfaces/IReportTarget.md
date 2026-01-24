---
title: docs/interface/IReportTarget
group: docs
---

# IReportTarget

Configuration interface for selective report service enablement.
Controls which report services should be activated for JSONL event logging.

## Properties

### strategy

```ts
strategy: boolean
```

Enable strategy commit actions

### risk

```ts
risk: boolean
```

Enable risk rejection event logging

### breakeven

```ts
breakeven: boolean
```

Enable breakeven event logging

### partial

```ts
partial: boolean
```

Enable partial close event logging

### heat

```ts
heat: boolean
```

Enable heatmap data event logging

### walker

```ts
walker: boolean
```

Enable walker iteration event logging

### performance

```ts
performance: boolean
```

Enable performance metrics event logging

### schedule

```ts
schedule: boolean
```

Enable scheduled signal event logging

### live

```ts
live: boolean
```

Enable live trading event logging (all tick states)

### backtest

```ts
backtest: boolean
```

Enable backtest closed signal event logging
