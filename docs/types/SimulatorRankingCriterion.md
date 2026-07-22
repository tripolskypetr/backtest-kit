---
title: docs/type/SimulatorRankingCriterion
group: docs
---

# SimulatorRankingCriterion

```ts
type SimulatorRankingCriterion = "sharpe" | "sortino" | "pnl" | "recovery";
```

Ranking criterion for picking grid winners. "recovery" ranks by
recoveryFactor (total PnL / max series drawdown); a calmar ranking
would produce the IDENTICAL ordering — within one run calmar is
recoveryFactor times a constant (365/days of the shared bucket
window) — so only the raw criterion exists.
