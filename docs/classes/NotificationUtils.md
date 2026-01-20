---
title: docs/class/NotificationUtils
group: docs
---

# NotificationUtils

Public facade for notification operations.

Automatically subscribes on first use and provides simplified access to notification instance methods.

## Constructor

```ts
constructor();
```

## Properties

### _instance

```ts
_instance: any
```

Internal instance containing business logic

## Methods

### getData

```ts
getData(): Promise<NotificationModel[]>;
```

Returns all notifications in chronological order (newest first).
Automatically subscribes to emitters if not already subscribed.

### clear

```ts
clear(): Promise<void>;
```

Clears all notification history.
Automatically subscribes to emitters if not already subscribed.

### enable

```ts
enable(): Promise<void>;
```

Unsubscribes from all notification emitters.
Call this when you no longer need to collect notifications.

### disable

```ts
disable(): Promise<void>;
```

Unsubscribes from all notification emitters.
Call this when you no longer need to collect notifications.
