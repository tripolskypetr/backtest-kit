---
title: docs/interface/ISimulatorTestResult
group: docs
---

# ISimulatorTestResult

Result of an out-of-sample test: ONE frozen grid point evaluated
over fresh ideas with a FROZEN author track record. Nothing is
trained on the test data — the honesty run() deliberately skips
(lookahead inside train) is provided here.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol the test ran for.

### ideasTotal

```ts
ideasTotal: number
```

Total ideas of the symbol received (including NEUTRAL).

### ideasDirectional

```ts
ideasDirectional: number
```

Directional ideas tested (NEUTRAL and flood duplicates excluded).

### profileCount

```ts
profileCount: number
```

Number of idea profiles built (ideas with candle data).

### truncatedCount

```ts
truncatedCount: number
```

Profiles cut short by end of candle data.

### point

```ts
point: ISimulatorGridPoint
```

The frozen grid point the test evaluated (from the train run).

### report

```ts
report: ISimulatorPointReport
```

Out-of-sample report of the point (same metrics as in run()).

### trades

```ts
trades: ISimulatorTrade[]
```

Trades of the point over the test range.

### authorStats

```ts
authorStats: ISimulatorAuthorStat[]
```

The FROZEN author stats the test was gated by: raw ideas/hits
come from the train run verbatim, the banned flag is re-derived
under the tested point's ban rule. Test outcomes never feed back
into these numbers.

### allowedAuthors

```ts
allowedAuthors: string[]
```

Logins allowed under the frozen stats and the point's ban rule.

### bannedAuthors

```ts
bannedAuthors: string[]
```

Logins banned on the test range: train authors failing the rule
PLUS authors seen only in the test feed (unproven = banned).

### avgHoldMinutes

```ts
avgHoldMinutes: number
```

Mean holding time across the test trades, minutes.

### p95HoldMinutes

```ts
p95HoldMinutes: number
```

95th percentile of holding time, minutes.

### p99HoldMinutes

```ts
p99HoldMinutes: number
```

99th percentile of holding time, minutes.
