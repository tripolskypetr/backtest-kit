---
title: docs/type/IPublicAction
group: docs
---

# IPublicAction

```ts
type IPublicAction = {
    [key in keyof IAction]?: IAction[key];
} & {
    init?(): void | Promise<void>;
};
```

Public action interface for custom action handler implementations.

Extends IAction with an initialization lifecycle method.
Action handlers implement this interface to receive strategy events and perform custom logic.

Lifecycle:
1. Constructor called with (strategyName, frameName, actionName)
2. init() called once for async initialization (setup connections, load resources)
3. Event methods called as strategy executes (signal, breakeven, partialProfit, etc.)
4. dispose() called once for cleanup (close connections, flush buffers)

Key features:
- init() for async initialization (database connections, API clients, file handles)
- All IAction methods available for event handling
- dispose() guaranteed to run exactly once via singleshot pattern

Common use cases:
- State management: Redux/Zustand store integration
- Notifications: Telegram/Discord/Email alerts
- Logging: Custom event tracking and monitoring
- Analytics: Metrics collection and reporting
- External systems: Database writes, API calls, file operations
