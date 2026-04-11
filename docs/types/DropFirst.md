---
title: docs/type/DropFirst
group: docs
---

# DropFirst

```ts
type DropFirst<T extends (...args: any) => any> = T extends (first: any, ...rest: infer R) => any ? R : never;
```

Utility type to drop the first argument from a function type.
For example, for `(symbol: string, arg1: number, arg2: string) =&gt; Promise&lt;void&gt;`,
this will infer `[arg1: number, arg2: string]`.
