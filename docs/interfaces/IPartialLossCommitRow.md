---
title: docs/interface/IPartialLossCommitRow
group: docs
---

# IPartialLossCommitRow

Queued partial loss commit.

## Properties

### action

```ts
action: "partial-loss"
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
