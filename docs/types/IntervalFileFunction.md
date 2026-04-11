---
title: docs/type/IntervalFileFunction
group: docs
---

# IntervalFileFunction

```ts
type IntervalFileFunction = (symbol: string, ...args: any[]) => Promise<any>;
```

Async function type for file-interval functions.
First argument is always `symbol: string`, followed by optional spread args.
