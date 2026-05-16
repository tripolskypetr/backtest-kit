---
title: docs/interface/IPersistSessionInstance
group: docs
---

# IPersistSessionInstance

Per-context session persistence instance interface.
Scoped to a specific (strategyName, exchangeName, frameName) triple.

Used by SessionPersistInstance for crash-safe session storage.
Custom adapters should implement this interface to override the default
file-based session behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this session context.

### readSessionData

```ts
readSessionData: () => Promise<SessionData>
```

Read persisted session data for this context.

### writeSessionData

```ts
writeSessionData: (data: SessionData, when: Date) => Promise<void>
```

Write session data for this context.

### dispose

```ts
dispose: () => void
```

Release any resources held by this instance.
Default implementations may treat this as a no-op.
