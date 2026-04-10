---
title: docs/class/PersistMeasureUtils
group: docs
---

# PersistMeasureUtils

Utility class for managing external API response cache persistence.

Features:
- Memoized storage instances per cache bucket (aligned timestamp + symbol)
- Custom adapter support
- Atomic read/write operations
- Crash-safe cache state management

Used by Cache.file for persistent caching of external API responses.

## Constructor

```ts
constructor();
```

## Properties

### PersistMeasureFactory

```ts
PersistMeasureFactory: any
```

### getMeasureStorage

```ts
getMeasureStorage: any
```

### readMeasureData

```ts
readMeasureData: (bucket: string, key: string) => Promise<MeasureData>
```

Reads cached measure data for a given bucket and key.

### writeMeasureData

```ts
writeMeasureData: (data: MeasureData, bucket: string, key: string) => Promise<void>
```

Writes measure data to disk with atomic file writes.

### removeMeasureData

```ts
removeMeasureData: (bucket: string, key: string) => Promise<void>
```

Marks a cached entry as removed (soft delete — file is kept on disk).
After this call `readMeasureData` for the same key returns `null`.

## Methods

### usePersistMeasureAdapter

```ts
usePersistMeasureAdapter(Ctor: TPersistBaseCtor<string, MeasureData>): void;
```

Registers a custom persistence adapter.

### listMeasureData

```ts
listMeasureData(bucket: string): AsyncGenerator<string>;
```

Async generator yielding all non-removed entity keys for a given bucket.
Used by `CacheFileInstance.clear()` to iterate and soft-delete all entries.

### clear

```ts
clear(): void;
```

Clears the memoized storage cache.
Call this when process.cwd() changes between strategy iterations
so new storage instances are created with the updated base path.

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
