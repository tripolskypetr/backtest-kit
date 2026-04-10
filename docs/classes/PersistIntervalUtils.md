---
title: docs/class/PersistIntervalUtils
group: docs
---

# PersistIntervalUtils

Persistence layer for Interval.file once-per-interval signal firing.

Stores fired-interval markers under `./dump/data/interval/`.
A record's presence means the interval has already fired for that bucket+key;
absence means the function has not yet fired (or returned null last time).

## Constructor

```ts
constructor();
```

## Properties

### PersistIntervalFactory

```ts
PersistIntervalFactory: any
```

### getIntervalStorage

```ts
getIntervalStorage: any
```

### readIntervalData

```ts
readIntervalData: (bucket: string, key: string) => Promise<IntervalData>
```

Reads interval data for a given bucket and key.

### writeIntervalData

```ts
writeIntervalData: (data: IntervalData, bucket: string, key: string) => Promise<void>
```

Writes interval data to disk.

### removeIntervalData

```ts
removeIntervalData: (bucket: string, key: string) => Promise<void>
```

Marks an interval entry as removed (soft delete — file is kept on disk).
After this call `readIntervalData` for the same key returns `null`,
so the function will fire again on the next `IntervalFileInstance.run` call.

## Methods

### usePersistIntervalAdapter

```ts
usePersistIntervalAdapter(Ctor: TPersistBaseCtor<string, IntervalData>): void;
```

Registers a custom persistence adapter.

### listIntervalData

```ts
listIntervalData(bucket: string): AsyncGenerator<string>;
```

Async generator yielding all non-removed entity keys for a given bucket.
Used by `IntervalFileInstance.clear()` to iterate and soft-delete all entries.

### clear

```ts
clear(): void;
```

Clears the memoized storage cache.
Call this when process.cwd() changes between strategy iterations.

### useJson

```ts
useJson(): void;
```

Switches to the default JSON persist adapter.

### useDummy

```ts
useDummy(): void;
```

Switches to a dummy persist adapter that discards all writes.
