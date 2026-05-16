---
title: docs/interface/IPersistMeasureInstance
group: docs
---

# IPersistMeasureInstance

Per-bucket measure cache persistence instance interface.
Used by Cache.file for caching external API responses.

Supports soft delete: removed entries stay on disk with `removed: true`
flag and are filtered out by read/list operations.

Custom adapters should implement this interface to override the default
file-based measure cache behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this bucket.

### readMeasureData

```ts
readMeasureData: (key: string) => Promise<MeasureData>
```

Read cached entry by key.

### writeMeasureData

```ts
writeMeasureData: (data: MeasureData, key: string, when: Date) => Promise<void>
```

Write entry to cache.

### removeMeasureData

```ts
removeMeasureData: (key: string) => Promise<void>
```

Soft-delete an entry by setting its `removed` flag.
File stays on disk, but subsequent reads return null.

### listMeasureData

```ts
listMeasureData: () => AsyncGenerator<string, any, any>
```

Iterate all non-removed entry keys for this bucket.
