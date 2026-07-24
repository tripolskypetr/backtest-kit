---
title: docs/interface/ISimulatorRuleBans
group: docs
---

# ISimulatorRuleBans

Trained ban dictionary of ONE rule: pure threshold arithmetic —
an author is allowed exactly when his track under this rule's
metric reaches minAuthorTrack ideas at minAuthorHitRate quality.
No ranking is involved: bans are properties of rules, not of
winners.

## Properties

### holdMinutes

```ts
holdMinutes: number
```

Grading window of the rule, minutes — the point's own hold.

### minAuthorTrack

```ts
minAuthorTrack: number
```

Minimum known-outcome ideas the rule requires.

### minAuthorHitRate

```ts
minAuthorHitRate: number
```

Minimum hit rate (0..1) the rule requires.

### profitLockPercent

```ts
profitLockPercent: number
```

Grading level; present on reach and retain rules only.

### hardStopPercent

```ts
hardStopPercent: number
```

Shakeout stop bound; present on reach rules only.

### trailingTakePercent

```ts
trailingTakePercent: number
```

Arming pullback; present on trail rules only.

### authorStats

```ts
authorStats: ISimulatorAuthorStat[]
```

Per-author track records under this rule (sorted by ideas).

### allowedAuthors

```ts
allowedAuthors: string[]
```

Authors allowed by this rule.

### bannedAuthors

```ts
bannedAuthors: string[]
```

Authors banned by this rule (default-ban included).
