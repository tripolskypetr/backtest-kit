---
title: docs/class/PersistCandleUtils
group: docs
---

# PersistCandleUtils

Utility class for managing candles cache persistence.

Features:
- Each candle stored as separate JSON file: ${exchangeName}/${symbol}/${interval}/${timestamp}.json
- Cache validation: returns cached data if file count matches requested limit
- Automatic cache invalidation and refresh when data is incomplete
- Atomic read/write operations

Used by ClientExchange for candle data caching.

## Constructor

```ts
constructor();
```

## Properties

### PersistCandlesFactory

```ts
PersistCandlesFactory: any
```

### getCandlesStorage

```ts
getCandlesStorage: any
```

### readCandlesData

```ts
readCandlesData: (symbol: string, interval: CandleInterval, exchangeName: string, limit: number, sinceTimestamp: number, untilTimestamp: number) => Promise<ICandleData[]>
```

Reads cached candles for a specific exchange, symbol, and interval.
Returns candles only if cache contains exactly the requested limit.

### writeCandlesData

```ts
writeCandlesData: (candles: ICandleData[], symbol: string, interval: CandleInterval, exchangeName: string) => Promise<void>
```

Writes candles to cache with atomic file writes.
Each candle is stored as a separate JSON file named by its timestamp.

## Methods

### usePersistCandleAdapter

```ts
usePersistCandleAdapter(Ctor: TPersistBaseCtor<string, CandleData>): void;
```

Registers a custom persistence adapter.

### useJson

```ts
useJson(): void;
```

Switches to the default JSON persist adapter.
All future persistence writes will use JSON storage.

### useDummy

```ts
useDummy(): void;
```

Switches to a dummy persist adapter that discards all writes.
All future persistence writes will be no-ops.
