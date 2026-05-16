---
title: docs/interface/IPersistStateInstance
group: docs
---

# IPersistStateInstance

Per-context state persistence instance interface.
Scoped to a specific (signalId, bucketName) pair.

Used by StatePersistInstance for crash-safe strategy state storage.
Custom adapters should implement this interface to override the default
file-based state behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this state context.

### readStateData

```ts
readStateData: () => Promise<StateData>
```

Read persisted state for this context.

### writeStateData

```ts
writeStateData: (data: StateData, when: Date) => Promise<void>
```

Write state for this context.

### dispose

```ts
dispose: () => void
```

Release any resources held by this instance.
Default implementations may treat this as a no-op.
