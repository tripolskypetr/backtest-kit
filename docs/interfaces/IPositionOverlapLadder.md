---
title: docs/interface/IPositionOverlapLadder
group: docs
---

# IPositionOverlapLadder

Tolerance zone configuration for DCA overlap detection.
Percentages are in 0–100 format (e.g. 5 means 5%).

## Properties

### upperPercent

```ts
upperPercent: number
```

Upper tolerance in percent (0–100): how far above each DCA level to flag as overlap

### lowerPercent

```ts
lowerPercent: number
```

Lower tolerance in percent (0–100): how far below each DCA level to flag as overlap
