---
title: docs/interface/IPersistBase
group: docs
---

# IPersistBase

Persistence interface for custom adapters.
Defines only the essential CRUD operations required for persistence.
Custom adapters should implement this interface.

Architecture:
- IPersistBase: Public API for custom adapters (4 methods: waitForInit, readValue, hasValue, writeValue)
- PersistBase: Default implementation with internal keys() method for validation
- TPersistBaseCtor: Constructor type requiring IPersistBase

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
