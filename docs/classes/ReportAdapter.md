---
title: docs/class/ReportAdapter
group: docs
---

# ReportAdapter

Extends `ReportUtils`

Report adapter with pluggable storage backend and instance memoization.

Features:
- Adapter pattern for swappable storage implementations
- Memoized storage instances (one per report type)
- Default adapter: ReportBase (JSONL append)
- Lazy initialization on first write
- Real-time event logging to JSONL files

Used for structured event logging and analytics pipelines.

## Constructor

```ts
constructor();
```

## Methods

### useReportAdapter

```ts
useReportAdapter(Ctor: TReportBaseCtor): void;
```

Sets the report storage adapter constructor.
All future report instances will use this adapter.

### clear

```ts
clear(): void;
```

Clears the memoized storage cache.
Call this when process.cwd() changes between strategy iterations
so new storage instances are created with the updated base path.

### useDummy

```ts
useDummy(): void;
```

Switches to a dummy report adapter that discards all writes.
All future report writes will be no-ops.

### useJsonl

```ts
useJsonl(): void;
```

Switches to the default JSONL report adapter.
All future report writes will use JSONL storage.
