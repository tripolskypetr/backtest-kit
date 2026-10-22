---
title: docs/interface/IAverageBuyDto
group: docs
---

# IAverageBuyDto

DCA entry DTO accepted by commitAverageBuy.
A plain number is accepted as well and means { cost }.

## Properties

### cost

```ts
cost: number
```

Cost of the new entry in USD. Default: GLOBAL_CONFIG.CC_POSITION_ENTRY_COST

### note

```ts
note: string
```

Optional note stored on the entry row (ISignalEntry.note)
