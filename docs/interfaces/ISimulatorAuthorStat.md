---
title: docs/interface/ISimulatorAuthorStat
group: docs
---

# ISimulatorAuthorStat

Trained per-author track record (train = the whole simulated range).
Ban is the default: an author is allowed only when his correctness
is unambiguously proven by enough fully observed ideas. The ban
thresholds are grid axes (minAuthorTrack, minAuthorHitRate) — the
banned flag is relative to the rule of a concrete grid point.

## Properties

### author

```ts
author: string
```

Author login on the source platform.

### ideas

```ts
ideas: number
```

Directional ideas with a KNOWN outcome (truncated ones excluded).

### hits

```ts
hits: number
```

Number of the author's hits UNDER THE RULE'S METRIC: horizon
close in the idea direction for "close", lock-reachability for
"reach" — the same author has different hit counts under
different rules.

### hitRate

```ts
hitRate: number
```

hits / ideas, 0..1; zero when the author has no known outcomes.

### banned

```ts
banned: boolean
```

Author is banned under the ban rule these stats were computed
with. True when the track is too short to judge (ideas &lt;
minAuthorTrack) OR the hit rate is below minAuthorHitRate OR the
Wilson lower bound of the hit rate is below minAuthorWilson
(when that bound is enabled). Unproven correctness = banned.
