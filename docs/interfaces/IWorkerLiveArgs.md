---
title: docs/interface/IWorkerLiveArgs
group: docs
---

# IWorkerLiveArgs

Worker running every symbol through the live pipeline
(Live.background) with real trading — all symbols of one Worker.run
call share a single child process.

## Properties

### live

```ts
live: true
```

Discriminator for type-safe union: run the live pipeline
