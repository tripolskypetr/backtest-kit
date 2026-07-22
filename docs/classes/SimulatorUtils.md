---
title: docs/class/SimulatorUtils
group: docs
---

# SimulatorUtils

Public API of the Simulator entity — parameter sweep over crowd
trading ideas.

Finds production strategy parameters (hard stop, trailing take,
hold duration, entry consensus threshold) by profiling every idea
with one candle pass and evaluating the whole grid arithmetically
from the profiles. The result carries four ranking winners
(Sharpe, Sortino, PnL), the trained author whitelist/ban list and
per-point reports with trade-level detail.

The simulator picks candidates — validation of the chosen
parameters MUST be a real engine backtest (Backtest.run).

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: (dto: { symbol: string; simulatorName: string; ideas: ISimulatorIdea[]; }) => Promise<ISimulatorResult>
```

Runs the full simulation for a symbol through the service
stack (global -&gt; core/connection -&gt; ClientSimulator):
profiles -&gt; author filter training -> grid evaluation ->
rankings. The referenced simulator schema must be registered
via addSimulatorSchema beforehand.

### test

```ts
test: (dto: { symbol: string; simulatorName: string; ideas: ISimulatorIdea[]; point: ISimulatorGridPoint; authorStats: ISimulatorAuthorStat[]; }) => Promise<...>
```

Out-of-sample test of parameters picked by run(): evaluates
ONE frozen grid point over fresh ideas with a FROZEN author
track record. Nothing is trained on the test data — authors
unseen in the frozen stats are banned by default, test
outcomes never feed back into the stats. This is the honesty
step run() deliberately skips (its author training uses
lookahead inside the train range).
