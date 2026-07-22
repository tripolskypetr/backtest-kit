---
title: docs/interface/ISimulator
group: docs
---

# ISimulator

Public surface of a simulator client.

## Methods

### run

```ts
run: (symbol: string, ideas: ISimulatorIdea[]) => Promise<ISimulatorResult>
```

Runs the full simulation for a symbol over the given ideas:
profiles -&gt; author filter -&gt; grid evaluation -&gt; rankings.

### test

```ts
test: (symbol: string, ideas: ISimulatorIdea[], point: ISimulatorGridPoint, authorStats: ISimulatorAuthorStat[]) => Promise<ISimulatorTestResult>
```

Out-of-sample test: evaluates ONE frozen grid point over fresh
ideas with a FROZEN author track record from a train run.
Profiles are built for the test ideas, but the author filter is
NOT retrained — authors unseen in the frozen stats are banned by
default (unproven = banned).
