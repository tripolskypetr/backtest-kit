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

### PersistMeasureInstanceCtor

```ts
PersistMeasureInstanceCtor: any
```

Constructor used to create per-bucket measure cache instances.
Replaceable via usePersistMeasureAdapter() / useJson() / useDummy().

### getMeasureStorage

```ts
getMeasureStorage: any
```

Memoized factory creating one IPersistMeasureInstance per bucket.

### readMeasureData

```ts
readMeasureData: (bucket: string, key: string) => Promise<MeasureData>
```

Reads a measure entry from the given bucket by key.
Lazily initializes the bucket instance on first access.

### writeMeasureData

```ts
writeMeasureData: (data: MeasureData, bucket: string, key: string, when: Date) => Promise<void>
```

Writes a measure entry to the given bucket under the given key.
Lazily initializes the bucket instance on first access.

### removeMeasureData

```ts
removeMeasureData: (bucket: string, key: string) => Promise<void>
```

Soft-deletes a measure entry in the given bucket by setting `removed: true`.
Lazily initializes the bucket instance on first access.

## Methods

### usePersistMeasureAdapter

```ts
usePersistMeasureAdapter(Ctor: TPersistMeasureInstanceCtor): void;
```

Registers a custom IPersistMeasureInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.

### listMeasureData

```ts
listMeasureData(bucket: string): AsyncGenerator<string>;
```

Iterates all non-removed measure entries for the given bucket.
Lazily initializes the bucket instance on first access.

### clear

```ts
clear(): void;
```

Clears the memoized bucket instance cache.
Call when process.cwd() changes between strategy iterations.

### useJson

```ts
useJson(): void;
```

Switches to the default file-based PersistMeasureInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistMeasureDummyInstance (all operations are no-ops).
