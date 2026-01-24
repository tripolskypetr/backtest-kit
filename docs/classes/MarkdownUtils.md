---
title: docs/class/MarkdownUtils
group: docs
---

# MarkdownUtils

Utility class for managing markdown report services.

Provides methods to enable/disable markdown report generation across
different service types (backtest, live, walker, performance, etc.).

Typically extended by MarkdownAdapter for additional functionality.

## Constructor

```ts
constructor();
```

## Properties

### enable

```ts
enable: ({ backtest: bt, breakeven, heat, live, partial, performance, strategy, risk, schedule, walker, }?: Partial<IMarkdownTarget>) => (...args: any[]) => any
```

Enables markdown report services selectively.

Subscribes to specified markdown services and returns a cleanup function
that unsubscribes from all enabled services at once.

Each enabled service will:
- Start listening to relevant events
- Accumulate data for reports
- Generate markdown files when requested

IMPORTANT: Always call the returned unsubscribe function to prevent memory leaks.

### disable

```ts
disable: ({ backtest: bt, breakeven, heat, live, partial, performance, risk, strategy, schedule, walker, }?: Partial<IMarkdownTarget>) => void
```

Disables markdown report services selectively.

Unsubscribes from specified markdown services to stop report generation.
Use this method to stop markdown report generation for specific services while keeping others active.

Each disabled service will:
- Stop listening to events immediately
- Stop accumulating data for reports
- Stop generating markdown files
- Free up event listener and memory resources

Unlike enable(), this method does NOT return an unsubscribe function.
Services are unsubscribed immediately upon calling this method.
