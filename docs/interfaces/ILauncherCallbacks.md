---
title: docs/interface/ILauncherCallbacks
group: docs
---

# ILauncherCallbacks

Lifecycle callbacks of a launcher instance (all optional).

An omitted callback is simply never fired.

## Methods

### onWaitForInit

```ts
onWaitForInit: (launcherName: string) => void | Promise<void>
```

Fired before Launcher.run blocks on waitForReady — the place to kick
off lazy schema registration (dynamic imports, remote config) so the
registries fill in while run waits for them.
