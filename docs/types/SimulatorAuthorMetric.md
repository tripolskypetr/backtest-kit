---
title: docs/type/SimulatorAuthorMetric
group: docs
---

# SimulatorAuthorMetric

```ts
type SimulatorAuthorMetric = "close" | "reach";
```

Metric that defines an author's "hit" for the ban filter:
- "close" — the idea's 5-day horizon close moved in its direction
  (rewards authors whose calls survive a long hold);
- "reach" — the idea's MFE reached the point's profit-lock level
  before its pre-peak MAE reached the hard stop (rewards authors
  whose calls are HARVESTABLE by the lock machinery, even when the
  horizon close goes against them). With profitLockPercent = 0 the
  reach metric falls back to "close".
The right metric depends on the exit style being ranked: close-hit
authors feed long-hold points, reach-hit authors feed lock points.
