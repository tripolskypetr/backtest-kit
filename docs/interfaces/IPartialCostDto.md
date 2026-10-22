---
title: docs/interface/IPartialCostDto
group: docs
---

# IPartialCostDto

Partial close DTO accepted by commitPartialProfitCost / commitPartialLossCost.
A plain number is accepted as well and means { cost }.

## Properties

### cost

```ts
cost: number
```

Dollar amount of the position to close

### note

```ts
note: string
```

Optional note stored on the partial row (ISignalPartial.note)
