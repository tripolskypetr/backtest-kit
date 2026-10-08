---
title: docs/interface/IWorkerCallbacks
group: docs
---

# IWorkerCallbacks

Lifecycle callbacks of a worker instance (all optional).

An omitted callback is simply never fired.

## Methods

### onWaitForInit

```ts
onWaitForInit: (workerName: string) => void | Promise<void>
```

Fired before Worker.run blocks on waitForReady — the place to kick
off lazy schema registration (dynamic imports, remote config) so the
registries fill in while run waits for them.
