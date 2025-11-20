---
title: docs/api-reference/type/TPersistBaseCtor
group: docs
---

# TPersistBaseCtor

```ts
type TPersistBaseCtor<EntityName extends string = string, Entity extends IEntity = IEntity> = new (entityName: EntityName, baseDir: string) => IPersistBase<Entity>;
```

Constructor type for PersistBase.
Used for custom persistence adapters.
