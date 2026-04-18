---
title: docs/class/SessionUtils
group: docs
---

# SessionUtils

Manages isolation of global event-bus state between backtest sessions.
Allows temporarily detaching all subject subscriptions so that one session
does not interfere with another, then restoring them afterwards.

## Constructor

```ts
constructor();
```

## Properties

### createSnapshot

```ts
createSnapshot: () => RestoreSnapshot
```

Snapshots the current listener state of every global subject by replacing
their internal `_events` map with an empty object.
