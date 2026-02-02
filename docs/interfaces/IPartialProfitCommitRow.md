---
title: docs/interface/IPartialProfitCommitRow
group: docs
---

# IPartialProfitCommitRow

Queued partial profit commit.

## Properties

### action

```ts
action: "partial-profit"
```

Discriminator

### percentToClose

```ts
percentToClose: number
```

Percentage of position closed

### currentPrice

```ts
currentPrice: number
```

Price at which partial was executed
