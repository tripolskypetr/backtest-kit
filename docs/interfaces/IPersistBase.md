---
title: docs/interface/IPersistBase
group: docs
---

# IPersistBase

Persistence interface for CRUD operations.
Implemented by PersistBase.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize persistence directory and validate existing files.
Uses singleshot to ensure one-time execution.

### readValue

```ts
readValue: (entityId: EntityId) => Promise<Entity>
```

Read entity from persistence storage.

### hasValue

```ts
hasValue: (entityId: EntityId) => Promise<boolean>
```

Check if entity exists in storage.

### writeValue

```ts
writeValue: (entityId: EntityId, entity: Entity) => Promise<void>
```

Write entity to storage with atomic file writes.

### keys

```ts
keys: () => AsyncGenerator<EntityId, any, any>
```

Async generator yielding all entity IDs.
