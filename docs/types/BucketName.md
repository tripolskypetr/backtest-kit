---
title: docs/type/BucketName
group: docs
---

# BucketName

```ts
type BucketName = string;
```

Logical namespace for grouping state buckets within a signal, e.g. "trade" or "metrics".
Used to scope state values for different purposes within the same signal — e.g. "trade" bucket for tracking peakPercent and minutesOpen, "metrics" bucket for tracking other LLM confirmation metrics.
