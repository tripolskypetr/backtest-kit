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
