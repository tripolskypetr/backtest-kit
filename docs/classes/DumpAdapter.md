---
title: docs/class/DumpAdapter
group: docs
---

# DumpAdapter

Facade for dump instances with swappable backend.
Default backend: DumpMarkdownInstance.

Accepts IDumpContext on every call, constructs a scoped instance per (signalId, bucketName),
and delegates with only the dumpId.

Switch backends via:
- useMarkdown() - write one .md file per call (default)
- useMemory()   - store data in Memory
- useDummy()    - no-op, discard all writes
- useDumpAdapter(Ctor) - inject a custom implementation

## Constructor

```ts
constructor();
```

## Properties

### DumpFactory

```ts
DumpFactory: any
```

### getInstance

```ts
getInstance: any
```

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable<() => (...args: any[]) => any>
```

Activates the adapter by subscribing to signal lifecycle events.
Clears memoized instances for a signalId when it is cancelled or closed,
preventing stale instances from accumulating in memory.
Idempotent — subsequent calls return the same subscription handle.
Must be called before any dump method is used.

### disable

```ts
disable: () => void
```

Deactivates the adapter by unsubscribing from signal lifecycle events.
No-op if enable() was never called.

### dumpAgentAnswer

```ts
dumpAgentAnswer: (messages: MessageModel<MessageRole>[], context: IDumpContext) => Promise<void>
```

Persist the full message history of one agent invocation.

### dumpRecord

```ts
dumpRecord: (record: Record<string, unknown>, context: IDumpContext) => Promise<void>
```

Persist a flat key-value record.

### dumpTable

```ts
dumpTable: (rows: Record<string, unknown>[], context: IDumpContext) => Promise<void>
```

Persist an array of objects as a table.

### dumpText

```ts
dumpText: (content: string, context: IDumpContext) => Promise<void>
```

Persist raw text content.

### dumpError

```ts
dumpError: (content: string, context: IDumpContext) => Promise<void>
```

Persist an error description.

### dumpJson

```ts
dumpJson: (json: object, context: IDumpContext) => Promise<void>
```

Persist an arbitrary nested object as a fenced JSON block.

### useMarkdown

```ts
useMarkdown: () => void
```

Switches to markdown backend (default).
Writes one .md file per call to ./dump/agent/{signalId}/{bucketName}/{dumpId}.md

### useMemory

```ts
useMemory: () => void
```

Switches to memory backend.
Stores data via Memory.writeMemory.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy backend.
All writes are discarded.

### useMarkdownMemoryBoth

```ts
useMarkdownMemoryBoth: () => void
```

Switches to dual-write backend.
Writes to both Memory and Markdown simultaneously.

### useDumpAdapter

```ts
useDumpAdapter: (Ctor: TDumpInstanceCtor) => void
```

Injects a custom dump adapter implementation.
Uses Reflect.construct for ES3/ES6 interop compatibility.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call this when process.cwd() changes between strategy iterations
so new instances are created with the updated base path.
