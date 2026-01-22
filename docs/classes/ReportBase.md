---
title: docs/class/ReportBase
group: docs
---

# ReportBase

Implements `TReportBase`

JSONL-based report adapter with append-only writes.

Features:
- Writes events as JSONL entries to a single file per report type
- Stream-based writes with backpressure handling
- 15-second timeout protection for write operations
- Automatic directory creation
- Error handling via exitEmitter
- Search metadata for filtering (symbol, strategy, exchange, frame, signalId, walkerName)

File format: ./dump/report/{reportName}.jsonl
Each line contains: reportName, data, metadata, timestamp

Use this adapter for event logging and post-processing analytics.

## Constructor

```ts
constructor(reportName: keyof IReportTarget, baseDir: string);
```

## Properties

### reportName

```ts
reportName: keyof IReportTarget
```

### baseDir

```ts
baseDir: string
```

### _filePath

```ts
_filePath: string
```

Absolute path to the JSONL file for this report type

### _stream

```ts
_stream: WriteStream
```

WriteStream instance for append-only writes, null until initialized

### __@WAIT_FOR_INIT_SYMBOL$1@1895

```ts
__@WAIT_FOR_INIT_SYMBOL$1@1895: (() => Promise<void>) & ISingleshotClearable
```

Singleshot initialization function that creates directory and stream.
Protected by singleshot to ensure one-time execution.
Sets up error handler that emits to exitEmitter.

### __@WRITE_SAFE_SYMBOL$1@1896

```ts
__@WRITE_SAFE_SYMBOL$1@1896: (line: string) => Promise<symbol | void>
```

Timeout-protected write function with backpressure handling.
Waits for drain event if write buffer is full.
Times out after 15 seconds and returns TIMEOUT_SYMBOL.

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the JSONL file and write stream.
Safe to call multiple times - singleshot ensures one-time execution.

### write

```ts
write<T = any>(data: T, options: IReportDumpOptions): Promise<void>;
```

Writes event data to JSONL file with metadata.
Appends a single line with JSON object containing:
- reportName: Type of report
- data: Event data object
- Search flags: symbol, strategyName, exchangeName, frameName, signalId, walkerName
- timestamp: Current timestamp in milliseconds
