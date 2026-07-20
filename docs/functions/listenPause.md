---
title: docs/function/listenPause
group: docs
---

# listenPause

```ts
declare function listenPause(fn: (event: PauseContract) => void): () => void;
```

Subscribes to strategy pause state changes with queued async processing.
Emits when setPaused actually flips the pause flag of a strategy (new position
opening suspended/resumed; existing signals keep closing normally).
Use this to generate user-facing notifications about pause/resume.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle pause state change events |
