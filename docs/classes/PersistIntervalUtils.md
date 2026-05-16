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

### PersistIntervalInstanceCtor

```ts
PersistIntervalInstanceCtor: any
```

Constructor used to create per-bucket interval marker instances.
Replaceable via usePersistIntervalAdapter() / useJson() / useDummy().

### getIntervalStorage

```ts
getIntervalStorage: any
```

Memoized factory creating one IPersistIntervalInstance per bucket.

### readIntervalData

```ts
readIntervalData: (bucket: string, key: string) => Promise<IntervalData>
```

Reads an interval marker from the given bucket by key.
Lazily initializes the bucket instance on first access.

### writeIntervalData

```ts
writeIntervalData: (data: IntervalData, bucket: string, key: string, when: Date) => Promise<void>
```

Writes an interval marker to the given bucket under the given key.
Lazily initializes the bucket instance on first access.

### removeIntervalData

```ts
removeIntervalData: (bucket: string, key: string) => Promise<void>
```

Soft-deletes a marker in the given bucket by setting `removed: true`.
Lazily initializes the bucket instance on first access.

## Methods

### usePersistIntervalAdapter

```ts
usePersistIntervalAdapter(Ctor: TPersistIntervalInstanceCtor): void;
```

Registers a custom IPersistIntervalInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.

### listIntervalData

```ts
listIntervalData(bucket: string): AsyncGenerator<string>;
```

Iterates all non-removed markers for the given bucket.
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

Switches to the default file-based PersistIntervalInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistIntervalDummyInstance (all operations are no-ops).
