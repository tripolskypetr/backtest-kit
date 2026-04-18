---
title: docs/interface/IScheduledSignalCancelRow
group: docs
---

# IScheduledSignalCancelRow

Scheduled signal row with cancellation ID.
Extends IScheduledSignalRow to include optional cancelId for user-initiated cancellations.

## Properties

### cancelId

```ts
cancelId: string
```

Cancellation ID (only for user-initiated cancellations)

### cancelNote

```ts
cancelNote: string
```

Note from user payload (only for user-initiated cancellations)
