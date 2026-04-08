---
title: docs/class/ReportWriterAdapter
group: docs
---

# ReportWriterAdapter

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

## Properties

### ReportFactory

```ts
ReportFactory: any
```

Current report storage adapter constructor.
Defaults to ReportBase for JSONL storage.
Can be changed via useReportAdapter().

### getReportStorage

```ts
getReportStorage: any
```

Memoized storage instances cache.
Key: reportName (backtest, live, walker, etc.)
Value: TReportBase instance created with current ReportFactory.
Ensures single instance per report type for the lifetime of the application.

### writeData

```ts
writeData: <T = any>(reportName: keyof IReportTarget, data: T, options: IReportDumpOptions) => Promise<void>
```

Writes report data to storage using the configured adapter.
Automatically initializes storage on first write for each report type.

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
