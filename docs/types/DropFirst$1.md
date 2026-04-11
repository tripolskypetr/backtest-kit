---
title: docs/type/DropFirst$1
group: docs
---

# DropFirst$1

```ts
type DropFirst$1<T extends (...args: any) => any> = T extends (first: any, ...rest: infer R) => any ? R : never;
```

Utility type to drop the first argument from a function type.
For example, for a function type `(symbol: string, arg1: number, arg2: string) =&gt; Promise&lt;void&gt;`,
this type will infer the rest of the arguments as `[arg1: number, arg2: string]`.
