---
title: docs/type/IWorkerSchema
group: docs
---

# IWorkerSchema

```ts
type IWorkerSchema = IWorkerBacktestArgs | IWorkerPaperArgs | IWorkerLiveArgs;
```

Registration schema of a worker instance.

Discriminated union over the run mode: exactly one of the backtest,
paper or live flags picks the pipeline Worker.run starts in the forked
child process owning the whole symbol list of the call.
- workerName — registry key; duplicate registration is a validation error.
- strategyName / exchangeName / frameName — optional: when omitted, the
  SINGLE registered schema of that kind is used; with two or more
  registered the worker must name one explicitly — ambiguity is an
  error, not a guess.
- callbacks — all optional; an omitted callback is simply never fired.
