---
title: docs/function/addLauncherSchema
group: docs
---

# addLauncherSchema

```ts
declare function addLauncherSchema(launcherSchema: ILauncherSchema): void;
```

Registers a launcher in the framework.

A launcher binds a run mode (backtest, paper or live) to optional
strategy, exchange and frame references resolved at launch time.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `launcherSchema` | Launcher configuration object |
