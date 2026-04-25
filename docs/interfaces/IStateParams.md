---
title: docs/interface/IStateParams
group: docs
---

# IStateParams

Parameters for createSignalState — bucket name and default value shape.

## Properties

### bucketName

```ts
bucketName: string
```

Logical namespace for grouping state buckets within a signal, e.g. "trade" or "metrics".

### initialValue

```ts
initialValue: Value
```

Default value used when no persisted state exists for the signal.
