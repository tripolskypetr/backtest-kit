---
title: docs/interface/IPersistIntervalInstance
group: docs
---

# IPersistIntervalInstance

Per-bucket interval marker persistence instance interface.
Used by Interval.file for once-per-interval signal firing.

A record's presence means the interval has already fired for that
bucket+key. Soft-deleted records (removed=true) act as if absent,
allowing the function to fire again.

Custom adapters should implement this interface to override the default
file-based interval marker behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this bucket.

### readIntervalData

```ts
readIntervalData: (key: string) => Promise<IntervalData>
```

Read interval marker by key.

### writeIntervalData

```ts
writeIntervalData: (data: IntervalData, key: string, when: Date) => Promise<void>
```

Write interval marker.

### removeIntervalData

```ts
removeIntervalData: (key: string) => Promise<void>
```

Soft-delete a marker. After this call the function will fire again
on the next IntervalFileInstance.run call for the same key.

### listIntervalData

```ts
listIntervalData: () => AsyncGenerator<string, any, any>
```

Iterate all non-removed marker keys for this bucket.
