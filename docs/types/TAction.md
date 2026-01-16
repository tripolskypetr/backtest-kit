---
title: docs/type/TAction
group: docs
---

# TAction

```ts
type TAction = {
    [key in keyof IAction]: any;
};
```

Type definition for action methods.
Maps all keys of IAction to any type.
Used for dynamic method routing in ActionConnectionService.
