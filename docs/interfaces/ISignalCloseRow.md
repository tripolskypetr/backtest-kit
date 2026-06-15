---
title: docs/interface/ISignalCloseRow
group: docs
---

# ISignalCloseRow

Signal row with close ID.
Extends ISignalRow to include optional closeId for user-initiated closes.

## Properties

### closeId

```ts
closeId: string
```

Close ID (only for user-initiated closes)

### closeNote

```ts
closeNote: string
```

Note from user payload (only for user-initiated closes)
