---
title: docs/type/SimulatorAuthorMetric
group: docs
---

# SimulatorAuthorMetric

```ts
type SimulatorAuthorMetric = "close" | "reach" | "retain" | "pnl" | "trail";
```

Metric that defines an author's "hit" for the ban filter. EVERY
metric is graded inside the POINT'S OWN hold window — the first
holdMinutes of the idea's trajectory: the author is judged by
exactly the window the point can trade, never on a farther event
nobody harvests (the profile itself is built to the grid's
longest hold — that is the candle fetch depth, not the grading
window):
- "close" — the window's last close moved in the idea's direction
  (rewards authors whose calls survive the hold);
- "reach" — the idea's MFE inside the window reached the point's
  profit-lock level before its pre-peak MAE reached the hard stop
  (rewards authors whose calls are HARVESTABLE by the lock
  machinery, even when the window close goes against them).
  Requires a target: reach points with profitLockPercent = 0 are
  excluded from the grid;
- "retain" — FIXATION above the point's profit-lock level: the
  MEDIAN move of the window is strictly above profitLockPercent,
  i.e. price sat above entry + lock for at least half the window
  (the median is the 50% quantile by definition — not a tunable
  constant). Requires a target like reach: retain points with
  profitLockPercent = 0 are excluded from the grid. A transient
  spike (reach's hit) and a lucky last-candle finish (close's
  hit) are both misses here. Independent of the point's stop;
- "pnl" — the window's MFE grew by MORE than the fixed +1%
  threshold, INDEPENDENT of the point's lock and stop.
  Complements "retain": pnl asks "did it ever pay", retain asks
  "did it hold above the level";
- "trail" — the idea's favorable excursion inside the window
  reached the ARMING level of the point's trailing take (peak at
  entry/(1 - r) — the same formula the trade machinery uses):
  rewards the authors a trailing point actually earns on, the
  exact symmetry of "reach" for the lock. Requires a live
  trailing: trail points with trailingTakePercent outside
  (0, 100) are excluded from the grid (an inert trailing has no
  arming level to grade).
The right metric depends on the exit style being ranked: close-hit
authors feed long-hold points, reach-hit authors feed lock points,
retain-hit authors feed points that need the move to HOLD,
trail-hit authors feed trailing points.
