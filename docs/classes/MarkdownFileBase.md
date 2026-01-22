---
title: docs/class/MarkdownFileBase
group: docs
---

# MarkdownFileBase

Implements `TMarkdownBase`

JSONL-based markdown adapter with append-only writes.

Features:
- Writes markdown reports as JSONL entries to a single file per markdown type
- Stream-based writes with backpressure handling
- 15-second timeout protection for write operations
- Automatic directory creation
- Error handling via exitEmitter
- Search metadata for filtering (symbol, strategy, exchange, frame, signalId)

File format: ./dump/markdown/{markdownName}.jsonl
Each line contains: markdownName, data, symbol, strategyName, exchangeName, frameName, signalId, timestamp

Use this adapter for centralized logging and post-processing with JSONL tools.

## Constructor

```ts
constructor(markdownName: keyof IMarkdownTarget);
```

## Properties

### markdownName

```ts
markdownName: keyof IMarkdownTarget
```

### _filePath

```ts
_filePath: string
```

Absolute path to the JSONL file for this markdown type

### _stream

```ts
_stream: WriteStream
```

WriteStream instance for append-only writes, null until initialized

### _baseDir

```ts
_baseDir: string
```

Base directory for all JSONL markdown files

### __@WAIT_FOR_INIT_SYMBOL@1959

```ts
__@WAIT_FOR_INIT_SYMBOL@1959: (() => Promise<void>) & ISingleshotClearable
```

Singleshot initialization function that creates directory and stream.
Protected by singleshot to ensure one-time execution.
Sets up error handler that emits to exitEmitter.

### __@WRITE_SAFE_SYMBOL@1960

```ts
__@WRITE_SAFE_SYMBOL@1960: (line: string) => Promise<symbol | void>
```

Timeout-protected write function with backpressure handling.
Waits for drain event if write buffer is full.
Times out after 15 seconds and returns TIMEOUT_SYMBOL.

## Methods

### waitForInit

```ts
waitForInit(): Promise<void>;
```

Initializes the JSONL file and write stream.
Safe to call multiple times - singleshot ensures one-time execution.

### dump

```ts
dump(data: string, options: IMarkdownDumpOptions): Promise<void>;
```

Writes markdown content to JSONL file with metadata.
Appends a single line with JSON object containing:
- markdownName: Type of report
- data: Markdown content
- Search flags: symbol, strategyName, exchangeName, frameName, signalId
- timestamp: Current timestamp in milliseconds
