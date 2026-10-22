---
title: docs/interface/IBudgetReleaseDto
group: docs
---

# IBudgetReleaseDto

`release`: give the reserve `id` back to free and book its pnl on capital

## Properties

### id

```ts
id: string
```

Reserve identifier passed to `reserve`

### pnl

```ts
pnl: number
```

Realized pnl of the position in quote currency (added to capital). Default: 0

### note

```ts
note: string
```

Optional human-readable note stored on the row
