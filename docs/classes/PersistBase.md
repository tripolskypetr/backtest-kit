---
title: docs/class/PersistBase
group: docs
---

# PersistBase

Implements `IPersistBase`

Base class for file-based persistence with atomic writes.

Features:
- Atomic file writes using writeFileAtomic
- Auto-validation and cleanup of corrupted files
- Async generator support for iteration
- Retry logic for file deletion

## Constructor

```ts
constructor(entityName: EntityName, baseDir: string);
```

## Properties

### entityName

```ts
entityName: EntityName
```

### baseDir

```ts
baseDir: string
```

### _directory

```ts
_directory: string
```

Computed directory path for entity storage

### __@BASE_WAIT_FOR_INIT_SYMBOL@1695

```ts
__@BASE_WAIT_FOR_INIT_SYMBOL@1695: (() => Promise<void>) & ISingleshotClearable
```

## Methods

### _getFilePath

```ts
_getFilePath(entityId: EntityId): string;
```

Computes file path for entity ID.

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initialize persistence directory and validate existing files.
Uses singleshot to ensure one-time execution.

### readValue

```ts
readValue<T extends IEntity = IEntity>(entityId: EntityId): Promise<T>;
```

Read entity from persistence storage.

### hasValue

```ts
hasValue(entityId: EntityId): Promise<boolean>;
```

Check if entity exists in storage.

### writeValue

```ts
writeValue<T extends IEntity = IEntity>(entityId: EntityId, entity: T): Promise<void>;
```

Write entity to storage with atomic file writes.

### keys

```ts
keys(): AsyncGenerator<EntityId>;
```

Async generator yielding all entity IDs.
Sorted alphanumerically.
Used internally by waitForInit for validation.
