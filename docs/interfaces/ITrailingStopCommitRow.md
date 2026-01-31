---
title: docs/interface/ITrailingStopCommitRow
group: docs
---

# ITrailingStopCommitRow

Queued trailing stop commit.

## Properties

### action

```ts
action: "trailing-stop"
```

Discriminator

### percentShift

```ts
percentShift: number
```

Percentage shift applied

### currentPrice

```ts
currentPrice: number
```

Price at which trailing was set
