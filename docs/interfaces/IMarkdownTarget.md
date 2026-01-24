---
title: docs/interface/IMarkdownTarget
group: docs
---

# IMarkdownTarget

Configuration interface for selective markdown service enablement.
Controls which markdown report services should be activated.

## Properties

### strategy

```ts
strategy: boolean
```

Enable strategy event tracking reports (entry/exit signals)

### risk

```ts
risk: boolean
```

Enable risk rejection tracking reports (signals blocked by risk limits)

### breakeven

```ts
breakeven: boolean
```

Enable breakeven event tracking reports (when stop loss moves to entry)

### partial

```ts
partial: boolean
```

Enable partial profit/loss event tracking reports

### heat

```ts
heat: boolean
```

Enable portfolio heatmap analysis reports across all symbols

### walker

```ts
walker: boolean
```

Enable walker strategy comparison and optimization reports

### performance

```ts
performance: boolean
```

Enable performance metrics and bottleneck analysis reports

### schedule

```ts
schedule: boolean
```

Enable scheduled signal tracking reports (signals waiting for trigger)

### live

```ts
live: boolean
```

Enable live trading event reports (all tick events)

### backtest

```ts
backtest: boolean
```

Enable backtest markdown reports (main strategy results with full trade history)
