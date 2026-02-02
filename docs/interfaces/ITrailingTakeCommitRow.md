---
title: docs/interface/ITrailingTakeCommitRow
group: docs
---

# ITrailingTakeCommitRow

Queued trailing take commit.

## Properties

### action

```ts
action: "trailing-take"
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
