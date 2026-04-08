---
title: docs/class/MarkdownWriterAdapter
group: docs
---

# MarkdownWriterAdapter

Markdown writer with pluggable storage backend and instance memoization.

Features:
- Adapter pattern for swappable storage implementations (folder, JSONL, dummy)
- Memoized storage instances (one per markdown type)
- Default adapter: MarkdownFolderBase (one .md file per report)
- Lazy initialization on first write

Use `useMd()` for human-readable folder output, `useJsonl()` for centralized
append-only logging, or `useDummy()` to suppress all markdown output.

## Constructor

```ts
constructor();
```

## Properties

### MarkdownFactory

```ts
MarkdownFactory: any
```

Current markdown storage adapter constructor.
Defaults to MarkdownFolderBase for per-file storage.
Can be changed via useMarkdownAdapter().

### getMarkdownStorage

```ts
getMarkdownStorage: any
```

Memoized storage instances cache.
Key: markdownName (backtest, live, walker, etc.)
Value: TMarkdownBase instance created with current MarkdownFactory.
Ensures single instance per markdown type for the lifetime of the application.

## Methods

### useMarkdownAdapter

```ts
useMarkdownAdapter(Ctor: TMarkdownBaseCtor): void;
```

Sets the markdown storage adapter constructor.
All future markdown instances will use this adapter.

### writeData

```ts
writeData(markdownName: MarkdownName, content: string, options: IMarkdownDumpOptions): Promise<void>;
```

Writes markdown content to storage using the configured adapter.
Automatically initializes storage on first write for each markdown type.

### useMd

```ts
useMd(): void;
```

Switches to the folder-based markdown adapter (default).
Each report is written as a separate .md file.

### useJsonl

```ts
useJsonl(): void;
```

Switches to the JSONL markdown adapter.
All reports are appended to a single .jsonl file per markdown type.

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

Switches to a dummy markdown adapter that discards all writes.
All future markdown writes will be no-ops.
