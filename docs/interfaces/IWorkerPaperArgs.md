---
title: docs/interface/IWorkerPaperArgs
group: docs
---

# IWorkerPaperArgs

Worker running every symbol through the live pipeline
(Live.background) without placing real orders — all symbols of one
Worker.run call share a single child process.

## Properties

### paper

```ts
paper: true
```

Discriminator for type-safe union: run the live pipeline in paper mode
