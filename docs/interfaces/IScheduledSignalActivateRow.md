---
title: docs/interface/IScheduledSignalActivateRow
group: docs
---

# IScheduledSignalActivateRow

Scheduled signal row with activation ID.
Extends IScheduledSignalRow to include optional activateId for user-initiated activations.

## Properties

### activateId

```ts
activateId: string
```

Activation ID (only for user-initiated activations)

### activateNote

```ts
activateNote: string
```

Note from user payload (only for user-initiated activations)
