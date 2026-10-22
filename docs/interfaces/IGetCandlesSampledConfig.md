---
title: docs/interface/IGetCandlesSampledConfig
group: docs
---

# IGetCandlesSampledConfig

## Properties

### nativeInterval

```ts
nativeInterval: string
```

Interval the exchange natively serves (e.g. "1d" for Yahoo Finance), as
opposed to `interval` — the one the engine asks for. `interval` must be
equal to it or divide it evenly. Default: "1d".
