---
title: docs/type/CacheFileKeyArgs
group: docs
---

# CacheFileKeyArgs

```ts
type CacheFileKeyArgs<T extends CacheFileFunction> = [
    symbol: string,
    alignMs: number,
    ...rest: DropFirst$1<T>
];
```

Extracts the `key` generator argument tuple from a `CacheFileFunction`.
The first two arguments are always `symbol: string` and `alignMs: number` (aligned timestamp),
followed by the rest of the original function's arguments.

For example, for a function type `(symbol: string, arg1: number, arg2: string) =&gt; Promise&lt;void&gt;`,
this type will produce the tuple `[symbol: string, alignMs: number, arg1: number, arg2: string]`.
