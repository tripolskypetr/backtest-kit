---
title: docs/type/SignalNotificationPayload
group: docs
---

# SignalNotificationPayload

```ts
type SignalNotificationPayload = {
    notificationId: string;
    notificationNote: string;
};
```

Optional payload for signal info notifications.
Both fields are optional — omitting notificationNote falls back to the signal's own note.
