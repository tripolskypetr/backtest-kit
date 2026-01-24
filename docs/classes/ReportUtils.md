---
title: docs/class/ReportUtils
group: docs
---

# ReportUtils

Utility class for managing report services.

Provides methods to enable/disable JSONL event logging across
different service types (backtest, live, walker, performance, etc.).

Typically extended by ReportAdapter for additional functionality.

## Constructor

```ts
constructor();
```

## Properties

### enable

```ts
enable: ({ backtest: bt, breakeven, heat, live, partial, performance, risk, schedule, walker, strategy, }?: Partial<IReportTarget>) => (...args: any[]) => any
```

Enables report services selectively.

Subscribes to specified report services and returns a cleanup function
that unsubscribes from all enabled services at once.

Each enabled service will:
- Start listening to relevant events
- Write events to JSONL files in real-time
- Include metadata for filtering and analytics

IMPORTANT: Always call the returned unsubscribe function to prevent memory leaks.

### disable

```ts
disable: ({ backtest: bt, breakeven, heat, live, partial, performance, risk, schedule, walker, strategy, }?: Partial<IReportTarget>) => void
```

Disables report services selectively.

Unsubscribes from specified report services to stop event logging.
Use this method to stop JSONL logging for specific services while keeping others active.

Each disabled service will:
- Stop listening to events immediately
- Stop writing to JSONL files
- Free up event listener resources

Unlike enable(), this method does NOT return an unsubscribe function.
Services are unsubscribed immediately upon calling this method.
