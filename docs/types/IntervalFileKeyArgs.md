---
title: docs/type/IntervalFileKeyArgs
group: docs
---

# IntervalFileKeyArgs

```ts
type IntervalFileKeyArgs<T extends IntervalFileFunction> = [
    symbol: string,
    alignMs: number,
    ...rest: DropFirst<T>
];
```

Extracts the `key` generator argument tuple from an `IntervalFileFunction`.
The first two arguments are always `symbol: string` and `alignMs: number` (aligned timestamp),
followed by the rest of the original function's arguments.

For example, for `(symbol: string, arg1: number) =&gt; Promise&lt;void&gt;`,
this will produce `[symbol: string, alignMs: number, arg1: number]`.
