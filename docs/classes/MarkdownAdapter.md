---
title: docs/class/MarkdownAdapter
group: docs
---

# MarkdownAdapter

Extends `MarkdownUtils`

Markdown adapter with pluggable storage backend and instance memoization.

Features:
- Adapter pattern for swappable storage implementations
- Memoized storage instances (one per markdown type)
- Default adapter: MarkdownFolderBase (separate files)
- Alternative adapter: MarkdownFileBase (JSONL append)
- Lazy initialization on first write
- Convenience methods: useMd(), useJsonl()

## Constructor

```ts
constructor();
```

## Methods

### useMarkdownAdapter

```ts
useMarkdownAdapter(Ctor: TMarkdownBaseCtor): void;
```

Sets the markdown storage adapter constructor.
All future markdown instances will use this adapter.

### useMd

```ts
useMd(): void;
```

Switches to folder-based markdown storage (default).
Shorthand for useMarkdownAdapter(MarkdownFolderBase).
Each dump creates a separate .md file.

### useJsonl

```ts
useJsonl(): void;
```

Switches to JSONL-based markdown storage.
Shorthand for useMarkdownAdapter(MarkdownFileBase).
All dumps append to a single .jsonl file per markdown type.

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
