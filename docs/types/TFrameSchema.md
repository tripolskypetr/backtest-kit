---
title: docs/type/TFrameSchema
group: docs
---

# TFrameSchema

```ts
type TFrameSchema = {
    frameName: IFrameSchema["frameName"];
} & Partial<IFrameSchema>;
```

Partial frame schema for override operations.

Requires only the frame name identifier, all other fields are optional.
Used by overrideFrame() to perform partial updates without replacing entire configuration.
