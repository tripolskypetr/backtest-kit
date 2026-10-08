---
title: docs/interface/IWorkerRunParams
group: docs
---

# IWorkerRunParams

Options of WorkerUtils.run.

Every field has an automatic fallback, so callers pass a Partial of
this interface — an empty object (or nothing) accepts every default.

## Properties

### workerPath

```ts
workerPath: string
```

Path to the worker entry module. Default: the process's own entry script (process.argv[1], symlinks unwrapped)

### workerName

```ts
workerName: string
```

Worker to resolve. Default: the first registered one
