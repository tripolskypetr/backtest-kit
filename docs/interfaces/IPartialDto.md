---
title: docs/interface/IPartialDto
group: docs
---

# IPartialDto

Partial close DTO accepted by commitPartialProfit / commitPartialLoss.
A plain number is accepted as well and means { percent }.

## Properties

### percent

```ts
percent: number
```

Percentage of the REMAINING position to close (0-100)

### note

```ts
note: string
```

Optional note stored on the partial row (ISignalPartial.note)
