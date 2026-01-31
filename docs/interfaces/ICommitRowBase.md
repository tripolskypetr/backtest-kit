---
title: docs/interface/ICommitRowBase
group: docs
---

# ICommitRowBase

Base interface for queued commit events.
Used to defer commit emission until proper execution context is available.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol

### backtest

```ts
backtest: boolean
```

Whether running in backtest mode
