---
title: docs/type/SessionData
group: docs
---

# SessionData

```ts
type SessionData = {
    id: string;
    data: object | null;
};
```

Session data structure for session persistence.
Each session is identified by a unique id and contains an arbitrary JSON-serializable data object.
