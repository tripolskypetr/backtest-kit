---
title: docs/type/TAction$1
group: docs
---

# TAction$1

```ts
type TAction$1 = {
    [key in keyof IAction]: any;
};
```

Type definition for action methods.
Maps all keys of IAction to any type.
Used for dynamic method routing in ActionCoreService.
