---
title: docs/type/SearchSettings
group: docs
---

# SearchSettings

```ts
type SearchSettings = {
    BM25_K1: number;
    BM25_B: number;
    BM25_SCORE: number;
};
```

Tuning parameters for BM25 full-text search scoring.
Controls term frequency saturation, document length normalization, and minimum score threshold.
