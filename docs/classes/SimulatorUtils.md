---
title: docs/class/SimulatorUtils
group: docs
---

# SimulatorUtils

Public API of the Simulator entity — parameter sweep over crowd
trading ideas. Profiles every idea with ONE candle pass and
evaluates the whole grid arithmetically from the profiles; the
result carries four ranking winners (sharpe / sortino / pnl /
recovery), each with the author artifact under ITS OWN ban rule,
plus per-point reports with trade-level detail.

Parameter map — what each knob tunes and when it is ignored
(full per-field contracts live in ISimulatorGridAxes and
ISimulatorSchema):

Exit axes (always active in trade simulation):
- hardStopPercent — catastrophe exit; wins an ambiguous candle.
- trailingTakePercent — pullback from the peak; inert for trades
  whose peak never reaches the arm level entry/(1 - r).
- profitLockPercent — floor armed by touching +X%, exit on the
  pullback to it; 0 disables; runners are picked up by the
  trailing take instead.
- holdMinutes — slot turnover cap; a busy slot absorbs qualified
  ideas (absorbedIdeaIds); time_expired is the worst-case exit.

Entry gate (preprocessing of every candidate entry): any idea of
an UNBANNED author triggers an entry. Authors are graded strictly
in isolation — interaction metrics (consensus counting, vote
weighting, Wilson bounds) do not exist here by design: swarm
ranking over long histories is userspace.

Ban rule (author filter, trained on the whole run range):
- minAuthorTrack / minAuthorHitRate — default-ban thresholds;
  truncated profiles prove nothing; the ban is strictly below the
  rate threshold.
- authorMetric — hit definition, ALWAYS graded inside the point's
  own hold window: "close" = window close (lock/stop do NOT
  affect ban training), "reach" = lock-reachability against the
  point's lock/stop, "retain" = fixation above the point's lock
  (median move strictly above profitLockPercent), "pnl" = fixed
  +1% MFE threshold, "trail" = arming reachability of the point's
  trailing take; reach and retain require lock &gt; 0, trail
  requires trailing in (0, 100) — the inert combinations are
  excluded from the grid.

Run-level config (not swept, ignored by test()):
- reportOrder — ranking criterion ordering each metric bucket's
  reports (descending, tie-guarded comparator); default "sharpe".
  Purely presentational: never affects winners or ban lists.

The result is a per-metric dictionary: every swept authorMetric
gets its own bucket with its own reports, its own four ranking
winners and its own trained ban dictionaries (bans — one entry
per unique rule, threshold arithmetic only). Nothing is ever
aggregated across metrics.

The simulator picks candidates — honest confirmation is a
walk-forward test() shot, and the final arbiter for the chosen
parameters is a real engine backtest (Backtest.run).

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

What is silently dropped from the input before any math —
ideas of OTHER symbols (one shared feed serves every run),
NEUTRAL ideas, and flood duplicates (at most one idea per
author per direction per 8h; a dropped repost neither extends
the window nor votes). Ideas at the data edge get truncated
profiles: they trade to the edge but are IGNORED as
ban-training evidence; an idea whose first candle chunk is
beyond the edge is dropped entirely (null profile).

How the grid is applied — the schema's gridAxes merge PER-AXIS
over the engine defaults (an omitted axis is swept with the
default list; a single-value list freezes it), then every
point of the cartesian product is evaluated arithmetically
from the same profiles; see ISimulatorGridAxes for each axis'
tune/ignore contract. Ranking winners honor the anti-fluke
floor PER metric bucket (a point below MIN_TRADES_FOR_BEST
trades can win only when NO point of its bucket clears the
floor).

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
