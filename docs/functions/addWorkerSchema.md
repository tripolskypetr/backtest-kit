---
title: docs/function/addWorkerSchema
group: docs
---

# addWorkerSchema

```ts
declare function addWorkerSchema(workerSchema: IWorkerSchema): void;
```

Registers a worker in the framework.

A worker binds a run mode (backtest, paper or live) to optional
strategy, exchange and frame references; the symbol list is NOT part
of the schema — Worker.run receives it per call and forks ONE child
process for the whole list.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `workerSchema` | Worker configuration object |
