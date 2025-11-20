---
title: docs/api-reference/interface/IPersistBase
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

### readValue

```ts
readValue: (entityId: EntityId) => Promise<Entity>
```

### hasValue

```ts
hasValue: (entityId: EntityId) => Promise<boolean>
```

### writeValue

```ts
writeValue: (entityId: EntityId, entity: Entity) => Promise<void>
```
