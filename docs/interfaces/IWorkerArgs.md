---
title: docs/interface/IWorkerArgs
group: docs
---

# IWorkerArgs

Base registration arguments shared by every worker run mode.

A worker binds a run mode to optional strategy and exchange references;
the symbol list is NOT part of the schema — it is passed to Worker.run,
which forks ONE child process for the whole list. Everything left out is
resolved implicitly from the registries at run time — a setup with one
strategy and one exchange needs nothing but a name and a mode flag.

## Properties

### workerName

```ts
workerName: string
```

Unique worker identifier for the schema registry

### strategyName

```ts
strategyName: string
```

Strategy to run. Optional: defaults to the single registered strategy; ambiguous (2+ registered) requires it

### exchangeName

```ts
exchangeName: string
```

Exchange to run on. Optional: defaults to the single registered exchange; ambiguous (2+ registered) requires it

### callbacks

```ts
callbacks: Partial<IWorkerCallbacks>
```

Lifecycle callbacks (all optional)
